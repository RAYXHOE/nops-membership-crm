ALTER TABLE `consent_logs` MODIFY COLUMN `consentType` enum('privacy','marketing','marketing_withdraw','kakao_marketing','kakao_marketing_withdraw') NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `kakaoMarketingConsent` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `kakaoMarketingConsentAt` timestamp;--> statement-breakpoint
ALTER TABLE `members` ADD `kakaoMarketingConsentContent` text;