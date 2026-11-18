CREATE TABLE `template_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`kind` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`template_id` text,
	`photo_type` text NOT NULL,
	`photo_width` integer NOT NULL,
	`photo_height` integer NOT NULL,
	`photo_size` integer NOT NULL,
	`photo_data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "template_requests_kind_check" CHECK("template_requests"."kind" in ('keep', 'redesign')),
	CONSTRAINT "template_requests_status_check" CHECK("template_requests"."status" in ('new', 'in_progress', 'done', 'declined')),
	CONSTRAINT "template_requests_photo_type_check" CHECK("template_requests"."photo_type" in ('image/png', 'image/jpeg')),
	CONSTRAINT "template_requests_photo_size_check" CHECK("template_requests"."photo_size" between 1 and 1048576)
);
--> statement-breakpoint
CREATE INDEX `template_requests_status_created_idx` ON `template_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `template_requests_shop_created_idx` ON `template_requests` (`shop_id`,`created_at`);