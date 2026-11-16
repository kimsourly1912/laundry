CREATE TABLE `notifications` (
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
	CONSTRAINT "notifications_kind_check" CHECK("notifications"."kind" in ('receipt', 'ready', 'collected')),
	CONSTRAINT "notifications_status_check" CHECK("notifications"."status" in ('pending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "notifications_attempts_check" CHECK("notifications"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notifications_order_idx` ON `notifications` (`shop_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `telegram_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_invites_expires_idx` ON `telegram_invites` (`expires_at`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`order_id` text,
	`telegram_user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`verified_phone` integer NOT NULL,
	`linked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`customer_id`) REFERENCES `customers`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "telegram_links_verified_check" CHECK(not ("telegram_links"."verified_phone" and "telegram_links"."order_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_customer_unique` ON `telegram_links` (`shop_id`,`customer_id`,`telegram_user_id`) WHERE "telegram_links"."revoked_at" is null and "telegram_links"."order_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_order_unique` ON `telegram_links` (`shop_id`,`order_id`,`telegram_user_id`) WHERE "telegram_links"."revoked_at" is null and "telegram_links"."order_id" is not null;--> statement-breakpoint
CREATE INDEX `telegram_links_chat_idx` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE TABLE `telegram_pending` (
	`telegram_user_id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_pending_expires_idx` ON `telegram_pending` (`expires_at`);