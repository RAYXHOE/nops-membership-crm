import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── DB Mock ──────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getMemberById: vi.fn(),
    getMemberByEmail: vi.fn(),
    updateMember: vi.fn().mockResolvedValue(undefined),
    createConsentLog: vi.fn().mockResolvedValue(undefined),
    getCouponsByMemberId: vi.fn().mockResolvedValue([]),
    getCouponTemplateByType: vi.fn().mockResolvedValue({
      id: 1,
      name: "10% 할인",
      type: "discount_percent",
      discountPercent: 10,
      description: "테스트",
      validDays: 365,
      isActive: true,
      createdAt: new Date(),
    }),
    issueCoupon: vi.fn().mockResolvedValue(undefined),
    createMember: vi.fn(),
    createPurchase: vi.fn(),
    createVisit: vi.fn(),
    deletePurchase: vi.fn(),
    deleteVisit: vi.fn(),
    getCouponByCode: vi.fn(),
    getCouponStats: vi.fn(),
    getConsentLogsByMemberId: vi.fn(),
    getMemberStats: vi.fn(),
    getMembersWithBirthdayToday: vi.fn(),
    getPurchaseStats: vi.fn(),
    getPurchasesByMemberId: vi.fn(),
    getVisitsByMemberId: vi.fn(),
    listAllCoupons: vi.fn(),
    listCouponTemplates: vi.fn(),
    listMembers: vi.fn(),
    updatePurchase: vi.fn(),
    updateVisit: vi.fn(),
    useCoupon: vi.fn(),
    expireOverdueCoupons: vi.fn(),
    getCouponsByMemberId: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./email", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendBirthdayEmail: vi.fn().mockResolvedValue({ success: true }),
  validateResendApiKey: vi.fn().mockResolvedValue(true),
}));

function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockMember = {
  id: 1,
  name: "홍길동",
  email: "test@example.com",
  phone: "010-1234-5678",
  birthDate: new Date("1990-01-01"),
  privacyConsent: true,
  privacyConsentAt: new Date(),
  privacyConsentContent: "동의",
  marketingConsent: false,
  marketingConsentAt: null,
  marketingConsentContent: null,
  status: "active" as const,
  joinedAt: new Date(),
  updatedAt: new Date(),
  notes: null,
};

describe("membership.updateMarketingConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("마케팅 동의 시 쿠폰 2장 발급", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      marketingConsent: false,
    });
    (db.getCouponsByMemberId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getCouponTemplateByType as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      name: "10% 할인",
      type: "discount_percent",
      discountPercent: 10,
      description: "테스트",
      validDays: 365,
      isActive: true,
      createdAt: new Date(),
    });

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.updateMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: true,
    });

    expect(result.success).toBe(true);
    expect(result.couponsIssued).toBe(2); // 할인 쿠폰 + 생일 쿠폰
    expect(result.alreadySame).toBe(false);
    expect(db.issueCoupon).toHaveBeenCalledTimes(2);
  });

  it("이미 쿠폰 있는 경우 중복 발급 안 함", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      marketingConsent: false,
    });
    // 이미 할인 쿠폰과 생일 쿠폰 보유
    (db.getCouponsByMemberId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, type: "discount_percent", status: "active", birthdayYear: null },
      { id: 2, type: "birthday", status: "active", birthdayYear: new Date().getFullYear() },
    ]);

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.updateMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: true,
    });

    expect(result.success).toBe(true);
    expect(result.couponsIssued).toBe(0); // 이미 있으므로 0
    expect(db.issueCoupon).not.toHaveBeenCalled();
  });

  it("이미 동의 상태인 경우 alreadySame 반환", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      marketingConsent: true, // 이미 동의
    });

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.updateMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: true,
    });

    expect(result.alreadySame).toBe(true);
    expect(result.couponsIssued).toBe(0);
  });

  it("이메일 불일치 시 FORBIDDEN 오류", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      email: "other@example.com", // 다른 이메일
    });

    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.membership.updateMarketingConsent({
        memberId: 1,
        email: "test@example.com",
        agreed: true,
      })
    ).rejects.toThrow("본인 확인에 실패했습니다");
  });

  it("마케팅 철회 시 쿠폰 발급 없음", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      marketingConsent: true,
    });

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.updateMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: false,
    });

    expect(result.success).toBe(true);
    expect(result.couponsIssued).toBe(0);
    expect(db.issueCoupon).not.toHaveBeenCalled();
  });
});
