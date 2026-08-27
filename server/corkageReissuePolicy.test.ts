import { describe, expect, it } from "vitest";
import { CORKAGE_REISSUE_DELAY_DAYS, getCouponExpiryAt } from "@shared/couponPolicy";
import { getCorkageReissueTargetWindow } from "./db";

describe("콜키지 프리 재발급 정책", () => {
  it("쿠폰 사용 완료 후 30일에 재발급 대상을 조회한다", () => {
    expect(CORKAGE_REISSUE_DELAY_DAYS).toBe(30);

    const { targetStart, targetEnd } = getCorkageReissueTargetWindow(
      new Date("2026-08-30T09:00:00.000Z")
    );

    expect(targetStart.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(targetEnd.toISOString()).toBe("2026-07-31T23:59:59.999Z");

    // 29일 전·31일 전 사용 이력은 조회 구간 밖이어야 한다.
    expect(new Date("2026-08-01T00:00:00.000Z") > targetEnd).toBe(true);
    expect(new Date("2026-07-30T23:59:59.999Z") < targetStart).toBe(true);
  });

  it("재발급된 콜키지 쿠폰도 발급일 기준 365일 동안 유효하다", () => {
    const issuedAt = new Date("2026-08-30T00:00:00.000Z");
    const expiresAt = getCouponExpiryAt(issuedAt);

    expect(expiresAt.toISOString()).toBe("2027-08-30T00:00:00.000Z");
  });
});
