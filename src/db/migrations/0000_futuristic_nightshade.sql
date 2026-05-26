CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text,
	`kind` text NOT NULL,
	`storage_uri` text NOT NULL,
	`ocr_text` text,
	`extraction_run_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "attachments_kind_ck" CHECK(kind IN ('pdf', 'image'))
);
--> statement-breakpoint
CREATE TABLE `extraction_candidates` (
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
	CONSTRAINT "candidates_source_ck" CHECK(source IN ('gmail', 'upload', 'manual')),
	CONSTRAINT "candidates_status_ck" CHECK(status IN ('pending', 'accepted', 'rejected', 'merged_into'))
);
--> statement-breakpoint
CREATE TABLE `gmail_sync_state` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`last_history_id` text,
	`last_synced_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`geocode_query` text NOT NULL,
	`place_id` text,
	`timezone` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
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
	CONSTRAINT "reservations_source_ck" CHECK(source IN ('gmail', 'upload', 'manual')),
	CONSTRAINT "reservations_status_ck" CHECK(status IN ('confirmed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`anthropic_api_key_present` integer DEFAULT false NOT NULL,
	`auto_promote_threshold` real DEFAULT 0.9 NOT NULL,
	`sender_allowlist` text DEFAULT '[]' NOT NULL,
	`gmail_label_name` text DEFAULT 'trip-os/inbox' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`home_timezone` text NOT NULL,
	`cover_image_uri` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`synced_at` text
);
