CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`revision` integer PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`date` text NOT NULL,
	`data` text NOT NULL
);
