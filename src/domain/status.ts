/**
 * Operational reservation status — derived (not persisted).
 * Orthogonal to the DB `status` column (`confirmed` | `cancelled`).
 *
 * Maps onto the design-system status model (docs/design-system.md).
 */
import type { Reservation } from '@/domain/reservation';

export const OPERATIONAL_STATUSES = [
  'confirmed',
  'needs_review',
  'cancelled',
  'in_progress',
  'upcoming',
  'past',
] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

/** Design-system tone used by StatusChip (soft bg + solid text). */
export type StatusTone = 'good' | 'warn' | 'alert' | 'info' | 'neutral';

export const STATUS_TONE: Record<OperationalStatus, StatusTone> = {
  confirmed: 'good',
  needs_review: 'warn',
  cancelled: 'alert',
  in_progress: 'info',
  upcoming: 'neutral',
  past: 'neutral',
};

export const STATUS_LABEL: Record<OperationalStatus, string> = {
  confirmed: 'Confirmed',
  needs_review: 'Review',
  cancelled: 'Cancelled',
  in_progress: 'Now',
  upcoming: 'Upcoming',
  past: 'Past',
};

/** Higher = worse for day/trip summary rollups. */
export const STATUS_SEVERITY: Record<OperationalStatus, number> = {
  cancelled: 5,
  needs_review: 4,
  in_progress: 3,
  confirmed: 2,
  upcoming: 1,
  past: 0,
};

/** Auto-extracted reservations below this confidence need review. */
export const NEEDS_REVIEW_CONFIDENCE = 0.9;

export interface StatusInput {
  status: 'confirmed' | 'cancelled';
  start_at: string;
  end_at?: string | null;
  confirmation_code?: string | null;
  confidence?: number | null;
  manually_edited_at?: string | null;
  source?: string | null;
}

/**
 * Pure derivation of glanceable operational status.
 * Priority: cancelled → in_progress → past → needs_review → upcoming → confirmed.
 */
export function deriveStatus(reservation: StatusInput, now: Date = new Date()): OperationalStatus {
  if (reservation.status === 'cancelled') return 'cancelled';

  const start = Date.parse(reservation.start_at);
  const end = reservation.end_at ? Date.parse(reservation.end_at) : Number.NaN;
  const t = now.getTime();

  if (Number.isFinite(start)) {
    const endMs = Number.isFinite(end) ? end : start;
    if (t >= start && t <= endMs) return 'in_progress';
    if (t > endMs) return 'past';
  }

  if (needsReview(reservation)) return 'needs_review';

  if (Number.isFinite(start) && t < start) return 'upcoming';

  return 'confirmed';
}

function needsReview(reservation: StatusInput): boolean {
  if (reservation.manually_edited_at) return false;
  if (reservation.source === 'manual') return false;
  if (typeof reservation.confidence !== 'number') return false;
  return reservation.confidence < NEEDS_REVIEW_CONFIDENCE;
}

/** Worst (highest severity) status in a list; null if empty. */
export function worstStatus(
  reservations: StatusInput[],
  now: Date = new Date(),
): OperationalStatus | null {
  if (reservations.length === 0) return null;
  let worst: OperationalStatus = deriveStatus(reservations[0]!, now);
  for (let i = 1; i < reservations.length; i++) {
    const s = deriveStatus(reservations[i]!, now);
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) worst = s;
  }
  return worst;
}

/**
 * Current reservation if any is in progress; otherwise the soonest upcoming.
 * Used for the day-view "what now?" pin.
 */
export function findWhatNow(
  reservations: Reservation[],
  now: Date = new Date(),
): Reservation | null {
  const t = now.getTime();
  let inProgress: Reservation | null = null;
  let next: Reservation | null = null;
  let nextStart = Infinity;

  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const start = Date.parse(r.start_at);
    if (!Number.isFinite(start)) continue;
    const end = r.end_at ? Date.parse(r.end_at) : start;
    if (t >= start && t <= end) {
      if (!inProgress || start < Date.parse(inProgress.start_at)) inProgress = r;
      continue;
    }
    if (start > t && start < nextStart) {
      nextStart = start;
      next = r;
    }
  }

  return inProgress ?? next;
}

/** Human summary for a trip card, e.g. "2 need review". */
export function summarizeTripStatuses(
  reservations: StatusInput[],
  now: Date = new Date(),
): string | null {
  if (reservations.length === 0) return null;

  let needsReviewCount = 0;
  let cancelledCount = 0;
  let inProgressCount = 0;

  for (const r of reservations) {
    const s = deriveStatus(r, now);
    if (s === 'needs_review') needsReviewCount++;
    else if (s === 'cancelled') cancelledCount++;
    else if (s === 'in_progress') inProgressCount++;
  }

  if (needsReviewCount > 0) {
    return needsReviewCount === 1 ? '1 needs review' : `${needsReviewCount} need review`;
  }
  if (cancelledCount > 0) {
    return cancelledCount === 1 ? '1 cancelled' : `${cancelledCount} cancelled`;
  }
  if (inProgressCount > 0) return 'In progress';

  const worst = worstStatus(reservations, now);
  if (!worst) return null;
  if (worst === 'past') return 'Completed';
  if (worst === 'upcoming' || worst === 'confirmed') return 'Ready';
  return STATUS_LABEL[worst];
}
