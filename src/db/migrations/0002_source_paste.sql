-- Widen the source CHECK on `reservations` and `extraction_candidates` to admit
-- 'paste' (free text the user pasted/dictated into the paste box).
--
-- HAND-EDITED from drizzle-kit's generated output. Two things the generated
-- version got wrong for this schema, both silent-data-loss class:
--
-- 1. `PRAGMA foreign_keys=OFF` is a NO-OP here. drizzle's migrator runs every
--    migration inside a transaction (sqlite-core/dialect.ts `session.transaction`)
--    and SQLite ignores that pragma while a transaction is open. The app opens
--    the database with `foreign_keys = ON` (src/db/client.ts), so FKs are live
--    for the whole migration. `defer_foreign_keys` does not help either — it
--    defers violation *reporting*, it does not suppress ON DELETE actions.
-- 2. With FKs live, `DROP TABLE reservations` performs an implicit DELETE of
--    every row, which fires ON DELETE SET NULL on `attachments.reservation_id`
--    and `extraction_candidates.merged_into_reservation_id` — silently unlinking
--    every attachment from its reservation.
--
-- So we snapshot both referencing columns before the rebuild and restore them
-- after. Row ids are preserved across the rebuild, so the restored references
-- are valid at the point the UPDATE runs.
--
-- The `*_updated_at` triggers on the rebuilt tables die with DROP TABLE and are
-- recreated at the end. The attachments trigger is dropped/recreated too, so the
-- link-restoring UPDATE doesn't bump every attachment's updated_at.

CREATE TEMP TABLE `_mig0002_attachment_links` AS
  SELECT `id`, `reservation_id` FROM `attachments` WHERE `reservation_id` IS NOT NULL;
--> statement-breakpoint
CREATE TEMP TABLE `_mig0002_candidate_links` AS
  SELECT `id`, `merged_into_reservation_id` FROM `extraction_candidates`
  WHERE `merged_into_reservation_id` IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `attachments_updated_at`;
--> statement-breakpoint
CREATE TABLE `__new_extraction_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text,
	`source` text NOT NULL,
	`source_ref` text,
	`raw_text` text,
	`claude_response` text,
	`proposed_reservation` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`merged_into_reservation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`merged_into_reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "candidates_source_ck" CHECK(source IN ('gmail', 'upload', 'manual', 'paste')),
	CONSTRAINT "candidates_status_ck" CHECK(status IN ('pending', 'accepted', 'rejected', 'merged_into'))
);
--> statement-breakpoint
INSERT INTO `__new_extraction_candidates`("id", "trip_id", "source", "source_ref", "raw_text", "claude_response", "proposed_reservation", "confidence", "status", "merged_into_reservation_id", "created_at", "updated_at") SELECT "id", "trip_id", "source", "source_ref", "raw_text", "claude_response", "proposed_reservation", "confidence", "status", "merged_into_reservation_id", "created_at", "updated_at" FROM `extraction_candidates`;
--> statement-breakpoint
DROP TABLE `extraction_candidates`;
--> statement-breakpoint
ALTER TABLE `__new_extraction_candidates` RENAME TO `extraction_candidates`;
--> statement-breakpoint
CREATE TABLE `__new_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`start_location_id` text,
	`end_location_id` text,
	`confirmation_code` text,
	`source` text NOT NULL,
	`source_ref` text,
	`confidence` real,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`manually_edited_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`start_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`end_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservations_type_ck" CHECK(type IN ('flight', 'lodging', 'dining', 'activity', 'transit')),
	CONSTRAINT "reservations_source_ck" CHECK(source IN ('gmail', 'upload', 'manual', 'paste')),
	CONSTRAINT "reservations_status_ck" CHECK(status IN ('confirmed', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_reservations`("id", "trip_id", "type", "title", "start_at", "end_at", "start_location_id", "end_location_id", "confirmation_code", "source", "source_ref", "confidence", "status", "details", "manually_edited_at", "created_at", "updated_at", "synced_at") SELECT "id", "trip_id", "type", "title", "start_at", "end_at", "start_location_id", "end_location_id", "confirmation_code", "source", "source_ref", "confidence", "status", "details", "manually_edited_at", "created_at", "updated_at", "synced_at" FROM `reservations`;
--> statement-breakpoint
DROP TABLE `reservations`;
--> statement-breakpoint
ALTER TABLE `__new_reservations` RENAME TO `reservations`;
--> statement-breakpoint
-- Restore the references the implicit DELETE nulled out.
UPDATE `attachments` SET `reservation_id` = (
  SELECT `reservation_id` FROM `_mig0002_attachment_links` WHERE `_mig0002_attachment_links`.`id` = `attachments`.`id`
) WHERE `id` IN (SELECT `id` FROM `_mig0002_attachment_links`);
--> statement-breakpoint
UPDATE `extraction_candidates` SET `merged_into_reservation_id` = (
  SELECT `merged_into_reservation_id` FROM `_mig0002_candidate_links` WHERE `_mig0002_candidate_links`.`id` = `extraction_candidates`.`id`
) WHERE `id` IN (SELECT `id` FROM `_mig0002_candidate_links`);
--> statement-breakpoint
DROP TABLE `_mig0002_attachment_links`;
--> statement-breakpoint
DROP TABLE `_mig0002_candidate_links`;
--> statement-breakpoint
-- Recreate the updated_at triggers the rebuild dropped (0001 already ran, so its
-- CREATE TRIGGER IF NOT EXISTS statements will never bring these back).
CREATE TRIGGER IF NOT EXISTS reservations_updated_at
AFTER UPDATE ON reservations FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE reservations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS extraction_candidates_updated_at
AFTER UPDATE ON extraction_candidates FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE extraction_candidates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS attachments_updated_at
AFTER UPDATE ON attachments FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE attachments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
