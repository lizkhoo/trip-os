# trip-os — Personalizable Travel Itinerary App (PRD)

## Context

You manage trips today by aggregating reservations across many platforms (airlines, hotels, restaurants, activities, transit) into spreadsheets by hand. The source of truth lives in personal email confirmations, but those confirmations are scattered and hard to view as a single coherent trip.

The `japan-2026` repo (vanilla JS + hand-authored `ITINERARY` array + Leaflet map) proves the consumption UX works — day-cards, sub-event timeline, city-grouping, transit-pair directions — but every trip requires manual data entry. **trip-os v1** keeps that UX shape, ships as an iOS app, and replaces the manual aggregation with three ingestion paths: Gmail, drag-and-drop upload (Apple Vision OCR + Claude reasoning), and direct manual edit.

**Intended outcome:** Open the app on iPhone → it syncs your Gmail → confirmations land in a review queue → accept/edit into a structured day-by-day + map itinerary. Add ad-hoc reservations by importing a PDF/screenshot or typing them in.

## Product overview

**Users:** Single user per device. No accounts. Each install is its own world; the user supplies their own Anthropic API key.

**Stack:**
- **App:** React Native + Expo (SDK 51+) + Expo Router (file-based routing)
- **Styling:** NativeWind (Tailwind for React Native)
- **DB:** SQLite via `expo-sqlite` + Drizzle ORM (`drizzle-orm/expo-sqlite`)
- **Secrets:** Expo SecureStore (iOS Keychain) for Anthropic API key + Gmail OAuth tokens
- **Files:** `expo-file-system` writing to `FileSystem.documentDirectory/uploads/`
- **OCR:** Apple Vision via native Swift module (on-device, free, accurate)
- **AI extraction:** Claude API (Anthropic) via raw `fetch` from device
- **Maps:** `react-native-maps` (MapKit on iOS)
- **Gmail OAuth:** `react-native-app-auth` (on-device PKCE flow)
- **Distribution:** TestFlight initially; App Store later

**Scope (in):** Multi-trip support · day-by-day timeline · map view · Gmail ingestion (allowlist primary + label fallback) · drag-and-drop screenshot/PDF upload with on-device OCR + Claude vision extraction · manual CRUD · extraction review queue with confidence scoring · auto-promote ≥ 0.9 · deduplication · last-edit-wins conflict handling · audit trail via `extraction_candidates`.

> The three ingestion paths above have since been joined by a paste box (`source='paste'`) and a
> Files/AirDrop "Open in trip-os" handler. See [input-methods.md](input-methods.md) for the full
> map of shipped and deferred input methods.

**Scope (out, deferred to v1.1):** Multi-device iCloud/CloudKit sync · Android · photos per day · free-text notes · wishlist · reminders/notifications · PDF export · sharing/collaboration · background sync (sync only on app foreground + manual pull-to-refresh).

## Architectural anchors (resolved)

These are decisions already made; subagents should treat them as fixed.

