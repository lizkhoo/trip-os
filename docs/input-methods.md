# Input methods — shipped and deferred

Reference for how trip content gets into trip-os. Written 2026-08-15 while shipping the
paste box and the Files/AirDrop handler; the deferred sections are meant to be picked up
cold, so each carries its own cost estimate and implementation notes.

## The thing that makes all of this cheap

The extraction pipeline is already input-agnostic:

- `extractReservationFromEmail` (`src/services/extract.ts`) takes `{ raw_text, message_id, source }`
  — plain text, nothing Gmail-specific.
- `extractReservationFromAttachment` takes image URIs + OCR text.
- Everything funnels into `extraction_candidates`, and `src/services/dedup.ts` handles overlap.

So **the cost of a new input method is not extraction — it's only how bytes reach the device.**
That is also what makes it safe to have many overlapping inputs rather than one perfect one:
dedup at sync time means the same booking arriving twice (Gmail *and* a paste) surfaces as a
merge, not a duplicate. See case C in `tests/e2e/paste-to-timeline.e2e.ts`.

Every new source string needs widening `RESERVATION_SOURCES` in `src/db/schema.ts`, which is a
CHECK constraint on two tables. **Do not ship drizzle-kit's generated migration for that
unedited** — see the header comment in `src/db/migrations/0002_source_paste.sql` and
`tests/e2e/migration-0002-source-paste.e2e.ts` for why it silently unlinks attachments.

---

## Shipped

### Paste box — `source: 'paste'`

`app/(consumer)/paste.tsx` → `src/services/syncPaste.ts` → the existing candidate pipeline.
No storage, no OCR, no attachment row. Covers the entire long tail nothing automated reaches:
a confirmation email body, a message from whoever actually booked it, a half-remembered
sentence. The iOS keyboard mic button means voice entry came free.

### Files / AirDrop — "Open in trip-os"

`CFBundleDocumentTypes` in `app.config.ts` registers the app as a viewer for PDFs and images,
with `LSSupportsOpeningDocumentsInPlace: false` so iOS copies the file into `Documents/Inbox/`
and hands over a `file://` URL the app owns. `src/features/inbox/useIncomingFile.ts` (mounted in
`app/_layout.tsx`) routes those into the upload screen, which auto-runs the existing pipeline.
`src/lib/incomingFile.ts` holds the pure URL → `{uri, kind}` classification.

This also quietly covers "I'm on my laptop" — AirDrop a PDF from a Mac.

### Already existing

Gmail sync (`syncGmail.ts`), manual file picker + OCR (`syncUpload.ts`), manual CRUD.

---

## Deferred

Ordered by recommended pickup order.

### 1. Calendar import — `source: 'calendar'`

**The highest-value one left, and the 80/20 version of Gmail scraping.**

Google auto-creates calendar events from exactly the confirmation emails the Gmail path is
trying to parse — flights, hotels, restaurants — and those sync to iOS Calendar. Reading them
harvests the output of Google's own email parsing with **no OAuth, no allowlist, no token
refresh, and no Google verification review**. It also picks up `.ics` files the user opened
from Airbnb/OpenTable/Resy.

Cost: one permission prompt, `expo-calendar` (an existing Expo module), one screen.

Notes:
- Events arrive pre-structured — `title`, `startDate`, `endDate`, `location`, `notes` (which
  often contains the confirmation body). Many need **no Claude call at all**; go straight to a
  proposal and reserve extraction for events that don't parse cleanly.
- Filter to the trip date range first, then to events that look like reservations, or you will
  ingest every standup.
- Timezone is the one place to be careful: EventKit gives a real timezone, so map it to the
  IANA id rather than inferring — the pipeline refuses candidates without `details.iana_timezone`.

### 2. Screenshot auto-scan

People screenshot confirmations constantly. `expo-media-library` → filter to screenshots taken
in or near a trip's date range → Apple Vision OCR on-device (free) → cheap keyword prefilter
(dates + "confirmation"/"booking"/"reservation") → **only then** spend Claude tokens.

Cost: low. `syncUpload.ts` already does everything from the OCR step onward; this adds an asset
query and a prefilter. Reuses `source: 'upload'`.

Note: the prefilter is the whole design. Without it this runs a vision call over every
screenshot on the phone.

### 3. Share sheet extension

The broadest coverage of anything on this list: share into trip-os from Mail.app, Safari, the
Airbnb app, Messages, Files. Makes the app reachable from every app on the phone, which is a
different category of thing than any single integration.

Cost: a native target via the `expo-share-extension` config plugin — call it a week, not a day.
It's the only item here that isn't cheap, and it's still worth it.

Note: a share extension is a separate process with its own memory limit. It should write the
payload to a shared App Group container and let the main app do the extraction, not run Claude
inside the extension.

### 4. `.pkpass` and `.ics` parsers — `source: 'wallet'`

Wallet passes and calendar invites are structured JSON/text. A deterministic parser means **no
token cost, no hallucination, and confidence 1.0** — accept straight through and skip the review
queue entirely. Airlines, hotels, and OpenTable all attach these.

Cost: ~100 lines each. They arrive via the Files handler already shipped — add the UTIs
(`com.apple.pkpass`, `com.apple.ical.ics`) to `CFBundleDocumentTypes` and branch in
`classifyIncomingFile`.

Note: iOS PassKit can only read passes *your app* added, so there's no way to enumerate the
user's Wallet. This is share/open-driven only.

### 5. Forwarding address (`forward@tripos.com`)

Cheap in dollars (Cloudflare Email Routing → Worker → KV is free tier), **expensive in
architecture**. It breaks three PRD anchors at once: *no server*, *no accounts*, *everything
stays on device*. It needs address→install binding without accounts, a poll endpoint, and it
puts users' email through infrastructure you operate — a genuinely different privacy posture
from "your key, your device."

Its real justification isn't cost, it's that it's the only method that works when the user is at
a laptop. **AirDrop + the share sheet cover much of that for zero infra**, so this should wait
until there's evidence the desktop gap actually bites.

---

## On the Gmail path

Worth keeping — it's the only zero-user-effort input — but it should be one of several, not the
strategy. Its cost isn't one-time: restricted OAuth scopes mean a CASA security assessment to
go past TestFlight, plus token refresh, plus allowlist maintenance forever, plus re-scanning a
whole mailbox for a low hit rate. Calendar import (#1 above) gets a large fraction of the same
content for a small fraction of that.

## Adjacent, not an input method

Since trips have date ranges, the app can notice gaps — "you land in Osaka on the 4th but have
nowhere to sleep that night" — and prompt at the moment the user cares. Doesn't add an input
path; makes the existing ones get used.
