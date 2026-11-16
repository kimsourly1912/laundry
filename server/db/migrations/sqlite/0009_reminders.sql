-- Adds 'reminder' to notifications.kind's CHECK: SQLite changes a CHECK only by rebuilding the
-- table. Nothing references notifications. D1 can't turn foreign keys off inside a migration;
-- it defers them to the end instead (developers.cloudflare.com/d1/sql-api/foreign-keys).
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_kind_check" CHECK("__new_notifications"."kind" in ('receipt', 'ready', 'collected', 'reminder')),
	CONSTRAINT "notifications_status_check" CHECK("__new_notifications"."status" in ('pending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "notifications_attempts_check" CHECK("__new_notifications"."attempts" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "shop_id", "order_id", "chat_id", "kind", "status", "attempts", "last_error", "next_attempt_at", "created_at", "sent_at") SELECT "id", "shop_id", "order_id", "chat_id", "kind", "status", "attempts", "last_error", "next_attempt_at", "created_at", "sent_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notifications_order_idx` ON `notifications` (`shop_id`,`order_id`);