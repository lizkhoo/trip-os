/**
 * Intl polyfill for Hermes.
 *
 * Hermes ships without ICU timezone data, so `Intl.DateTimeFormat` with a
 * `timeZone` option (and `Date.prototype.toLocale*`) returns wrong values
 * on-device. That silently breaks `offsetForZone` / `dateInZone` in
 * src/lib/time.ts — and therefore `composeIso` and the whole timeline's
 * day-grouping — even though Node (full ICU) passes every test.
 *
 * These FormatJS polyfills install full locale + the complete IANA timezone
 * database. This module is imported purely for its side effects and MUST run
 * before any time.ts usage, so it is the very first import in app/_layout.tsx.
 *
 * Import order matters: getcanonicallocales → locale → datetimeformat polyfill →
 * tz data → locale data.
 */
import '@formatjs/intl-getcanonicallocales/polyfill-force';
import '@formatjs/intl-locale/polyfill-force';
import '@formatjs/intl-pluralrules/polyfill-force';
import '@formatjs/intl-datetimeformat/polyfill-force';
import '@formatjs/intl-datetimeformat/add-all-tz';
import '@formatjs/intl-datetimeformat/locale-data/en';
