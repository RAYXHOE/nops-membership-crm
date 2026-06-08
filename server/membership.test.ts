import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => {
  const members: Record<string, { id: number; email: string; name: string }> = {};
  const coupons: Array<{ id: number; memberId: number; type: string; status: string; code: string }> = [];
  let memberIdCounter = 1;
  let couponIdCounter = 1;

  return {
    getMemberByEmail: vi.fn(async (email: string) => members[email] ?? undefined),
    createMember: vi.fn(async () => { memberIdCounter++; }),
    createConsentLog: vi.fn(async () => {}),
    getCouponTemplateByType: vi.fn(async (type: string) => ({
      id: 1,
      name: type === "discount_percent" ? "10% 할인" : "콜키지 프리",
      type,
      discountPercent: type === "discount_percent" ? 10 : null,
      description: "테스트",
      validDays: 365,
      isActive: true,
      createdAt: new Date(),
    })),
    issueCoupon: vi.fn(async (data: { memberId: number; type: string; code: string }) => {
      coupons.push({ id: couponIdCounter++, memberId: data.memberId, type: data.type, status: "active", code: data.code });
    }),
    getCouponsByMemberId: vi.fn(async (memberId: number) =>
      coupons.filter((c) => c.memberId === memberId)
    ),
    getCouponByCode: vi.fn(async (code: string) =>
      coupons.find((c) => c.code === code) ?? undefined
    ),
    useCoupon: vi.fn(async () => {}),
    listMembers: vi.fn(async () => ({ items: [], total: 0 })),
    getMemberById: vi.fn(async () => undefined),
    updateMember: vi.fn(async () => {}),
    getConsentLogsByMemberId: vi.fn(async () => []),
    listAllCoupons: vi.fn(async () => ({ items: [], total: 0 })),
    listCouponTemplates: vi.fn(async () => []),
    expireOverdueCoupons: vi.fn(async () => {}),
    getVisitsByMemberId: vi.fn(async () => []),
    createVisit: vi.fn(async () => {}),
    updateVisit: vi.fn(async () => {}),
    deleteVisit: vi.fn(async () => {}),
    getPurchasesByMemberId: vi.fn(async () => []),
    createPurchase: vi.fn(async () => {}),
    updatePurchase: vi.fn(async () => {}),
    deletePurchase: vi.fn(async () => {}),
    getMemberStats: vi.fn(async () => null),
    getCouponStats: vi.fn(async () => null),
    getPurchaseStats: vi.fn(async () => null),
    getMembersWithBirthdayToday: vi.fn(async () => []),
    // Expose for test inspection
    _coupons: coupons,
    _members: members,
    _setMember: (email: string, data: { id: number; email: string; name: string }) => {
      members[email] = data;
    },
  };
});

// ─── Context helpers ──────────────────────────────────────────────────────────
function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-openid",
      email: "admin@nobs.com",
      name: "관리자",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUserCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-openid",
      email: "user@nobs.com",
      name: "일반사용자",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("membership.register", () => {
  it("개인정보 동의 없이 가입 시 오류 반환", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.membership.register({
        name: "홍길동",
        email: "test@example.com",
        phone: "010-1234-5678",
        birthDate: "1990-01-01",
        privacyConsent: false,
        marketingConsent: false,
      })
    ).rejects.toThrow("개인정보 수집 동의는 필수입니다");
  });

  it("정상 가입 시 성공 응답 반환", async () => {
    // getMemberByEmail이 처음에는 undefined를 반환하고, 두 번째 호출에서 생성된 회원 반환
    const db = await import("./db");
    (db.getMemberByEmail as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined) // 중복 체크
      .mockResolvedValueOnce({ id: 10, email: "new@example.com", name: "신규" }); // 생성 후 조회

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.register({
      name: "신규",
      email: "new@example.com",
      phone: "010-9999-8888",
      birthDate: "1995-06-15",
      privacyConsent: true,
      marketingConsent: true,
    });

    expect(result.success).toBe(true);
    expect(result.memberId).toBe(10);
  });

  it("중복 이메일 가입 시 CONFLICT 오류", async () => {
    const db = await import("./db");
    (db.getMemberByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 5,
      email: "existing@example.com",
      name: "기존회원",
    });

    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.membership.register({
        name: "중복",
        email: "existing@example.com",
        phone: "010-0000-0000",
        birthDate: "1990-01-01",
        privacyConsent: true,
        marketingConsent: false,
      })
    ).rejects.toThrow("이미 가입된 이메일입니다");
  });
});

describe("권한 분리", () => {
  it("일반 사용자가 admin API 호출 시 FORBIDDEN 오류", async () => {
    const caller = appRouter.createCaller(createUserCtx());
    await expect(
      caller.admin.listMembers({ limit: 10, offset: 0 })
    ).rejects.toThrow("관리자 권한이 필요합니다");
  });

  it("관리자는 회원 목록 조회 가능", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    const result = await caller.admin.listMembers({ limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("비인증 사용자가 admin API 호출 시 UNAUTHORIZED 오류", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.admin.listMembers({ limit: 10, offset: 0 })
    ).rejects.toThrow();
  });
});

describe("쿠폰 사용 처리", () => {
  it("관리자가 쿠폰 코드로 사용 처리 성공", async () => {
    const db = await import("./db");
    (db.getCouponByCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 99,
      code: "NOBS-TESTCODE",
      status: "active",
      memberId: 1,
    });

    const caller = appRouter.createCaller(createAdminCtx());
    const result = await caller.admin.useCoupon({ couponCode: "NOBS-TESTCODE" });
    expect(result.success).toBe(true);
  });

  it("이미 사용된 쿠폰 재사용 시 오류", async () => {
    const db = await import("./db");
    (db.getCouponByCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 100,
      code: "NOBS-USEDCODE",
      status: "used",
      memberId: 1,
    });

    const caller = appRouter.createCaller(createAdminCtx());
    await expect(
      caller.admin.useCoupon({ couponCode: "NOBS-USEDCODE" })
    ).rejects.toThrow("이미 사용된 쿠폰입니다");
  });
});
