import { sql } from 'drizzle-orm';
import { sqliteTable, text, real, integer, check } from 'drizzle-orm/sqlite-core';

export const RESERVATION_TYPES = ['flight', 'lodging', 'dining', 'activity', 'transit'] as const;
export const RESERVATION_SOURCES = ['gmail', 'upload', 'manual'] as const;
export const RESERVATION_STATUSES = ['confirmed', 'cancelled'] as const;
export const ATTACHMENT_KINDS = ['pdf', 'image'] as const;
export const CANDIDATE_STATUSES = ['pending', 'accepted', 'rejected', 'merged_into'] as const;

const inList = (values: readonly string[]) =>
  values.map((v) => `'${v}'`).join(', ');

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  homeTimezone: text('home_timezone').notNull(),
  coverImageUri: text('cover_image_uri'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  syncedAt: text('synced_at'),
});

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  lat: real('lat'),
  lng: real('lng'),
  geocodeQuery: text('geocode_query').notNull(),
  placeId: text('place_id'),
  timezone: text('timezone').notNull(),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const reservations = sqliteTable(
  'reservations',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    startAt: text('start_at').notNull(),
    endAt: text('end_at'),
    startLocationId: text('start_location_id').references(() => locations.id),
    endLocationId: text('end_location_id').references(() => locations.id),
    confirmationCode: text('confirmation_code'),
    source: text('source').notNull(),
    sourceRef: text('source_ref'),
    confidence: real('confidence'),
    status: text('status').notNull().default('confirmed'),
    details: text('details').notNull().default('{}'),
    manuallyEditedAt: text('manually_edited_at'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    syncedAt: text('synced_at'),
  },
  (t) => [
    check('reservations_type_ck', sql.raw(`type IN (${inList(RESERVATION_TYPES)})`)),
    check('reservations_source_ck', sql.raw(`source IN (${inList(RESERVATION_SOURCES)})`)),
    check('reservations_status_ck', sql.raw(`status IN (${inList(RESERVATION_STATUSES)})`)),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    reservationId: text('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(),
    storageUri: text('storage_uri').notNull(),
    ocrText: text('ocr_text'),
    extractionRunId: text('extraction_run_id'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [check('attachments_kind_ck', sql.raw(`kind IN (${inList(ATTACHMENT_KINDS)})`))],
);

export const extractionCandidates = sqliteTable(
  'extraction_candidates',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    sourceRef: text('source_ref'),
    rawText: text('raw_text'),
    claudeResponse: text('claude_response'),
    proposedReservation: text('proposed_reservation').notNull(),
    confidence: real('confidence').notNull().default(0),
    status: text('status').notNull().default('pending'),
    mergedIntoReservationId: text('merged_into_reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    check('candidates_source_ck', sql.raw(`source IN (${inList(RESERVATION_SOURCES)})`)),
    check('candidates_status_ck', sql.raw(`status IN (${inList(CANDIDATE_STATUSES)})`)),
  ],
);

export const gmailSyncState = sqliteTable('gmail_sync_state', {
  id: text('id').primaryKey().default('default'),
  lastHistoryId: text('last_history_id'),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().default('default'),
  anthropicApiKeyPresent: integer('anthropic_api_key_present', { mode: 'boolean' })
    .notNull()
    .default(false),
  autoPromoteThreshold: real('auto_promote_threshold').notNull().default(0.9),
  senderAllowlist: text('sender_allowlist').notNull().default('[]'),
  gmailLabelName: text('gmail_label_name').notNull().default('trip-os/inbox'),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type ExtractionCandidate = typeof extractionCandidates.$inferSelect;
export type NewExtractionCandidate = typeof extractionCandidates.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type GmailSyncState = typeof gmailSyncState.$inferSelect;
