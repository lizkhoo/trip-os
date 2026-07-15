/**
 * Unit tests for deriveStatus and related pure helpers.
 * Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveStatus,
  findWhatNow,
  summarizeTripStatuses,
  worstStatus,
  type StatusInput,
} from '../../src/domain/status';
import type { Reservation } from '../../src/domain/reservation';

function base(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    status: 'confirmed',
    start_at: '2026-03-15T10:00:00+09:00',
    end_at: '2026-03-15T12:00:00+09:00',
    confirmation_code: 'ABC',
    confidence: 0.95,
    manually_edited_at: null,
    source: 'gmail',
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('returns cancelled when DB status is cancelled', () => {
    const now = new Date('2026-03-15T09:00:00+09:00');
    assert.equal(deriveStatus(base({ status: 'cancelled' }), now), 'cancelled');
  });

  it('returns in_progress when now is within start/end', () => {
    const now = new Date('2026-03-15T11:00:00+09:00');
    assert.equal(deriveStatus(base(), now), 'in_progress');
  });

  it('returns past when now is after end', () => {
    const now = new Date('2026-03-15T13:00:00+09:00');
    assert.equal(deriveStatus(base(), now), 'past');
  });

  it('returns needs_review for low-confidence auto extractions future items', () => {
    const now = new Date('2026-03-14T09:00:00+09:00');
    assert.equal(
      deriveStatus(base({ confidence: 0.6, confirmation_code: null }), now),
      'needs_review',
    );
  });

  it('returns upcoming for future confirmed items', () => {
    const now = new Date('2026-03-14T09:00:00+09:00');
    assert.equal(deriveStatus(base({ confidence: 0.95 }), now), 'upcoming');
  });

  it('returns confirmed for manually edited items without a future start edge case', () => {
    // No start parse edge: already started with no end → past; use manual + present-day
    // confirmed when start equals a zoneless-safe path: treat as confirmed when not
    // temporal and not needs_review — e.g. start in the past with end null uses start as end → past.
    // Explicit confirmed: future start, manual edit, skips needs_review → upcoming.
    // Confirmed (not upcoming): use a start that fails temporal? Use source manual + same window past confidence path.
    // Spec: confirmed = has conf code / manually verified when not upcoming/past/in_progress.
    // Achieve via: start far in past but wait that's past.
    // Use: start_at invalid? Better: after end check fails if end is null and start is past → past.
    // The only path to bare `confirmed` is: not cancelled, not in window, not past, not needs_review, not future.
    // That means start must be NaN (unparseable) OR start == now exactly outside window logic.
    // If start is unparseable:
    assert.equal(
      deriveStatus(
        base({
          start_at: 'not-a-date',
          end_at: null,
          manually_edited_at: '2026-03-01T00:00:00+09:00',
          confidence: 0.5,
        }),
        new Date('2026-03-15T11:00:00+09:00'),
      ),
      'confirmed',
    );
  });

  it('does not flag manual source as needs_review', () => {
    const now = new Date('2026-03-14T09:00:00+09:00');
    assert.equal(
      deriveStatus(base({ source: 'manual', confidence: 0.4 }), now),
      'upcoming',
    );
  });
});

describe('worstStatus', () => {
  it('picks cancelled over needs_review', () => {
    const now = new Date('2026-03-14T09:00:00+09:00');
    const worst = worstStatus(
      [
        base({ confidence: 0.5 }),
        base({ status: 'cancelled', start_at: '2026-03-20T10:00:00+09:00' }),
      ],
      now,
    );
    assert.equal(worst, 'cancelled');
  });
});

describe('findWhatNow', () => {
  it('prefers in-progress over upcoming', () => {
    const now = new Date('2026-03-15T11:00:00+09:00');
    const a = {
      ...base({ start_at: '2026-03-15T10:00:00+09:00', end_at: '2026-03-15T12:00:00+09:00' }),
      id: 'a',
      trip_id: 't',
      title: 'Now',
      type: 'dining' as const,
      source: 'manual' as const,
      details: { cuisine: 'x', iana_timezone: 'Asia/Tokyo' },
    } as Reservation;
    const b = {
      ...base({ start_at: '2026-03-16T10:00:00+09:00', end_at: '2026-03-16T12:00:00+09:00' }),
      id: 'b',
      trip_id: 't',
      title: 'Next',
      type: 'dining' as const,
      source: 'manual' as const,
      details: { cuisine: 'x', iana_timezone: 'Asia/Tokyo' },
    } as Reservation;
    assert.equal(findWhatNow([a, b], now)?.id, 'a');
  });
});

describe('summarizeTripStatuses', () => {
  it('reports needs-review count', () => {
    const now = new Date('2026-03-14T09:00:00+09:00');
    const summary = summarizeTripStatuses(
      [
        base({ confidence: 0.5, start_at: '2026-03-20T10:00:00+09:00' }),
        base({ confidence: 0.4, start_at: '2026-03-21T10:00:00+09:00' }),
      ],
      now,
    );
    assert.equal(summary, '2 need review');
  });
});
