/**
 * Date/time picker wall-clock round-trip.
 *
 * The reported bug: tapping "July 3" in the calendar showed 7/4/2026. Root
 * cause is that @formatjs/intl-datetimeformat/polyfill-force replaces
 * Date.prototype.toLocale* and defaults to UTC (src/lib/intl-polyfill.ts never
 * calls __setDefaultTimeZone), so the picker rendered the UTC day — which is
 * already tomorrow, all evening, for anyone west of Greenwich.
 *
 * The second, quieter half: native pickers work in device-local time, so
 * re-deriving the calendar day from the underlying instant in the *trip's* zone
 * shifted it again whenever the two zones differ.
 *
 * These assertions are written to be timezone-independent so they hold on any
 * machine: they construct Dates through the LOCAL constructor and assert the
 * helpers read back exactly the digits that went in.
 */
import { composeIso, localHm, localWallClockAsUtc, localYmd, zonedWallClockAsLocalDate } from '@/lib/time';
import type { E2eTest } from './runner';

export const name = 'Picker wall-clock — tapped date survives display and save';

export const test: E2eTest = async ({ assert, assertEqual }) => {
  // --- The exact reported case: tap July 3, late in the day ----------------
  // 21:49 local is past midnight UTC anywhere west of Greenwich, which is what
  // made the old toLocaleDateString() render the 4th.
  const july3Evening = new Date(2026, 6, 3, 21, 49, 0, 0);
  assertEqual(localYmd(july3Evening), '2026-07-03', 'tapping July 3 in the evening reads back as July 3');
  assertEqual(localHm(july3Evening), '21:49', 'the wall-clock time reads back unchanged');

  // The display mirror must show the same day the picker showed.
  const shown = localWallClockAsUtc(july3Evening);
  assertEqual(
    shown.toISOString().slice(0, 10),
    '2026-07-03',
    'display mirror renders July 3 when formatted as UTC',
  );
  assertEqual(shown.toISOString().slice(11, 16), '21:49', 'display mirror keeps the wall-clock time');

  // --- Early morning, the other edge --------------------------------------
  const july3Morning = new Date(2026, 6, 3, 0, 5, 0, 0);
  assertEqual(localYmd(july3Morning), '2026-07-03', 'just after local midnight is still July 3');
  assertEqual(localHm(july3Morning), '00:05', 'midnight-adjacent time reads back as 00:05, not 24:05');
  assertEqual(
    localWallClockAsUtc(july3Morning).toISOString().slice(0, 10),
    '2026-07-03',
    'display mirror holds at the early-morning edge too',
  );

  // --- Save path: the tapped digits are what get stored --------------------
  // A Tokyo booking entered on a device in any zone must store the typed digits
  // with Tokyo's offset — not the digits converted into Tokyo.
  const tokyoIso = composeIso(localYmd(july3Evening), localHm(july3Evening), 'Asia/Tokyo');
  assert(
    tokyoIso.startsWith('2026-07-03T21:49:00'),
    `typed wall-clock is stored verbatim (got ${tokyoIso})`,
  );
  assert(tokyoIso.endsWith('+09:00'), `stored with Tokyo's offset (got ${tokyoIso})`);

  // --- Load path: opening a stored reservation shows the destination's clock
  const reloaded = zonedWallClockAsLocalDate('2026-07-03T21:49:00+09:00', 'Asia/Tokyo');
  assertEqual(localYmd(reloaded), '2026-07-03', 'reloading a Tokyo booking shows the Tokyo date');
  assertEqual(localHm(reloaded), '21:49', 'reloading a Tokyo booking shows the Tokyo time');

  // --- The round-trip that used to corrupt: load then save unchanged -------
  for (const [iso, zone] of [
    ['2026-07-03T21:49:00+09:00', 'Asia/Tokyo'],
    ['2026-03-14T09:02:00-07:00', 'America/Los_Angeles'],
    ['2026-01-01T00:00:00+00:00', 'Europe/London'],
    ['2026-12-31T23:30:00+13:00', 'Pacific/Auckland'],
  ] as const) {
    const picked = zonedWallClockAsLocalDate(iso, zone);
    const resaved = composeIso(localYmd(picked), localHm(picked), zone);
    assertEqual(resaved, iso, `load → save with no edits is a no-op for ${zone}`);
  }

  // --- Midnight specifically (the h23 vs hour12:false trap) ----------------
  const midnight = zonedWallClockAsLocalDate('2026-07-03T00:00:00+09:00', 'Asia/Tokyo');
  assertEqual(localYmd(midnight), '2026-07-03', 'midnight does not roll the date forward');
  assertEqual(localHm(midnight), '00:00', 'midnight reads as 00:00');
};
