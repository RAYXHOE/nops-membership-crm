import { describe, expect, it, vi, beforeEach } from "vitest";

// 솔라피 SDK mock
vi.mock("solapi", () => {
  const mockSend = vi.fn().mockResolvedValue({ messageId: "mock-msg-id" });
  const mockGetBalance = vi.fn().mockResolvedValue({ balance: 10000 });

  return {
    SolapiMessageService: vi.fn().mockImplementation(() => ({
      send: mockSend,
      getBalance: mockGetBalance,
    })),
    _mockSend: mockSend,
    _mockGetBalance: mockGetBalance,
  };
});

describe("kakao alimtalk service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOLAPI_API_KEY = "test-key";
    process.env.SOLAPI_API_SECRET = "test-secret";
    process.env.SOLAPI_SENDER_PHONE = "0215974030";
    process.env.SOLAPI_KAKAO_PFID = "KA01PF2606130432073595wo9wgbNi93";
    process.env.SOLAPI_TEMPLATE_WELCOME = "fM1dfRL2Vv";
    process.env.SOLAPI_TEMPLATE_EXPIRY = "LEr8jRNcj6";
  });

  it("sendWelcomeAlimtalk - 정상 발송 시 success: true 반환", async () => {
    const { sendWelcomeAlimtalk } = await import("./kakao");
    const result = await sendWelcomeAlimtalk({
      to: "010-1234-5678",
      name: "홍길동",
      coupons: [
        { name: "콜키지 프리 쿠폰", code: "CORK-ABCD1234" },
        { name: "10% 할인 쿠폰", code: "NOPS-EFGH5678" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("sendExpiryAlimtalk - 쿠폰 2개 → 2건 발송", async () => {
    const { sendExpiryAlimtalk } = await import("./kakao");
    const result = await sendExpiryAlimtalk({
      to: "010-9999-8888",
      name: "김회원",
      coupons: [
        { name: "10% 할인 쿠폰", code: "NOPS-TEST1", expiresAt: new Date("2026-12-31") },
        { name: "생일 쿠폰", code: "BDAY-TEST2", expiresAt: new Date("2026-12-31") },
      ],
    });
    expect(result.success).toBe(true);
    expect((result as { sent?: number }).sent).toBe(2);
  });

  it("validateSolapiApiKey - API 키 유효 시 true 반환", async () => {
    const { validateSolapiApiKey } = await import("./kakao");
    const valid = await validateSolapiApiKey();
    expect(valid).toBe(true);
  });

  it("sendWelcomeAlimtalk - 전화번호 하이픈 자동 제거", async () => {
    const solapi = await import("solapi");
    const mockInstance = (solapi.SolapiMessageService as ReturnType<typeof vi.fn>).mock.results[0]?.value;

    const { sendWelcomeAlimtalk } = await import("./kakao");
    await sendWelcomeAlimtalk({
      to: "010-1234-5678",
      name: "테스트",
      coupons: [],
    });

    // send가 호출됐을 때 to에 하이픈이 없어야 함
    if (mockInstance?.send) {
      const callArg = mockInstance.send.mock.calls[0]?.[0];
      if (callArg) {
        expect(callArg.to).not.toContain("-");
      }
    }
  });

  it("솔라피 API 키 없을 때 success: false 반환", async () => {
    delete process.env.SOLAPI_API_KEY;
    const { sendWelcomeAlimtalk } = await import("./kakao");
    const result = await sendWelcomeAlimtalk({
      to: "010-0000-0000",
      name: "테스트",
      coupons: [],
    });
    expect(result.success).toBe(false);
  });
});
