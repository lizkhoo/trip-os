# Key learnings — for future agents and chat sessions

Append new entries at the bottom. Each entry: date, context, learning.

## 2026-06 (overnight MVP run)

- **DB port pattern is the keystone.** Every service calls `getDb()` from `src/db/client.ts`;
  tests inject a better-sqlite3 drizzle client via `__setDbForTest`. Never import a module-top
  `db` — it pins expo-sqlite at import time and breaks Node runnability.
- **Native/expo imports must be deferred.** Any module a Node test can transitively import
  (`services/*`, `lib/*`) must load expo packages via deferred `import()`/`require` inside
  functions, with a documented reason. `ocr.ts`, `storage.ts`, `secrets.ts`, `geocode.ts`,
  `extract.ts`, `db/client.ts` all follow this.
- **Every network/native boundary gets a `__setXForTest` hatch + `xViaHatch` wrapper.**
  Orchestrators call the ViaHatch form. The e2e harness (`tests/e2e/harness.ts`) installs
  mocks and its `teardown()` must reset every hatch — add new hatches there.
- **e2e tests drive REAL services, never replicas.** The old smoke-test replica of
  `runGmailSync` diverged and hid a dedup bug. Keep the 5 canonical pathways at ≤5; extend an
  existing pathway rather than adding a sixth (geocode backfill lives inside trip-lifecycle).
- **Never weaken a test to go green.** If blocked, leave it failing with a note in
  `docs/overnight/PROGRESS.md`.

## 2026-07-03 (gap-closing run: OCR, map, geocoding)

- **Local expo-modules autolink from `./modules` by default** (expo-modules-autolinking
  `nativeModulesDir` falls back to `./modules`). A module needs only
  `expo-module.config.json`, an `ios/<Name>.podspec`, the Swift module, and a TS `index.ts`
  using `requireNativeModule`. No app.config plugin required.
- **Geocoding without a server or API key:** expo-location `geocodeAsync` is CLGeocoder on
  iOS — on-device and free. It throttles bursts, so backfill sequentially and treat misses as
  non-fatal (row stays lat/lng-null; UI falls back to a Maps search URL).
- **Changeover-day city labels must prefer the covering-night lodging** (check-in ≤ day <
  check-out), not the first lodging in row order. Sort each day's reservations by `start_at`
  before any derivation.
- **What still requires a Mac:** simulator/device verification of all screens, compiling the
  AppleVision module, on-device geocoder behavior, and the Gmail OAuth round-trip (needs a
  user-created iOS OAuth client id — see README "Gmail OAuth").
- **User-supplied credentials are device-side, not repo-side:** the Anthropic API key is
  pasted into in-app Settings (Keychain); the Google iOS OAuth client id is public-by-design
  and set via `TRIPOS_GOOGLE_CLIENT_ID` before `pnpm ios`. Nothing to add to CI or `.env` in
  this repo.
