-- Auto-bump updated_at on every row update for tables that have it.
-- Drizzle doesn't emit triggers itself, so they live in this hand-written migration.

CREATE TRIGGER IF NOT EXISTS trips_updated_at
AFTER UPDATE ON trips FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE trips SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS reservations_updated_at
AFTER UPDATE ON reservations FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE reservations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS locations_updated_at
AFTER UPDATE ON locations FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE locations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS attachments_updated_at
AFTER UPDATE ON attachments FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE attachments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS extraction_candidates_updated_at
AFTER UPDATE ON extraction_candidates FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE extraction_candidates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS settings_updated_at
AFTER UPDATE ON settings FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.id;
END;
--> statement-breakpoint
-- Seed singleton rows. INSERT OR IGNORE so re-running migrations is safe.
INSERT OR IGNORE INTO settings (id) VALUES ('default');
--> statement-breakpoint
INSERT OR IGNORE INTO gmail_sync_state (id) VALUES ('default');
