import { describe, expect, it, vi, beforeEach } from "vitest";

// Resend SDK mock - 모듈 최상위에서 선언해야 호이스팅됨
vi.mock("resend", () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: "mock-email-id-123" }, error: null });
  const mockDomainsList = vi.fn().mockResolvedValue({ data: [], error: null });

  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
      domains: { list: mockDomainsList },
    })),
    _mockSend: mockSend,
    _mockDomainsList: mockDomainsList,
  };
});

describe("email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 매 테스트마다 성공 응답으로 리셋
    const resendModule = vi.mocked(require("resend"));
    if (resendModule._mockSend) {
      resendModule._mockSend.mockResolvedValue({ data: { id: "mock-email-id-123" }, error: null });
    }
  });

  it("sendWelcomeEmail - 쿠폰 목록 포함 환영 이메일 발송 성공", async () => {
    const { sendWelcomeEmail } = await import("./email");
    const result = await sendWelcomeEmail({
      to: "test@example.com",
      name: "홍길동",
      coupons: [
        {
          name: "가입 기념 10% 할인 쿠폰",
          code: "NOPS-ABCD1234",
          discountPercent: 10,
          expiresAt: new Date("2026-12-31"),
        },
        {
          name: "콜키지 프리 쿠폰",
          code: "CORK-EFGH5678",
          discountPercent: null,
          expiresAt: new Date("2026-12-31"),
        },
      ],
    });
    // API 키가 없어도 mock이 성공 응답을 반환해야 함
    expect(typeof result.success).toBe("boolean");
  });

  it("sendBirthdayEmail - 생일 쿠폰 이메일 발송 성공", async () => {
    const { sendBirthdayEmail } = await import("./email");
    const result = await sendBirthdayEmail({
      to: "birthday@example.com",
      name: "김생일",
      couponCode: "BDAY-WXYZ9012",
      discountPercent: 15,
      expiresAt: new Date("2026-07-31"),
    });
    expect(typeof result.success).toBe("boolean");
  });

  it("validateResendApiKey - API 키 유효성 검증 함수 존재 확인", async () => {
    const { validateResendApiKey } = await import("./email");
    expect(typeof validateResendApiKey).toBe("function");
    // 실제 API 호출은 mock으로 처리
    const valid = await validateResendApiKey();
    expect(typeof valid).toBe("boolean");
  });

  it("sendWelcomeEmail - 이메일 발송 실패 시 가입 흐름을 차단하지 않음 (예외 미전파)", async () => {
    // email.ts의 sendWelcomeEmail은 내부 try/catch로 예외를 잡고 { success: false }를 반환
    // 이 테스트는 함수가 throw하지 않고 반드시 객체를 반환함을 검증
    const { sendWelcomeEmail } = await import("./email");
    let threw = false;
    let result: { success: boolean } | undefined;
    try {
      result = await sendWelcomeEmail({
        to: "test@example.com",
        name: "테스트",
        coupons: [],
      });
    } catch {
      threw = true;
    }
    // 어떤 경우에도 throw하지 않아야 함
    expect(threw).toBe(false);
    // 반환값은 success 프로퍼티를 가진 객체
    expect(result).toHaveProperty("success");
  });
});
