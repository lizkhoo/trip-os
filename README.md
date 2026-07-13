# trip-os

iPhone itinerary app. Connect Gmail or drag-and-drop screenshots/PDFs to populate a day-by-day trip from your reservation confirmations.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec and multi-agent build plan.

## Foundation status

This branch ships **Agent 1: Foundation** per the PRD. The three ingestion/UI verticals (Gmail, Upload+OCR, Itinerary UI) land in separate PRs after this merges.

What works today:
- Expo app boots, Drizzle migrations apply on first launch, dev screen shows the seeded Japan 2026 fixture.
- All seven tables (trips, reservations, locations, attachments, extraction_candidates, gmail_sync_state, settings) created with CHECK constraints + `updated_at` triggers + singleton seed rows.
- Typed domain layer: discriminated-union `ReservationSchema`, `ExtractionCandidateSchema`, Trip/Location.
- Services: `trips`, `locations`, `reservations`, `candidates`, `storage` (expo-file-system), `secrets` (Keychain), `dedup`.
- Blessed UI primitives in `src/components/ui/` — verticals must not roll their own.
- PII-safe seed pipeline: real ITINERARY → `pnpm scrub` → committed scrubbed JSON.

Not yet built (deferred to verticals): Gmail OAuth, Claude API extraction, Apple Vision native module, upload UI, consumer timeline/map, review queue.

## Prerequisites

- macOS with Xcode 15+ (iOS Simulator)
- Node 22+
- pnpm 10+
- Expo CLI (used via `pnpm ios`)

For Linux contributors: you can run typecheck, lint, the scrub script, and the smoke test without a Mac. The app itself only runs on macOS/iOS.

## Setup

```bash
pnpm install
pnpm ios          # macOS only — boots iOS Simulator
```

The dev surface lives at `/dev` (the root route redirects there until Agent 4 ships the consumer UI). It shows the trip count, lets you re-run the seed, and links to the primitives showcase.

## Anthropic API key

Paste your Anthropic API key into Settings inside the app — it lives in iOS Keychain via `expo-secure-store`. Do not put your **Anthropic API key** in `.env` files; it's an actual secret that lets anyone bill against your account, and `.env` files are easy to leak. The Google iOS OAuth client id (below) is different: it's public-by-design and fine to keep in `.env` for local dev.

## Gmail OAuth

trip-os connects to Gmail directly from the device using PKCE — no server, no shared secret. You need your own iOS OAuth client id.

**Important:** Google rejects arbitrary custom schemes like `trip-os://oauthredirect` ("doesn't meet Google's OAuth requirements"). Use the **reversed client id** redirect that Google issues for iOS clients.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 Client ID of type **iOS**. Set the bundle id to `com.lizkhoo.tripos`.
2. Copy the client id (looks like `1234567890-abc.apps.googleusercontent.com`). Google also shows an **iOS URL scheme** of the form `com.googleusercontent.apps.1234567890-abc` — that scheme is what the app registers at prebuild. You do **not** need to add `trip-os://oauthredirect`.
3. The app's redirect URI (derived automatically) is:
   ```
   com.googleusercontent.apps.<GUID>:/oauth2redirect/google
   ```
   where `<GUID>` is the client id without `.apps.googleusercontent.com`.
4. Set the client id **before prebuild/build** (it is baked into `extra` and into the native URL scheme):
   ```bash
   export TRIPOS_GOOGLE_CLIENT_ID="1234567890-abc.apps.googleusercontent.com"
   # or put the same line in a local .env and source it
   npx expo prebuild --platform ios --clean
   npx expo run:ios --device
   ```
   Verify with:
   ```bash
   npx expo config --type public | jq '{client: .extra.googleClientId, redirect: .extra.googleRedirectUrl}'
   ```
   The client id is public-by-design (Google's iOS OAuth flow has no client secret).

The Gmail scope is `gmail.readonly`. Tokens land in iOS Keychain — `expo-secure-store` keeps them out of normal app storage and out of backups. Refresh is handled internally by `src/services/gmail.ts` on 401. If you change `TRIPOS_GOOGLE_CLIENT_ID`, you must re-run prebuild — Metro reload alone is not enough.

## Database

- Drizzle schema: [`src/db/schema.ts`](src/db/schema.ts)
- Migrations: [`src/db/migrations/`](src/db/migrations/)
- App applies them via `useMigrations()` from `drizzle-orm/expo-sqlite/migrator` at boot
- Regenerate after schema changes: `pnpm db:generate`. Manually register new SQL files in `src/db/migrations/migrations.js` and `meta/_journal.json` (drizzle-kit generates an entry for diffed migrations; hand-written triggers/seed migrations need to be added by hand).

## Seed data + PII

The fixture is the `japan-2026` itinerary (Mar 14 – Apr 11, 2026). The raw source contains real passenger names, airline PNRs, hotel reservation numbers, and a password — it lives in `seed/japan-2026.private.json`, which is **git-ignored**.

Workflow:

1. Place your unsanitized snapshot at `seed/japan-2026.private.json`. If you have `data.js` from the `japan-2026` repo, generate the JSON with:
   ```bash
   node --input-type=module -e "import('./path/to/data.js').then(m => process.stdout.write(JSON.stringify(m.ITINERARY, null, 2)))" > seed/japan-2026.private.json
   ```
2. Run `pnpm scrub`. It deterministically replaces names with `Traveler A/B/C/D`, PNRs with format-preserving fakes, numeric/hyphenated reservation IDs with hash-derived same-length digits, and strips personal phrases (passport instructions, "pay at hotel", etc.). Passwords get full `[REDACTED]` replacement.
3. The scrubbed result lands at `seed/japan-2026.json` — committed to the public repo.

The seed script prefers the private file when present, so locally you see real data; on a fresh clone (or CI), it falls back to the public scrubbed file.

CI gates:
- `pnpm scrub -- --check` — re-scrubs in memory and fails if the committed file is stale.
- `scripts/pii-gate.sh` — greps tracked files against a list of known real PII tokens. The token list lives in `.pii-tokens` (git-ignored). In CI it's hydrated from the `PII_TOKENS` GitHub Actions secret; locally, you maintain it by hand. When no list is present, the gate is a no-op.

## Visual system

NativeWind (Tailwind) with a warm editorial palette. Tokens in [`tailwind.config.js`](tailwind.config.js):

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1f1a17` | Primary text |
| `paper` | `#fbf7f0` | App background |
| `paper-warm` / `paper-dim` | `#f3ead9` / `#e8dfcc` | Surfaces, dividers |
| `type-flight` | `#4a5d6e` | Flight reservations (slate) |
| `type-lodging` | `#b04a2a` | Lodging reservations (rust) |
| `type-dining` | `#c98a3a` | Dining reservations (ochre) |
| `type-activity` | `#3f6b4e` | Activity reservations (forest) |
| `type-transit` | `#7a3b56` | Transit reservations (plum) |

Open the primitives showcase at `/dev/primitives` to see every blessed component in one place.

## Verification

On Linux (no Xcode):

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm db:generate                # idempotent — should produce no schema diff
pnpm scrub -- --check           # idempotent
pnpm smoke                      # in-memory SQLite, applies migrations, runs seed, asserts schema
```

On macOS:

```bash
pnpm ios
# 1. App launches → /dev dashboard
# 2. Tap "Re-run seed" → trip count = 1, Japan 2026 populated
# 3. Open primitives showcase → every primitive renders
# 4. Force-quit + reopen → data persists, no migration re-run
```