- **All ingestion flows through `extraction_candidates`**, even high-confidence ones. Auto-promote at ≥ 0.9 still leaves the candidate row as audit trail. Lets you tune the threshold or roll back bad Claude runs without re-extracting.
- **No server, no background sync.** Sync triggers: (a) app comes to foreground, (b) pull-to-refresh on review queue, (c) explicit "Sync now" button in settings. iOS background tasks are too unreliable to design around.
- **Apple Vision replaces Tesseract.** On-device, no API cost, more accurate than Tesseract on receipts/screenshots. Wrapped in a Swift native module that takes a file URI and returns `{ text, blocks: [{text, bbox}] }`.
- **Drizzle on SQLite** keeps the typed-domain-layer story intact from the original web-app PRD — the schema looks similar, just SQLite types instead of Postgres types.
- **Email scope:** sender allowlist as primary (`from:(booking.com OR delta.com OR airbnb.com OR ...) newer_than:1y`), Gmail label `trip-os/inbox` as fallback for messages the allowlist misses. User can manage the allowlist in settings.
- **Trip auto-assignment:** incoming reservation date falls inside exactly one trip's range → auto-assign; zero or multiple matches → "needs trip" inbox.
- **Conflict resolution:** every reservation has `manually_edited_at`; re-ingestion never overwrites fields whose row was edited after that timestamp. Per-field provenance is overkill for one user.
- **Multi-night lodging is one row** spanning check-in to check-out; timeline UI renders it on each day in range with a "night N of M" indicator. Don't expand into per-night rows.
- **No `days` table.** Days are derived: `date(start_at, ?)` (SQLite) with the trip's home timezone applied. SQLite stores `start_at` as ISO 8601 strings (with offset) — query helpers in the domain layer.
- **Data layer designed to allow CloudKit sync later (v1.1).** Every row gets a `uuid` PK (not autoincrement int), a `synced_at` nullable column, and an `updated_at` trigger. Don't build CloudKit now; just don't paint yourself into a corner.

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  React Native / Expo app  (runs entirely on device)         │
│                                                             │
│  app/(consumer)/         Itinerary screens: trips, day,    │
│                          timeline, map                     │
│  app/(admin)/review      Extraction review queue            │
│  app/(admin)/upload      Photo library + Files picker       │
│  app/(admin)/connect     Gmail OAuth + settings             │
│  app/(admin)/settings    API key, allowlist, threshold      │
│                                                             │
│  src/domain/             Typed Reservation/Candidate layer  │
│  src/services/           gmail, extract, ocr, storage,      │
│                          candidates, reservations           │
│  src/db/                 Drizzle schema + migrations        │
│  modules/AppleVision/    Swift native module (OCR)          │
└─────────────────────────────────────────────────────────────┘
       │                          │                       │
       ▼                          ▼                       ▼
  Gmail API                Anthropic API            MapKit (RN)
  (on-device fetch)        (on-device fetch)        (rendering)

  All ingestion paths → extraction_candidates → reservations
```

## Data model (SQLite via Drizzle)

```
trips
  id TEXT PK (uuid)
  title TEXT, start_date TEXT, end_date TEXT, home_timezone TEXT
  cover_image_uri TEXT NULL
  created_at, updated_at, synced_at NULL

reservations
  id TEXT PK (uuid)
  trip_id TEXT FK
  type TEXT CHECK (flight|lodging|dining|activity|transit)
  title TEXT
  start_at TEXT (ISO 8601 with offset)
  end_at TEXT NULL
  start_location_id TEXT FK NULL
  end_location_id TEXT FK NULL
  confirmation_code TEXT
  source TEXT CHECK (gmail|upload|manual)
  source_ref TEXT  -- gmail message id, attachment id, or null
  confidence REAL NULL  -- null for manual entries
  status TEXT CHECK (confirmed|cancelled)
  details TEXT (JSON)  -- type-specific: flight_number, room_type, cuisine, operator...
  manually_edited_at TEXT NULL
  created_at, updated_at, synced_at NULL

locations
  id TEXT PK (uuid)
  name TEXT, address TEXT
  lat REAL NULL, lng REAL NULL
  geocode_query TEXT  -- fallback string, also used to build Maps URLs
  place_id TEXT NULL
  timezone TEXT

attachments
  id TEXT PK (uuid)
  reservation_id TEXT FK NULL  -- uploads start unattached
  kind TEXT CHECK (pdf|image)
  storage_uri TEXT  -- FileSystem.documentDirectory/uploads/...
  ocr_text TEXT NULL
  extraction_run_id TEXT
  created_at

extraction_candidates
  id TEXT PK (uuid)
  trip_id TEXT FK NULL  -- needs trip assignment if null
  source TEXT, source_ref TEXT
  raw_text TEXT  -- email body or OCR text
  claude_response TEXT (JSON)
  proposed_reservation TEXT (JSON)  -- shape matches Reservation Zod schema
  confidence REAL
  status TEXT CHECK (pending|accepted|rejected|merged_into)
  merged_into_reservation_id TEXT FK NULL
  created_at

gmail_sync_state  (singleton row id='default')
  last_history_id TEXT
  last_synced_at TEXT
  -- OAuth tokens live in SecureStore (Keychain), NOT in this row

