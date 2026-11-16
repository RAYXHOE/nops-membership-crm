CREATE TABLE `occasion_automation_settings` (
	`key` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`channelMode` enum('none','email','sms','email_sms') NOT NULL DEFAULT 'none',
	`startDate` date NOT NULL,
	`birthdayTaskUid` varchar(65),
	`anniversaryTaskUid` varchar(65),
	`dispatchTaskUid` varchar(65),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `occasion_automation_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `occasion_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`couponId` int NOT NULL,
	`type` enum('birthday','anniversary') NOT NULL,
	`occasionYear` int NOT NULL,
	`occasionDate` date NOT NULL,
	`scheduledDate` date NOT NULL,
	`channel` enum('email','sms') NOT NULL,
	`status` enum('pending','sending','accepted','delivered','failed','unknown','cancelled','blocked') NOT NULL DEFAULT 'pending',
	`destinationHash` varchar(64) NOT NULL,
	`providerMessageId` varchar(128),
	`reason` varchar(100),
	`attemptAt` timestamp,
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `occasion_notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `occasion_notice_member_year_channel_unique` UNIQUE(`memberId`,`type`,`occasionYear`,`channel`)
);
--> statement-breakpoint
CREATE INDEX `occasion_birthday_task_idx` ON `occasion_automation_settings` (`birthdayTaskUid`);--> statement-breakpoint
CREATE INDEX `occasion_anniversary_task_idx` ON `occasion_automation_settings` (`anniversaryTaskUid`);--> statement-breakpoint
CREATE INDEX `occasion_dispatch_task_idx` ON `occasion_automation_settings` (`dispatchTaskUid`);--> statement-breakpoint
CREATE INDEX `occasion_notice_pending_idx` ON `occasion_notifications` (`scheduledDate`,`status`);--> statement-breakpoint
CREATE INDEX `occasion_notice_provider_idx` ON `occasion_notifications` (`providerMessageId`);