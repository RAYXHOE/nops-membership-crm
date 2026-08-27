import { afterEach, describe, expect, it, vi } from "vitest";

function createFakeDatabase() {
  const grants = new Map<string, number>();
  let nextCouponId = 1;
  let insertAttempts = 0;

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
        insertAttempts += 1;
        // 두 요청이 같은 시점에 기존 발급 건을 조회한 상황을 재현한다.
        await Promise.resolve();
        const key = `${data.memberId}:${data.grantKey ?? ""}`;
        if (data.grantKey && grants.has(key)) {
          const error = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 });
          throw error;
        }
        grants.set(key, nextCouponId++);
      }),
    })),
  };

  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    insert: vi.fn(),
  };

  return {
    db,
    tx,
    get insertAttempts() {
      return insertAttempts;
    },
    get persistedCouponCount() {
      return grants.size;
    },
  };
}

async function loadIssuer(fakeDb: ReturnType<typeof createFakeDatabase>["db"]) {
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://test:password@localhost:3306/nops";
  vi.doMock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
  return import("./db");
}

afterEach(() => {
  vi.doUnmock("drizzle-orm/mysql2");
  vi.resetModules();
});

describe("가입 기념 10% 할인 쿠폰 중복 발급 방지", () => {
  it("가입·자동 보정 경쟁 시 DB 고유 제약 충돌을 두 번째 발급 생략으로 처리한다", async () => {
    const fake = createFakeDatabase();
    const { issueCoupon, SIGNUP_DISCOUNT_GRANT_KEY } = await loadIssuer(fake.db);

    const baseCoupon = {
      memberId: 42,
      templateId: 1,
      type: "discount_percent" as const,
      discountPercent: 10,
      name: "가입 기념 10% 할인",
      description: "테스트",
      expiresAt: new Date("2027-08-27T00:00:00.000Z"),
      grantKey: SIGNUP_DISCOUNT_GRANT_KEY,
    };

    const [registration, autoFix] = await Promise.all([
      issueCoupon({ ...baseCoupon, code: "NOPS-REGISTER" }),
      issueCoupon({ ...baseCoupon, code: "NOPS-AUTOFIX" }),
    ]);

    expect([registration.issued, autoFix.issued].filter(Boolean)).toHaveLength(1);
    expect([registration.issued, autoFix.issued].filter((issued) => !issued)).toHaveLength(1);
    expect(fake.persistedCouponCount).toBe(1);
    expect(fake.insertAttempts).toBe(2);
    expect(fake.tx.execute).toHaveBeenCalledTimes(2);
  });

  it("관리자 수동 발급에서 발급 키를 생략해도 10% 할인은 동일한 고유 키로 보호한다", async () => {
    const fake = createFakeDatabase();
    const { issueCoupon } = await loadIssuer(fake.db);

    const result = await issueCoupon({
      memberId: 42,
      templateId: 1,
      code: "NOPS-MANUAL",
      type: "discount_percent",
      discountPercent: 10,
      name: "가입 기념 10% 할인",
      description: "수동 발급 테스트",
      expiresAt: new Date("2027-08-27T00:00:00.000Z"),
    });

    expect(result.issued).toBe(true);
    expect(fake.tx.insert).toHaveBeenCalledTimes(1);
    const inserted = fake.tx.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as { grantKey?: string };
    expect(inserted.grantKey).toBe("signup_discount_v1");
  });
});
