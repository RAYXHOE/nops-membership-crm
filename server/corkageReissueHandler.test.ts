import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORKAGE_REISSUE_DELAY_DAYS } from "@shared/couponPolicy";

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getMembersForCorkageReissue: vi.fn(),
    getCouponTemplateByType: vi.fn(),
    issueCoupon: vi.fn(),
  };
});

vi.mock("./kakao", () => ({
  sendExpiryAlimtalk: vi.fn(),
  sendAnniversaryAlimtalk: vi.fn(),
  sendBirthdayAlimtalk: vi.fn(),
  sendCorkageReissueAlimtalk: vi.fn().mockResolvedValue({ success: true, skipped: true }),
  sendPointsExpiryAlimtalk: vi.fn(),
}));

vi.mock("./email", () => ({
  sendExpiryReminderEmail: vi.fn(),
  sendBirthdayEmail: vi.fn(),
  sendAnniversaryEmail: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "test-corkage" }) },
}));

const mockRequest = { headers: { authorization: "Bearer test" } } as unknown as import("express").Request;
const mockResponse = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as unknown as import("express").Response;

describe("corkageReissueHandler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await import("./db");
    (db.getMembersForCorkageReissue as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 101, name: "테스트회원", phone: "010-1234-5678" },
    ]);
    (db.getCouponTemplateByType as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 9, name: "콜키지 프리 쿠폰" });
    (db.issueCoupon as ReturnType<typeof vi.fn>).mockResolvedValue({ issued: true });
  });

  it("사용 후 30일 정책을 응답하고 재발급 쿠폰을 발급일 기준 1년으로 설정한다", async () => {
    const { corkageReissueHandler } = await import("./scheduledHandlers");
    const db = await import("./db");
    const res = mockResponse();

    await corkageReissueHandler(mockRequest, res);

    expect(db.issueCoupon).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 101,
      templateId: 9,
      type: "corkage_free",
      expiresAt: expect.any(Date),
    }));
    const issuedCoupon = (db.issueCoupon as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const duration = issuedCoupon.expiresAt.getTime() - Date.now();
    expect(duration).toBeGreaterThan(364 * 24 * 60 * 60 * 1000);
    expect(duration).toBeLessThan(366 * 24 * 60 * 60 * 1000);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      issued: 1,
      reissueDelayDays: CORKAGE_REISSUE_DELAY_DAYS,
    }));
  });
});
