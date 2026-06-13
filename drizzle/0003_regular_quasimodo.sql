ALTER TABLE `coupons` MODIFY COLUMN `type` enum('discount_percent','corkage_free','birthday','anniversary') NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `anniversaryDate` date;--> statement-breakpoint
ALTER TABLE `users` ADD `branchCode` varchar(20);