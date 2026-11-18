CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_shop_phone_unique` ON `customers` (`shop_id`,`phone`) WHERE "customers"."phone" is not null;--> statement-breakpoint
CREATE INDEX `customers_shop_name_idx` ON `customers` (`shop_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_shop_id_id_unique` ON `customers` (`shop_id`,`id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_name` text;--> statement-breakpoint
CREATE INDEX `orders_shop_customer_idx` ON `orders` (`shop_id`,`customer_id`,`created_at`);