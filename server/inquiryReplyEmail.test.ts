import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: mocks.send } })) }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("EMAIL_FROM", "NOPS Steak House \\u003cnoreply@nops.kr\\u003e");
  mocks.send.mockResolvedValue({ data: { id: "mock-id" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
const payload = { to: "customer@example.com", name: "<회원>", subject: "문의", originalContent: "<script>alert(1)</script>", adminReply: "확인 <완료>", idempotencyKey: "inquiry-42-v1" };
describe("문의 답변 이메일", () => {
  it("발신 주소를 정규화하고 내용은 이스케이프하며 접수 ID를 반환한다", async () => {
    const { sendInquiryReplyEmail } = await import("./email");
    expect(await sendInquiryReplyEmail(payload)).toEqual({ success: true, emailId: "mock-id" });
    const [message, options] = mocks.send.mock.calls[0];
    expect(message.from).toBe("NOPS Steak House <noreply@nops.kr>");
    expect(message.to).toBe(payload.to);
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("확인 &lt;완료&gt;");
    expect(options).toEqual({ idempotencyKey: "inquiry-42-v1" });
  });
  it("Resend가 오류 객체를 반환하면 성공으로 간주하지 않는다", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad sender" } });
    const { sendInquiryReplyEmail } = await import("./email");
    expect(await sendInquiryReplyEmail(payload)).toEqual({ success: false, error: "validation_error" });
  });
  it("네트워크 예외는 개인정보 없이 실패를 반환한다", async () => {
    mocks.send.mockRejectedValue(new Error("network"));
    const { sendInquiryReplyEmail } = await import("./email");
    expect(await sendInquiryReplyEmail(payload)).toEqual({ success: false, error: "request_failed" });
  });
});
