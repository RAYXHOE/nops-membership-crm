import { describe, expect, it, vi, beforeEach } from "vitest";

// DB mock
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getCouponsExpiringInDays: vi.fn(),
    getMembersWithBirthdayToday: vi.fn().mockResolvedValue([]),
    getCouponTemplateByType: vi.fn(),
    issueCoupon: vi.fn(),
  };
});

// Email mock
vi.mock("./email", () => ({
  sendExpiryReminderEmail: vi.fn().mockResolvedValue({ success: true, id: "mock-id" }),
  sendBirthdayEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  validateResendApiKey: vi.fn().mockResolvedValue(true),
}));

// SDK mock
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "test-uid" }),
  },
}));

const mockRequest = {
  headers: { authorization: "Bearer test" },
} as unknown as import("express").Request;

const mockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as import("express").Response;
};

describe("couponExpiryReminderHandler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // sdk mock 재설정
    const { sdk } = await import("./_core/sdk");
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ isCron: true, taskUid: "test-uid" });
    // email mock 재설정
    const email = await import("./email");
    (email.sendExpiryReminderEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, id: "mock-id" });
  });
  it("만료 임박 쿠폰 없으면 sent:0 반환", async () => {
    const db = await import("./db");
    (db.getCouponsExpiringInDays as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { couponExpiryReminderHandler } = await import("./scheduledHandlers");
    const res = mockResponse();
    await couponExpiryReminderHandler(mockRequest, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, sent: 0 })
    );
  });

  it("만료 임박 쿠폰 있으면 회원별 이메일 발송", async () => {
    const db = await import("./db");
    (db.getCouponsExpiringInDays as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        coupon: {
          id: 1,
          name: "10% 할인 쿠폰",
          code: "NOPS-TEST1234",
          discountPercent: 10,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "active",
        },
        memberName: "홍길동",
        memberEmail: "hong@example.com",
        memberId: 1,
      },
      {
        coupon: {
          id: 2,
          name: "콜키지 프리 쿠폰",
          code: "CORK-ABCD5678",
          discountPercent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "active",
        },
        memberName: "홍길동",
        memberEmail: "hong@example.com",
        memberId: 1,
      },
    ]);

    const { couponExpiryReminderHandler } = await import("./scheduledHandlers");
    const res = mockResponse();
    await couponExpiryReminderHandler(mockRequest, res);

    const email = await import("./email");
    // 같은 회원의 쿠폰 2개 → 이메일 1건 발송
    expect(email.sendExpiryReminderEmail).toHaveBeenCalledTimes(1);
    expect(email.sendExpiryReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "hong@example.com",
        name: "홍길동",
        coupons: expect.arrayContaining([
          expect.objectContaining({ code: "NOPS-TEST1234" }),
          expect.objectContaining({ code: "CORK-ABCD5678" }),
        ]),
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, sent: 1, total: 1 })
    );
  });

  it("여러 회원에게 각각 이메일 발송", async () => {
    const db = await import("./db");
    (db.getCouponsExpiringInDays as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        coupon: { id: 1, name: "쿠폰A", code: "NOPS-AAA", discountPercent: 10, expiresAt: new Date(), status: "active" },
        memberName: "회원1", memberEmail: "member1@test.com", memberId: 1,
      },
      {
        coupon: { id: 2, name: "쿠폰B", code: "CORK-BBB", discountPercent: null, expiresAt: new Date(), status: "active" },
        memberName: "회원2", memberEmail: "member2@test.com", memberId: 2,
      },
    ]);

    const { couponExpiryReminderHandler } = await import("./scheduledHandlers");
    const res = mockResponse();
    await couponExpiryReminderHandler(mockRequest, res);

    const email = await import("./email");
    expect(email.sendExpiryReminderEmail).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, sent: 2, total: 2 })
    );
  });
});
