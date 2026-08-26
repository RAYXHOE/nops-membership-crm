import { describe, expect, it } from "vitest";
import { MISSING_POINTS_QUERY } from "./pointsMissingQuery";

describe("MISSING_POINTS_QUERY", () => {
  it("purchases 스키마에 없는 status 컬럼을 참조하지 않는다", () => {
    expect(MISSING_POINTS_QUERY).not.toContain("p.status");
  });

  it("earn 포인트 이력이 없는 최소 3,334원 이상 구매만 누락 대상으로 찾는다", () => {
    expect(MISSING_POINTS_QUERY).toContain("p.finalAmount >= 3334");
    expect(MISSING_POINTS_QUERY).toContain("pt.type = 'earn'");
    expect(MISSING_POINTS_QUERY).toContain("pt.id IS NULL");
  });
});
