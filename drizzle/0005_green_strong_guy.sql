CREATE TABLE `alimtalk_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(50) NOT NULL,
	`recipientPhone` varchar(20) NOT NULL,
	`recipientName` varchar(100),
	`memberId` int,
	`templateId` varchar(100),
	`variables` text,
	`status` enum('success','failed') NOT NULL,
	`errorMessage` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alimtalk_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(100) NOT NULL,
	`address` text,
	`phone` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int,
	`name` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`category` enum('coupon','membership','points','other') NOT NULL DEFAULT 'other',
	`subject` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`status` enum('pending','answered','closed') NOT NULL DEFAULT 'pending',
	`adminReply` text,
	`repliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`type` enum('earn','use','expire','cancel') NOT NULL,
	`amount` int NOT NULL,
	`balanceAfter` int NOT NULL DEFAULT 0,
	`purchaseId` int,
	`note` text,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coupon_templates` MODIFY COLUMN `type` enum('discount_percent','corkage_free','birthday','anniversary','employee') NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` MODIFY COLUMN `type` enum('discount_percent','corkage_free','birthday','anniversary','employee') NOT NULL;--> statement-breakpoint
ALTER TABLE `coupons` ADD `usedBranchCode` varchar(20);--> statement-breakpoint
ALTER TABLE `members` ADD `pointBalance` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `tier` enum('bronze','silver','gold','vip') DEFAULT 'bronze' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `tierUpdatedAt` timestamp;