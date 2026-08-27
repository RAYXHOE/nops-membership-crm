ALTER TABLE `coupons` ADD `grantKey` varchar(64);--> statement-breakpoint
UPDATE `coupons`
SET `grantKey` = 'signup_discount_v1'
WHERE `type` = 'discount_percent'
  AND `id` IN (
    SELECT `coupon_id`
    FROM (
      SELECT MIN(`id`) AS `coupon_id`
      FROM `coupons`
      WHERE `type` = 'discount_percent'
      GROUP BY `memberId`
    ) AS `canonical_signup_discounts`
  );--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_member_grant_key_unique` UNIQUE(`memberId`,`grantKey`);
