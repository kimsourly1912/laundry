CREATE TABLE `price_items` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`service_type_id` text NOT NULL,
	`name_en` text NOT NULL,
	`name_km` text,
	`unit` text NOT NULL,
	`price` integer NOT NULL,
	`sort` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shop_id`,`service_type_id`) REFERENCES `service_types`(`shop_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "price_items_status_check" CHECK("price_items"."status" in ('active', 'archived')),
	CONSTRAINT "price_items_unit_check" CHECK("price_items"."unit" in ('piece', 'kg')),
	CONSTRAINT "price_items_price_check" CHECK("price_items"."price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `price_items_shop_status_sort_idx` ON `price_items` (`shop_id`,`status`,`sort`);--> statement-breakpoint
CREATE INDEX `price_items_service_type_idx` ON `price_items` (`shop_id`,`service_type_id`);--> statement-breakpoint
CREATE TABLE `service_types` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name_en` text NOT NULL,
	`name_km` text,
	`sort` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "service_types_status_check" CHECK("service_types"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_types_shop_id_id_unique` ON `service_types` (`shop_id`,`id`);--> statement-breakpoint
CREATE INDEX `service_types_shop_status_sort_idx` ON `service_types` (`shop_id`,`status`,`sort`);