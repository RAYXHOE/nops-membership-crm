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

// 현재 월 생일로 설정 → 마케팅 동의 시 생일 쿠폰도 즉시 발급되어 총 2장
const now = new Date();
const currentMonthBirthDate = new Date(now.getFullYear(), now.getMonth(), 15);

const mockMember = {
  id: 1,
  name: "홍길동",
  email: "test@example.com",
  phone: "010-1234-5678",
  birthDate: currentMonthBirthDate,
  privacyConsent: true,
  privacyConsentAt: new Date(),
  privacyConsentContent: "동의",
  marketingConsent: false,
  marketingConsentAt: null,
  marketingConsentContent: null,
  kakaoMarketingConsent: false,
  kakaoMarketingConsentAt: null,
  kakaoMarketingConsentContent: null,
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

describe("membership.updateKakaoMarketingConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("카카오톡 광고성 정보 수신 동의를 별도 필드와 이력에 저장한다", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockMember, kakaoMarketingConsent: false });

    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.membership.updateKakaoMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: true,
      userAgent: "vitest",
    });

    expect(result).toEqual({ success: true, alreadySame: false });
    expect(db.updateMember).toHaveBeenCalledWith(1, expect.objectContaining({
      kakaoMarketingConsent: true,
      kakaoMarketingConsentAt: expect.any(Date),
      kakaoMarketingConsentContent: expect.stringContaining("카카오톡 광고성 정보 수신 동의서"),
    }));
    expect(db.createConsentLog).toHaveBeenCalledWith(expect.objectContaining({
      consentType: "kakao_marketing",
      agreed: true,
    }));
  });

  it("카카오톡 광고성 정보 수신 철회는 이메일·SMS 마케팅 동의와 독립적으로 처리한다", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockMember,
      marketingConsent: true,
      kakaoMarketingConsent: true,
    });

    const caller = appRouter.createCaller(createPublicCtx());
    await caller.membership.updateKakaoMarketingConsent({ memberId: 1, email: "test@example.com", agreed: false });

    expect(db.updateMember).toHaveBeenCalledWith(1, expect.objectContaining({
      kakaoMarketingConsent: false,
      kakaoMarketingConsentAt: null,
      kakaoMarketingConsentContent: null,
    }));
    expect(db.createConsentLog).toHaveBeenCalledWith(expect.objectContaining({
      consentType: "kakao_marketing_withdraw",
      agreed: false,
    }));
  });

  it("이메일이 일치하지 않으면 카카오톡 수신 동의를 변경할 수 없다", async () => {
    const db = await import("./db");
    (db.getMemberById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockMember, email: "other@example.com" });

    const caller = appRouter.createCaller(createPublicCtx());
    await expect(caller.membership.updateKakaoMarketingConsent({
      memberId: 1,
      email: "test@example.com",
      agreed: true,
    })).rejects.toThrow("본인 확인에 실패했습니다");
  });
});
