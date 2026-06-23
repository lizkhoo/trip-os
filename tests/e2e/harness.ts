/**
 * End-to-end test harness.
 *
 * Stands up a real drizzle client over an in-memory better-sqlite3 database with
 * all migrations applied, injects it into the DB port (`__setDbForTest`), and
 * installs deterministic mocks for the three network boundaries: Gmail, Claude
 * extraction, and secrets. The e2e tests then drive the REAL services and
 * orchestrators (runGmailSync, acceptCandidate, buildItineraryDays, …) against
 * this database — no expo-sqlite, no network.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { applyMigrations } from '../../scripts/migrate';
import { __setDbForTest, schema, type Db } from '@/db/client';
import {
  __setExtractForTest,
  type AttachmentExtractionArgs,
  type EmailExtractionArgs,
  type ExtractionResult,
} from '@/services/extract';
import {
  __setGmailForTest,
  type GmailAdapter,
  type GmailMessageSummary,
  type GmailProfile,
} from '@/services/gmail';
import { __setSecretsForTest, type GmailTokens } from '@/services/secrets';

export interface Harness {
  /** Raw better-sqlite3 handle, for direct SQL assertions if a test needs them. */
  raw: Database.Database;
  /** The drizzle client injected into the DB port. */
  db: BetterSQLite3Database<typeof schema>;
  /** Reset all test hatches and close the database. */
  teardown: () => void;
}

/**
 * Build a fresh in-memory database, apply migrations, wire it into the DB port,
 * and stub secrets so getAnthropicKey/getGmailTokens return fixtures.
 */
export function createHarness(): Harness {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  applyMigrations(raw);

  const db = drizzle(raw, { schema });
  // The better-sqlite3 client is query-builder-compatible with the expo-sqlite
  // client the app uses; the cast keeps the injected client typed as the port's Db.
  __setDbForTest(db as unknown as Db);

  // Default secret fixtures so any code path that reaches getAnthropicKey /
  // getGmailTokens succeeds without expo-secure-store. Tests usually rely on the
  // gmail/extract hatches instead, so these just need to be non-null.
  __setSecretsForTest({
    anthropicKey: 'test-anthropic-key',
    gmailTokens: {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      accessTokenExpirationDate: '2099-01-01T00:00:00Z',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    } satisfies GmailTokens,
  });

  return {
    raw,
    db,
    teardown: () => {
      __setDbForTest(null);
      __setExtractForTest(null);
      __setGmailForTest(null);
      __setSecretsForTest(null);
      raw.close();
    },
  };
}

// --- Deterministic boundary mocks ------------------------------------------------

export interface MockGmailMessage {
  id: string;
  subject: string;
  from?: string;
  bodyText: string;
  date?: string;
  snippet?: string;
}

/**
 * Install a deterministic Gmail adapter via the gmail test hatch. searchMessageIds
 * returns the given messages' ids; fetchMessage returns the matching summary;
 * getProfile returns a fixed historyId. Attachment endpoints throw — pathway 1
 * doesn't touch them.
 */
export function installMockGmail(
  messages: MockGmailMessage[],
  opts: { historyId?: string } = {},
): void {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const adapter: GmailAdapter = {
    searchMessageIds: async () => messages.map((m) => m.id),
    fetchMessage: async (id): Promise<GmailMessageSummary> => {
      const m = byId.get(id);
      if (!m) throw new Error(`mock gmail: unknown message ${id}`);
      return {
        id: m.id,
        subject: m.subject,
        from: m.from ?? 'noreply@example.com',
        bodyText: m.bodyText,
        date: m.date ?? '2026-03-01',
        snippet: m.snippet ?? m.subject,
      };
    },
    getProfile: async (): Promise<GmailProfile> => ({ historyId: opts.historyId ?? '1' }),
    getAttachment: async () => {
      throw new Error('mock gmail: getAttachment not configured');
    },
    listAttachments: async () => [],
  };
  __setGmailForTest(adapter);
}

/**
 * Install a deterministic Claude extraction via the extract test hatch. Keyed by
 * message_id (the id the orchestrator passes through). Each entry is returned
 * verbatim as a successful ExtractionResult.
 */
export function installMockExtract(
  byMessageId: Map<string, ExtractionResult>,
): void {
  __setExtractForTest({
    extractReservationFromEmail: async (args: EmailExtractionArgs): Promise<ExtractionResult> => {
      const r = byMessageId.get(args.message_id);
      if (!r) throw new Error(`mock extract: no extraction for ${args.message_id}`);
      return r;
    },
    extractReservationFromAttachment: async (
      _args: AttachmentExtractionArgs,
    ): Promise<ExtractionResult> => {
      throw new Error('mock extract: attachment extraction not configured');
    },
  });
}