settings  (singleton row id='default')
  anthropic_api_key_present BOOLEAN  -- actual key in SecureStore
  auto_promote_threshold REAL DEFAULT 0.9
  sender_allowlist TEXT (JSON array)
  gmail_label_name TEXT DEFAULT 'trip-os/inbox'
```

**Cross-cutting:**
- All PKs are UUIDs (CloudKit-ready).
- Timezone is mandatory on every `start_at` / `end_at` ingestion — refuse to commit a candidate without an explicit IANA zone (Claude will hallucinate otherwise).
- Dedup keys computed in service layer (not stored):
  - flight: `(carrier, flight_number, date)`
  - lodging: `(property_name fuzzy, check_in_date)`
  - dining/activity: `(name fuzzy, start_at ± 30min)`
  - transit: `(operator, departure_station, start_at ± 30min)`

## Subagent briefs

Run in this order. **Foundation must merge before verticals start.** The three verticals are designed to run in parallel after.

---

### Agent 1: Foundation (ships first, blocks others)

**Goal:** Make the other three agents able to work in parallel without negotiating types, schemas, or primitives.

**Deliverables:**
1. Expo SDK 51+ scaffold (TypeScript strict), Expo Router with the route groups shown in the architecture diagram, NativeWind configured, ESLint + Prettier.
2. SQLite + Drizzle setup. `drizzle-kit` migration files for every table in the data model. Migrations auto-apply on app boot.
3. **Typed domain layer** in `src/domain/`:
   - `reservation.ts` — Zod schemas per reservation type's `details` shape, discriminated union, `Reservation` TS type, `ReservationInput` for creation.
   - `services/reservations.ts` — `createReservation`, `updateReservation`, `listReservationsForTrip(tripId)`, `getReservationsByDay(tripId, isoDate, tripTimezone)`, `findDuplicateReservation(candidate)`.
   - `services/candidates.ts` — `createCandidate`, `listPendingCandidates`, `acceptCandidate(id, edits?)`, `rejectCandidate(id)`, `autoPromoteAboveThreshold(threshold)`.
   - `services/storage.ts` — wraps `expo-file-system`. `put(file, kind) → storageUri`, `get(uri)`, `remove(uri)`. Files land under `FileSystem.documentDirectory/uploads/<yyyy>/<mm>/<uuid>.<ext>`.
   - `services/secrets.ts` — wraps `expo-secure-store`. `getAnthropicKey`, `setAnthropicKey`, `getGmailTokens`, `setGmailTokens`.
4. **Shared UI primitives** in `src/components/ui/` (all NativeWind-styled): `Card`, `Timeline`, `DayHeader`, `ReservationBadge` (color-coded by type), `ConfidenceChip`, `EmptyState`, `Button`, `Input`, `Select`, `DateTimePicker`, `BottomSheet`, `PullToRefresh`. Make these the only blessed primitives — verticals must not roll their own.
5. **Visual system in NativeWind:** color tokens per reservation type, type scale, spacing scale. Mirror japan-2026's visual sensibility (warm, editorial, not "default Material").
6. **Seed script** (`pnpm seed`) that reads `/Users/lizkhoo/Documents/GitHub/japan-2026/js/data.js`, transforms the `ITINERARY` array into one trip + reservations, and inserts via the same services verticals will use. Verticals develop against realistic data immediately.
7. **iOS scaffolding:** `app.config.ts` with bundle id `com.lizkhoo.tripos`, URL scheme `trip-os` (needed for Gmail OAuth callback), iOS deployment target 16+.
8. README covering: prerequisites (Xcode, Node, pnpm, Expo CLI), `pnpm install && pnpm ios`, environment setup, where to put your Anthropic API key (in-app settings, not env).

**Out of scope:** Any UI screen beyond a dev route that lists trip count + a `/dev/primitives` route showcasing every primitive. Any ingestion logic. Any Claude/Vision integration.

**Done when:** `pnpm ios` launches the app in the simulator, migrations apply, `pnpm seed` loads japan-2026 data, the dev home shows trip count > 0, the primitives route renders every component without error.

---

### Agent 2: Gmail ingestion (parallel)

**Depends on:** Foundation merged.

**Goal:** OAuth into Gmail on-device, fetch confirmation emails per the scope rules, extract structured reservations via Claude, write to `extraction_candidates`.

**Deliverables:**
1. `app/(admin)/connect/index.tsx` — Gmail OAuth flow using `react-native-app-auth` (PKCE, native browser). Stores tokens via `services/secrets.setGmailTokens`. Shows connection status + last sync time.
2. `src/services/gmail.ts` — thin client over Gmail REST API using `fetch` (don't import `googleapis` — too heavy for RN). Methods: `searchMessageIds(query, after?)`, `fetchMessage(id)`, `getAttachment(messageId, attachmentId)`. Token refresh handled internally.
3. `src/services/extract.ts` — Claude API client. Reads key from `services/secrets`. Uses Claude's structured-output (tool-use) mode with a tool definition whose input schema mirrors the `Reservation` Zod schema. Explicit IANA timezone requirement in the system prompt. **Use prompt caching on the system prompt** (it's identical every call — big cost win).
4. Sync orchestrator `src/services/syncGmail.ts`:
   - Build query from `settings.sender_allowlist` (primary) + Gmail label `trip-os/inbox` (fallback), with `newer_than:1y` and `after:<last_synced_at>` filters.
   - For each message: fetch body → send to Claude → parse to candidate → dedup check via `findDuplicateReservation` (sets merge mode if hit) → trip auto-assign (single date-range match) → `candidates.createCandidate`.
   - After batch completes: `candidates.autoPromoteAboveThreshold(settings.auto_promote_threshold)`.
   - Update `gmail_sync_state.last_history_id` and `last_synced_at`.
5. **Trigger surface:** export `runGmailSync()` for Agent 4 to call from app foreground / pull-to-refresh / settings "Sync now" button. No background scheduling.
6. Allowlist management UI in `app/(admin)/settings` — list of sender domains, add/remove.

**Reference:** Use the `claude-api` skill when wiring the Anthropic SDK / fetch code — it covers caching, tool use, current model IDs.

**Out of scope:** UI for the review queue (that's Agent 4). The connect screen should be a single button + status indicator using Foundation primitives.

**Done when:** Connecting Gmail on a real inbox and tapping "Sync now" produces `extraction_candidates` rows whose `proposed_reservation` parses cleanly against the Zod schema, with auto-promotion working for high-confidence rows.

---

### Agent 3: Upload + OCR (parallel)

**Depends on:** Foundation merged.

**Goal:** Import screenshots and PDFs from the Photos library or Files app, run on-device Apple Vision OCR, send to Claude for structured extraction, write to `extraction_candidates`.

**Deliverables:**
1. **Native Swift module `modules/AppleVision/`** exposing `recognizeText(uri: string) → Promise<{ text: string, blocks: Array<{text, bbox}> }>` using `VNRecognizeTextRequest`. Handles both single images and PDF pages (rasterize each page with `PDFKit`, OCR each page, concatenate). Document the build steps; this requires `expo prebuild` and an `expo-modules` setup.
2. `app/(admin)/upload/index.tsx` — two entry points: "Pick from Photos" (`expo-image-picker`, multi-select) and "Pick from Files" (`expo-document-picker`, PDFs). Per-file pipeline shown inline with progress: stored → ocr → extracting → done/error.
3. Per-file pipeline (`src/services/syncUpload.ts`):
   - Copy file into app sandbox via `services/storage.put` → create `attachments` row.
   - Call `AppleVision.recognizeText(uri)` → store `ocr_text` on the attachment.
   - Send the file (image bytes or rasterized PDF page images) to Claude vision via `services/extract`, passing the OCR text as a hint and using the same tool-input schema as Agent 2.
   - Same downstream as Agent 2: candidate → dedup → trip auto-assign → auto-promote.
   - Update the `attachments.reservation_id` once the candidate is accepted (Agent 4 handles the accept).
4. Thumbnail strip on the upload screen showing recently processed files with a link to their candidate.

**Out of scope:** Review queue UI. Email ingestion. Any reservation editing UI.

**Done when:** Importing a Booking.com PDF and a flight screenshot from Photos both produce candidate rows with correct structured data and attached source files visible in the review queue (built by Agent 4).

---

### Agent 4: Itinerary UI (parallel)

**Depends on:** Foundation merged. Can start against seed data; integrates with Agents 2 & 3 as their candidates land.

**Goal:** The consumption surface + the review queue. This is the part used every day.

**Deliverables:**
1. `app/(consumer)/index.tsx` — trip list, "new trip" CTA, cover images. App foreground trigger calls `runGmailSync()` (graceful no-op if not connected).
2. `app/(consumer)/trips/[id]/index.tsx` — day-by-day timeline. Each day is a `Card`; reservations within a day are a vertical sub-timeline ordered by `start_at`. Reservations color-coded by type (`ReservationBadge`). Multi-night lodging renders on every day in range with a "night N of M" pill. Inherit japan-2026's visual rhythm. Pull-to-refresh runs `runGmailSync()`.
3. **City segment derivation** — port `getCityGroups` from `japan-2026/js/components.js`: consecutive days sharing a city become a navigable segment with a section header.
4. **Transit pair links** — port `getTransitPairs`: between consecutive locations, auto-generate a "directions" link using Apple Maps URL scheme (`maps://?saddr=...&daddr=...`) with the locations' `geocode_query` strings. Falls back to Google Maps URL.
5. `app/(consumer)/trips/[id]/map.tsx` — `react-native-maps` map showing all reservation locations with type-coded markers. Tap marker → modal with reservation summary + "open." Server-less geocoding strategy: at commit time, call Apple's CLGeocoder via native module (free, on-device) to resolve `geocode_query` → lat/lng; store both. Fall back to letting the marker use Apple Maps' search-on-tap if geocoding fails.
6. **Manual CRUD** — "add reservation" sheet (type picker → type-specific form built from Foundation primitives + Zod schemas). Inline edit on reservation cards. Every edit sets `manually_edited_at = now()`.
7. **Review queue** (`app/(admin)/review/index.tsx`) — list of pending `extraction_candidates`, tap one for a detail screen: source preview (email snippet or attachment thumbnail) on top, proposed reservation form (editable) below. Accept commits via `services/candidates.acceptCandidate`; reject discards; merge mode shows a diff against the existing reservation when dedup matched. Badge with pending count on the tab bar.
8. Trip create/edit screen (title, date range, home timezone via `react-native-picker-select` or similar).

