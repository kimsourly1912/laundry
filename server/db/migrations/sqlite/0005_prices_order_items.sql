-- Hand-edited (D39): `orders.due_date` is added in place with its CHECK; drizzle-kit's rebuild of
-- `orders` would cascade to its Telegram rows (see 0003). The snapshot is drizzle-kit's.
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`order_id` text NOT NULL,
	`field_id` text NOT NULL,
	`position` integer NOT NULL,
	`price_item_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`price_item_id`) REFERENCES `price_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`order_id`) REFERENCES `orders`(`shop_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_items_unit_check" CHECK("order_items"."unit" in ('piece', 'kg')),
	CONSTRAINT "order_items_quantity_check" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_amounts_check" CHECK("order_items"."unit_price" >= 0 and "order_items"."line_total" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_position_unique` ON `order_items` (`order_id`,`position`);--> statement-breakpoint
CREATE TABLE `price_items` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	`price` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "price_items_unit_check" CHECK("price_items"."unit" in ('piece', 'kg')),
	CONSTRAINT "price_items_price_check" CHECK("price_items"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_items_shop_key_unique` ON `price_items` (`shop_id`,`key`);--> statement-breakpoint
CREATE INDEX `price_items_shop_label_idx` ON `price_items` (`shop_id`,`label`);--> statement-breakpoint
CREATE UNIQUE INDEX `price_items_shop_id_id_unique` ON `price_items` (`shop_id`,`id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `due_date` text CONSTRAINT "orders_due_date_check" CHECK(`due_date` is null or `due_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
