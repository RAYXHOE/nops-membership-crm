import { afterEach, describe, expect, it, vi } from "vitest";
import { getSepCombo2026ExpiryAt, SEP_COMBO_2026 } from "@shared/septemberComboCampaign";

function createFakeDatabase() {
  const grants = new Map<string, number>();
  let nextCouponId = 1;
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            const first = grants.values().next().value as number | undefined;
            return first ? [{ id: first }] : [];
          }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (data: { memberId: number; grantKey?: string }) => {
        const key = `${data.memberId}:${data.grantKey ?? ""}`;
        if (grants.has(key)) {
          throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 });
        }
        grants.set(key, nextCouponId++);
      }),
    })),
  };
  return {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    insert: vi.fn(),
  };
}

async function loadIssuer(fakeDb: ReturnType<typeof createFakeDatabase>) {
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://test:password@localhost:3306/nops";
  vi.doMock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
  return import("./db");
}

afterEach(() => {
  vi.doUnmock("drizzle-orm/mysql2");
  vi.resetModules();
});

describe("9월 베네핏 콤보 이벤트 쿠폰 정책", () => {
  it("DB 초 단위 정밀도에서도 2026-10-05 23:59:59 KST를 고정 만료일로 사용한다", () => {
    expect(getSepCombo2026ExpiryAt().toISOString()).toBe("2026-10-05T14:59:59.000Z");
    expect(SEP_COMBO_2026.discountPercent).toBe(10);
    expect(SEP_COMBO_2026.templateValidityDays).toBe(27);
    expect(SEP_COMBO_2026.grantKey).toBe("sep_combo_2026_v1");
  });

  it("같은 회원에게 같은 캠페인 쿠폰을 동시에 요청해도 한 장만 발급한다", async () => {
    const fakeDb = createFakeDatabase();
    const { issueCoupon } = await loadIssuer(fakeDb);
    const baseCoupon = {
      memberId: 77,
      templateId: 7,
      type: "discount_percent" as const,
      discountPercent: SEP_COMBO_2026.discountPercent,
      name: SEP_COMBO_2026.couponName,
      description: SEP_COMBO_2026.description,
      expiresAt: getSepCombo2026ExpiryAt(),
      grantKey: SEP_COMBO_2026.grantKey,
    };

    const [first, second] = await Promise.all([
      issueCoupon({ ...baseCoupon, code: "SEP-ONE" }),
      issueCoupon({ ...baseCoupon, code: "SEP-TWO" }),
    ]);

    expect([first.issued, second.issued].filter(Boolean)).toHaveLength(1);
    expect([first.issued, second.issued].filter((issued) => !issued)).toHaveLength(1);
  });
});
