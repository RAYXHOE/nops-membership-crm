/** 멤버십 쿠폰은 발급일 기준 365일간 유효하다. */
export const COUPON_VALIDITY_DAYS = 365;

/** 쿠폰 만료 안내는 만료 30일 전에 발송한다. */
export const COUPON_EXPIRY_REMINDER_DAYS = 30;

export function getCouponExpiryAt(issuedAt: Date = new Date()): Date {
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + COUPON_VALIDITY_DAYS);
  return expiresAt;
}
