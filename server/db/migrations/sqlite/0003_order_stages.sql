-- Hand-edited (D39): drizzle-kit rebuilt `orders` to add a CHECK, but dropping `orders` would
-- cascade-delete its Telegram links, invites and messages (D1 enforces foreign keys; its
-- `PRAGMA foreign_keys=OFF` is ignored). The columns are added in place instead; the snapshot is
-- drizzle-kit's. `notifications` is rebuilt (nothing points at it) for its new `kind`.
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
	CONSTRAINT "notifications_kind_check" CHECK("__new_notifications"."kind" in ('slip', 'ready')),
	CONSTRAINT "notifications_status_check" CHECK("__new_notifications"."status" in ('pending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "notifications_attempts_check" CHECK("__new_notifications"."attempts" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "shop_id", "order_id", "chat_id", "kind", "status", "attempts", "last_error", "next_attempt_at", "created_at", "sent_at") SELECT "id", "shop_id", "order_id", "chat_id", "kind", "status", "attempts", "last_error", "next_attempt_at", "created_at", "sent_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notifications_order_idx` ON `notifications` (`shop_id`,`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `stage` text DEFAULT 'received' NOT NULL CONSTRAINT "orders_stage_check" CHECK(`stage` in ('received', 'in_progress', 'ready'));--> statement-breakpoint
ALTER TABLE `orders` ADD `ready_at` integer;--> statement-breakpoint
CREATE INDEX `orders_shop_status_stage_idx` ON `orders` (`shop_id`,`status`,`stage`);
