CREATE TABLE `consent_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`consentType` enum('privacy','marketing','marketing_withdraw') NOT NULL,
	`agreed` boolean NOT NULL,
	`consentContent` text NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupon_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('discount_percent','corkage_free','birthday') NOT NULL,
	`discountPercent` int,
	`description` text,
	`validDays` int NOT NULL DEFAULT 365,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupon_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`templateId` int NOT NULL,
	`code` varchar(20) NOT NULL,
	`type` enum('discount_percent','corkage_free','birthday') NOT NULL,
	`discountPercent` int,
	`name` varchar(100) NOT NULL,
	`description` text,
	`status` enum('active','used','expired') NOT NULL DEFAULT 'active',
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`usedByStaffId` int,
	`usedNote` text,
	`birthdayYear` int,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`birthDate` date NOT NULL,
	`privacyConsent` boolean NOT NULL DEFAULT false,
	`privacyConsentAt` timestamp,
	`privacyConsentContent` text,
	`marketingConsent` boolean NOT NULL DEFAULT false,
	`marketingConsentAt` timestamp,
	`marketingConsentContent` text,
	`status` enum('active','inactive','withdrawn') NOT NULL DEFAULT 'active',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`notes` text,
	CONSTRAINT `members_id` PRIMARY KEY(`id`),
	CONSTRAINT `members_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`visitId` int,
	`amount` decimal(10,2) NOT NULL,
	`discountAmount` decimal(10,2) DEFAULT '0',
	`finalAmount` decimal(10,2) NOT NULL,
	`couponId` int,
	`memo` text,
	`purchasedAt` timestamp NOT NULL,
	`recordedByStaffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`visitedAt` timestamp NOT NULL,
	`partySize` int,
	`notes` text,
	`recordedByStaffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
