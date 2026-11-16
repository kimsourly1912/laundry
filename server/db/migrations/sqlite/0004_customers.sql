CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`phone_e164` text,
	`note` text,
	`anonymized_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_shop_phone_unique` ON `customers` (`shop_id`,`phone_e164`) WHERE "customers"."phone_e164" is not null;--> statement-breakpoint
CREATE INDEX `customers_shop_updated_idx` ON `customers` (`shop_id`,`updated_at`);