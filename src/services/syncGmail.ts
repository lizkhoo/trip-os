import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { extractionCandidates, gmailSyncState, settings, trips } from '@/db/schema';
import { autoPromoteAboveThreshold, createCandidate } from './candidates';
import { extractReservationFromEmailViaHatch } from './extract';
import {
  fetchMessageViaHatch,
  getProfileViaHatch,
  searchMessageIdsViaHatch,
} from './gmail';
import { findDuplicateReservation } from './reservations';
import { dateInZone, nowIso } from '@/lib/time';

/**
 * Orchestrate one Gmail sync cycle. Pulls messages matching the user's
 * allowlist + label fallback, runs each through Claude, writes a candidate,
 * auto-assigns a trip when a single trip range contains the date, then
 * auto-promotes candidates above the threshold.
 */

const DEFAULT_LOOKBACK_DAYS = 365;
const SETTINGS_ID = 'default';
const SYNC_STATE_ID = 'default';

export interface SyncResult {
  candidatesCreated: number;
  promoted: number;
}

export async function runGmailSync(): Promise<SyncResult> {
  const cfg = await loadConfig();
  const query = buildQuery(cfg.senderAllowlist, cfg.gmailLabelName);
  const after = cfg.lastSyncedAt ? toGmailDate(cfg.lastSyncedAt) : daysAgoGmailDate(DEFAULT_LOOKBACK_DAYS);

  // Snapshot the inbox's history id at the start of the run so we can resume
  // from history.list next time without re-scanning everything. We record it
  // even if the run fails partway — the candidates we did insert are dedup'd
  // by source_ref, so the worst case is missing a few messages until the
  // user hits "Sync now" again.
  const profile = await getProfileViaHatch();

  const ids = await searchMessageIdsViaHatch(query, after);
  const seen = await loadSeenSourceRefs();

  let candidatesCreated = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;

    const msg = await fetchMessageViaHatch(id);
    const text = `Subject: ${msg.subject}\nFrom: ${msg.from}\nDate: ${msg.date}\n\n${msg.bodyText}`;

    const extraction = await extractReservationFromEmailViaHatch({
      raw_text: text,
      message_id: id,
    });

    if (!extraction.ok) {
      console.warn(`[gmail] skipping ${id}: extraction parse failed — ${extraction.error}`);
      continue;
    }

    // PRD §"Cross-cutting": refuse to commit a candidate without an explicit
    // IANA zone. Better to drop a row than poison the trip with bad timestamps.
    const iana = extraction.proposed_reservation.details?.iana_timezone;
    if (typeof iana !== 'string' || iana.length === 0) {
      console.warn(`[gmail] skipping ${id}: extraction is missing details.iana_timezone`);
      continue;
    }

    const tripId = await autoAssignTrip(extraction.proposed_reservation.start_at);

    // Dedup at sync time so the review UI can show "merge". The proposal has
    // no trip_id by design; we synthesize one only to feed the dedup query.
    let mergedIntoReservationId: string | null = null;
    if (tripId) {
      const dup = await findDuplicateReservation({
        ...extraction.proposed_reservation,
        trip_id: tripId,
      });
      if (dup) mergedIntoReservationId = dup.id;
    }

    await createCandidate({
      trip_id: tripId,
      source: 'gmail',
      source_ref: id,
      raw_text: text,
      claude_response: extraction.raw_claude_response,
      proposed_reservation: extraction.proposed_reservation,
      confidence: extraction.confidence,
      status: 'pending',
      merged_into_reservation_id: mergedIntoReservationId,
    });
    candidatesCreated += 1;
  }

  const promoted = await autoPromoteAboveThreshold(cfg.autoPromoteThreshold);
  await updateLastSyncedAt(profile.historyId);

  return { candidatesCreated, promoted };
}

interface LoadedConfig {
  senderAllowlist: string[];
  gmailLabelName: string;
  autoPromoteThreshold: number;
  lastSyncedAt: string | null;
}

async function loadConfig(): Promise<LoadedConfig> {
  const settingsRow = await getDb().select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
  const syncRow = await getDb()
    .select()
    .from(gmailSyncState)
    .where(eq(gmailSyncState.id, SYNC_STATE_ID))
    .get();
  const allowlistRaw = settingsRow?.senderAllowlist ?? '[]';
  let allowlist: string[] = [];
  try {
    const parsed = JSON.parse(allowlistRaw);
    if (Array.isArray(parsed)) allowlist = parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    allowlist = [];
  }
  return {
    senderAllowlist: allowlist,
    gmailLabelName: settingsRow?.gmailLabelName ?? 'trip-os/inbox',
    autoPromoteThreshold: settingsRow?.autoPromoteThreshold ?? 0.9,
    lastSyncedAt: syncRow?.lastSyncedAt ?? null,
  };
}

function buildQuery(allowlist: string[], labelName: string): string {
  const cleaned = allowlist.map((s) => s.trim()).filter(Boolean);
  const fromClause = cleaned.length > 0 ? `from:(${cleaned.join(' OR ')})` : '';
  const labelClause = labelName ? `label:${labelName.replace(/\s+/g, '-')}` : '';
  const parts = [fromClause, labelClause].filter(Boolean);
  if (parts.length === 0) return 'newer_than:1y';
  if (parts.length === 1) return `${parts[0]} newer_than:1y`;
  return `(${parts.join(' OR ')}) newer_than:1y`;
}

function toGmailDate(iso: string): string {
  // Gmail wants YYYY/MM/DD.
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function daysAgoGmailDate(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return toGmailDate(d.toISOString());
}

async function loadSeenSourceRefs(): Promise<Set<string>> {
  const rows = await getDb()
    .select({ ref: extractionCandidates.sourceRef })
    .from(extractionCandidates)
    .where(eq(extractionCandidates.source, 'gmail'));
  return new Set(rows.map((r) => r.ref).filter((r): r is string => !!r));
}

async function autoAssignTrip(startAt: string): Promise<string | null> {
  const all = await getDb().select().from(trips);
  const matches = all.filter((t) => {
    // A trip claims the date if start_date ≤ local-day(start_at, trip tz) ≤ end_date.
    const day = dateInZone(startAt, t.homeTimezone);
    return day >= t.startDate && day <= t.endDate;
  });
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

async function updateLastSyncedAt(historyId: string): Promise<void> {
  const now = nowIso();
  await getDb()
    .insert(gmailSyncState)
    .values({ id: SYNC_STATE_ID, lastSyncedAt: now, lastHistoryId: historyId })
    .onConflictDoUpdate({
      target: gmailSyncState.id,
      set: { lastSyncedAt: now, lastHistoryId: historyId },
    });
}

// Re-export the orchestrator-level test hatch (the gmail/extract modules own
// their own hatches; this is here so the consumer doesn't have to know which
// boundary to mock).
export {
  __setExtractForTest,
  type EmailExtractionArgs,
  type ExtractionResult,
} from './extract';
export { __setGmailForTest, type GmailAdapter } from './gmail';
