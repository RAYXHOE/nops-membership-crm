CREATE TABLE `member_contact_challenges` (
	`id` varchar(36) NOT NULL,
	`memberId` int,
	`purpose` enum('phone_login','email_change') NOT NULL,
	`target` varchar(320) NOT NULL,
	`issuerHash` varchar(64),
	`emailSnapshot` varchar(320),
	`phoneSnapshot` varchar(20),
	`codeHash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`verifiedAt` timestamp,
	`usedAt` timestamp,
	`requesterHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_contact_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `member_contact_member_purpose_created` ON `member_contact_challenges` (`memberId`,`purpose`,`createdAt`);--> statement-breakpoint
CREATE INDEX `member_contact_target_purpose_created` ON `member_contact_challenges` (`target`,`purpose`,`createdAt`);--> statement-breakpoint
CREATE INDEX `member_contact_requester_created` ON `member_contact_challenges` (`requesterHash`,`createdAt`);