CREATE TABLE `idempotency_keys` (
	`shop_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`shop_id`, `actor_user_id`, `action`, `key`),
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_idx` ON `idempotency_keys` (`created_at`);--> statement-breakpoint
CREATE TABLE `order_counters` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`data` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_events_type_check" CHECK("order_events"."type" in ('created', 'updated', 'started', 'ready', 'rework', 'collected', 'cancelled', 'payment_recorded', 'ticket_bound'))
);
--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`shop_id`,`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`price_item_id` text,
	`service_name_en` text NOT NULL,
	`service_name_km` text,
	`item_name_en` text NOT NULL,
	`item_name_km` text,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`price_item_id`) REFERENCES `price_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_lines_unit_check" CHECK("order_lines"."unit" in ('piece', 'kg')),
	CONSTRAINT "order_lines_quantity_check" CHECK("order_lines"."quantity" >= 1),
	CONSTRAINT "order_lines_amounts_check" CHECK("order_lines"."unit_price" >= 0 and "order_lines"."line_total" >= 0)
);
--> statement-breakpoint
CREATE INDEX `order_lines_order_idx` ON `order_lines` (`shop_id`,`order_id`,`sort`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`number` integer NOT NULL,
	`customer_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`ready_at` integer,
	`collected_at` integer,
	`paid_at` integer,
	`cancelled_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`customer_id`) REFERENCES `customers`(`shop_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "orders_status_check" CHECK("orders"."status" in ('received', 'in_progress', 'ready', 'collected', 'cancelled')),
	CONSTRAINT "orders_payment_status_check" CHECK("orders"."payment_status" in ('unpaid', 'paid')),
	CONSTRAINT "orders_currency_check" CHECK("orders"."currency" in ('KHR', 'USD')),
	CONSTRAINT "orders_total_check" CHECK("orders"."total" >= 0),
	CONSTRAINT "orders_number_check" CHECK("orders"."number" >= 1),
	CONSTRAINT "orders_paid_at_check" CHECK(("orders"."payment_status" = 'paid') = ("orders"."paid_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_shop_number_unique` ON `orders` (`shop_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_shop_id_id_unique` ON `orders` (`shop_id`,`id`);--> statement-breakpoint
CREATE INDEX `orders_shop_status_created_idx` ON `orders` (`shop_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_shop_created_idx` ON `orders` (`shop_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_shop_customer_idx` ON `orders` (`shop_id`,`customer_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_shop_id_id_unique` ON `customers` (`shop_id`,`id`);