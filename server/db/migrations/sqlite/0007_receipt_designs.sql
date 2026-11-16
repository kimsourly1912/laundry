CREATE TABLE `receipt_designs` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`image` text NOT NULL,
	`image_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`fields` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "receipt_designs_image_type_check" CHECK("receipt_designs"."image_type" in ('image/png', 'image/jpeg')),
	CONSTRAINT "receipt_designs_size_check" CHECK("receipt_designs"."width" between 200 and 2000 and "receipt_designs"."height" between 200 and 2000),
	CONSTRAINT "receipt_designs_fields_check" CHECK(json_valid("receipt_designs"."fields") and json_type("receipt_designs"."fields") = 'array')
);