**Out of scope:** Gmail OAuth UI · upload UI · sync orchestration · any extraction logic.

**Done when:** You can navigate the japan-2026 seeded trip end-to-end, edit a reservation manually (timestamp updates), accept a candidate from the review queue (it appears in the timeline), and see all locations as markers on the map.

---

## Verification

End-to-end happy path on a real iPhone or simulator:
1. `pnpm install && pnpm ios` — app launches, migrations applied.
2. `pnpm seed` (dev-only menu item) — "Japan 2026" trip appears on home.
3. Open trip → timeline renders with color-coded reservations · map tab shows pins · city headers group consecutive days · transit-pair "directions" links open Apple Maps with correct origin/destination.
4. Tap a reservation → edit a field → `manually_edited_at` populates; re-running the sync doesn't overwrite the edit.
5. Settings → paste Anthropic API key (stored in Keychain).
6. Connect → Gmail OAuth round-trips · tokens in Keychain · status shows "connected."
7. "Sync now" → candidates appear in review queue with confidence chips; ≥ 0.9 auto-committed, rest pending.
8. Upload tab → pick a PDF from Files → candidate appears with attachment thumbnail.
9. Accept a candidate in review → reservation appears in the correct trip + day.
10. Re-sync Gmail with same messages → dedup matches; no duplicate reservations created.

Each agent owns its slice. Agent 1: steps 1–2. Agent 4: steps 3–4, 9. Agent 2: steps 5–7. Agent 3: step 8. Step 10 is the cross-cutting contract test that proves Foundation's dedup works under both ingestion paths — Agent 1 ships it as a test fixture; re-run after Agents 2 and 3 land.
