ALTER TABLE `inquiries` ADD `notificationStatus` enum('pending','sent','failed') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `notificationSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `notificationError` text;