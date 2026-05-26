import type { ReservationInput } from '@/domain/reservation';
import { dateInZone } from '@/lib/time';

/**
 * Dedup keys per PRD §"Cross-cutting":
 *   flight: (carrier, flight_number, date)
 *   lodging: (property_name fuzzy, check_in_date)
 *   dining/activity: (name fuzzy, start_at ± 30min)
 *   transit: (operator, departure_station, start_at ± 30min)
 *
 * Kept pure so unit tests don't need the DB.
 */

function fuzz(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bucket30(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return String(Math.floor(t / (30 * 60 * 1000)));
}

export interface DedupKey {
  type: ReservationInput['type'];
  parts: readonly string[];
  /** Whether this key compares within a ± 30-minute window (i.e. it embeds a bucket30 part). */
  windowed: boolean;
}

export function computeDedupKey(r: ReservationInput): DedupKey {
  switch (r.type) {
    case 'flight': {
      const day = dateInZone(r.start_at, r.details.iana_timezone);
      return {
        type: 'flight',
        parts: [fuzz(r.details.carrier), fuzz(r.details.flight_number), day],
        windowed: false,
      };
    }
    case 'lodging': {
      const day = dateInZone(r.start_at, r.details.iana_timezone);
      return {
        type: 'lodging',
        parts: [fuzz(r.details.property_name), day],
        windowed: false,
      };
    }
    case 'dining':
    case 'activity':
      return {
        type: r.type,
        parts: [fuzz(r.title), bucket30(r.start_at)],
        windowed: true,
      };
    case 'transit':
      return {
        type: 'transit',
        parts: [
          fuzz(r.details.operator),
          fuzz(r.details.departure_station),
          bucket30(r.start_at),
        ],
        windowed: true,
      };
  }
}

export function keysMatch(a: DedupKey, b: DedupKey): boolean {
  if (a.type !== b.type) return false;
  if (a.parts.length !== b.parts.length) return false;
  for (let i = 0; i < a.parts.length; i++) {
    if (a.parts[i] !== b.parts[i]) {
      // For windowed keys, also accept neighboring 30-min buckets to absorb edge jitter.
      if (a.windowed && i === a.parts.length - 1) {
        const ai = Number(a.parts[i]);
        const bi = Number(b.parts[i]);
        if (Number.isFinite(ai) && Number.isFinite(bi) && Math.abs(ai - bi) <= 1) continue;
      }
      return false;
    }
  }
  return true;
}

export function findDuplicate<T extends { key: DedupKey }>(
  candidate: DedupKey,
  pool: T[],
): T | undefined {
  return pool.find((p) => keysMatch(candidate, p.key));
}
