import { describe, expect, it } from "vitest";
import {
  COUPON_EXPIRY_REMINDER_DAYS,
  COUPON_VALIDITY_DAYS,
  getCouponExpiryAt,
} from "@shared/couponPolicy";

describe("쿠폰 유효기간 정책", () => {
  it("모든 신규 쿠폰의 만료일을 발급일로부터 365일 후로 계산한다", () => {
    const issuedAt = new Date("2026-08-26T00:00:00.000Z");
    expect(getCouponExpiryAt(issuedAt).toISOString()).toBe("2027-08-26T00:00:00.000Z");
    expect(COUPON_VALIDITY_DAYS).toBe(365);
  });

  it("만료 안내 기준을 D-30으로 고정한다", () => {
    expect(COUPON_EXPIRY_REMINDER_DAYS).toBe(30);
  });
});
