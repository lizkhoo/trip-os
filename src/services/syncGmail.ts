import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { extractionCandidates, gmailSyncState, settings, trips } from '@/db/schema';
import { autoPromoteAboveThreshold, createCandidate } from './candidates';
import { extractReservationFromEmailViaHatch } from './extract';
import { fetchMessageViaHatch, searchMessageIdsViaHatch } from './gmail';
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
const NIL_TRIP_UUID = '00000000-0000-0000-0000-000000000000';

export interface SyncResult {
  candidatesCreated: number;
  promoted: number;
}

export async function runGmailSync(): Promise<SyncResult> {
  const cfg = await loadConfig();
  const query = buildQuery(cfg.senderAllowlist, cfg.gmailLabelName);
  const after = cfg.lastSyncedAt ? toGmailDate(cfg.lastSyncedAt) : daysAgoGmailDate(DEFAULT_LOOKBACK_DAYS);

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

    const tripId = await autoAssignTrip(extraction.proposed_reservation.start_at);
    // The embedded proposed_reservation requires a uuid trip_id; for "needs trip"
    // candidates we stash the nil UUID and let acceptCandidate's `edits` arg
    // overwrite it when the user assigns a trip in the review queue.
    const proposed = {
      ...extraction.proposed_reservation,
      trip_id: tripId ?? NIL_TRIP_UUID,
    } as typeof extraction.proposed_reservation;

    // Surface duplicate hits at sync time so the review UI can show "merge"
    // — the auto-promote pass below will dedup again at promotion time.
    if (tripId) {
      await findDuplicateReservation(proposed);
    }

    await createCandidate({
      trip_id: tripId,
      source: 'gmail',
      source_ref: id,
      raw_text: text,
      claude_response: extraction.raw_claude_response,
      proposed_reservation: proposed,
      confidence: extraction.confidence,
      status: 'pending',
    });
    candidatesCreated += 1;
  }

  const promoted = await autoPromoteAboveThreshold(cfg.autoPromoteThreshold);
  await updateLastSyncedAt();

  return { candidatesCreated, promoted };
}

interface LoadedConfig {
  senderAllowlist: string[];
  gmailLabelName: string;
  autoPromoteThreshold: number;
  lastSyncedAt: string | null;
}

async function loadConfig(): Promise<LoadedConfig> {
  const settingsRow = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
  const syncRow = await db
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
  const rows = await db
    .select({ ref: extractionCandidates.sourceRef })
    .from(extractionCandidates)
    .where(eq(extractionCandidates.source, 'gmail'));
  return new Set(rows.map((r) => r.ref).filter((r): r is string => !!r));
}

async function autoAssignTrip(startAt: string): Promise<string | null> {
  const all = await db.select().from(trips);
  const matches = all.filter((t) => {
    // A trip claims the date if start_date ≤ local-day(start_at, trip tz) ≤ end_date.
    const day = dateInZone(startAt, t.homeTimezone);
    return day >= t.startDate && day <= t.endDate;
  });
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

async function updateLastSyncedAt(): Promise<void> {
  await db
    .insert(gmailSyncState)
    .values({ id: SYNC_STATE_ID, lastSyncedAt: nowIso() })
    .onConflictDoUpdate({
      target: gmailSyncState.id,
      set: { lastSyncedAt: nowIso() },
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

// Suppress unused-import warning for `and` — it's part of drizzle's API surface
// the file may grow into when we add finer-grained queries.
void and;
