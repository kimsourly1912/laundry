CREATE TABLE `slip_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`definition` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "slip_templates_status_check" CHECK("slip_templates"."status" in ('active', 'archived')),
	CONSTRAINT "slip_templates_currency_check" CHECK("slip_templates"."currency" in ('KHR', 'USD')),
	CONSTRAINT "slip_templates_definition_check" CHECK(json_valid("slip_templates"."definition"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slip_templates_name_unique` ON `slip_templates` (lower("name"));--> statement-breakpoint
CREATE INDEX `slip_templates_status_name_idx` ON `slip_templates` (`status`,`name`);