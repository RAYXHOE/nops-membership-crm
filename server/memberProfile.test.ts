import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createMemberProfileToken, verifyMemberProfileToken } from "./memberProfileAuth";

const mocks = vi.hoisted(() => ({
  getMemberById: vi.fn(), getMemberByPhone: vi.fn(), updateMember: vi.fn(),
  getMemberByEmail: vi.fn(), verifyOtp: vi.fn(), issueCoupon: vi.fn(),
}));
vi.mock("./db", async (original) => ({ ...(await original<typeof import("./db")>()), ...mocks }));
vi.mock("./email", () => ({ sendWelcomeEmail: vi.fn(), sendOtpEmail: vi.fn(), sendNewInquiryAlertEmail: vi.fn() }));
vi.mock("./kakao", () => ({ sendWelcomeAlimtalk: vi.fn() }));
import { appRouter } from "./routers";

const member = { id: 101, email: "member@example.com", phone: "010-1111-2222", status: "active", name: "회원" };
function context(role?: "admin" | "user"): TrpcContext {
  return { user: role ? { id: 1, role, email: "staff@example.com", openId: "staff", name: "staff", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JWT_SECRET", "test-secret-for-profile-auth-not-production");
  mocks.getMemberById.mockResolvedValue(member); mocks.getMemberByPhone.mockResolvedValue(undefined);
  mocks.updateMember.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("회원정보 수정", () => {
  it("관리자는 표준화된 연락처 및 UTC 날짜를 저장하고 쿠폰은 발급하지 않는다", async () => {
    await appRouter.createCaller(context("admin")).admin.updateMember({ id: 101, phone: "01033334444", birthDate: "1990-02-18" });
    expect(mocks.updateMember).toHaveBeenCalledWith(101, { phone: "010-3333-4444", birthDate: new Date("1990-02-18T00:00:00Z") });
    expect(mocks.issueCoupon).not.toHaveBeenCalled();
  });
  it("일반 계정과 무인증은 관리자 수정을 할 수 없다", async () => {
    for (const role of ["user", undefined] as const) await expect(appRouter.createCaller(context(role)).admin.updateMember({ id: 101, phone: "01033334444" })).rejects.toThrow();
    expect(mocks.updateMember).not.toHaveBeenCalled();
  });
  it("없는 회원은 저장하지 않는다", async () => {
    mocks.getMemberById.mockResolvedValue(undefined);
    await expect(appRouter.createCaller(context("admin")).admin.updateMember({ id: 101, birthDate: "1990-02-18" })).rejects.toThrow("회원을 찾을 수 없습니다");
    expect(mocks.updateMember).not.toHaveBeenCalled();
  });
  it.each([{ phone: "010-123-45" }, { birthDate: "2026-02-30" }])("잘못된 입력을 차단한다: %j", async (input) => {
    await expect(appRouter.createCaller(context("admin")).admin.updateMember({ id: 101, ...input })).rejects.toThrow();
    expect(mocks.updateMember).not.toHaveBeenCalled();
  });
  it("다른 회원 연락처로 변경할 수 없다", async () => {
    mocks.getMemberByPhone.mockResolvedValue({ id: 102 });
    await expect(appRouter.createCaller(context("admin")).admin.updateMember({ id: 101, phone: "01033334444" })).rejects.toThrow("이미 등록된 연락처");
    expect(mocks.updateMember).not.toHaveBeenCalled();
  });
  it("OTP를 통과한 고객은 자기 정보만 수정한다", async () => {
    const profileToken = await createMemberProfileToken(member.id, member.email);
    await appRouter.createCaller(context()).membership.updateProfile({ memberId: member.id, profileToken, phone: "01033334444" });
    expect(mocks.updateMember).toHaveBeenCalledWith(member.id, { phone: "010-3333-4444" });
    expect(mocks.issueCoupon).not.toHaveBeenCalled();
  });
  it("URL 회원번호나 위조 토큰만으로는 수정할 수 없다", async () => {
    await expect(appRouter.createCaller(context()).membership.updateProfile({ memberId: member.id, profileToken: "forged", birthDate: "1990-02-18" })).rejects.toThrow("본인인증");
    const profileToken = await createMemberProfileToken(102, member.email);
    await expect(appRouter.createCaller(context()).membership.updateProfile({ memberId: member.id, profileToken, birthDate: "1990-02-18" })).rejects.toThrow("본인인증");
    expect(mocks.updateMember).not.toHaveBeenCalled();
  });
  it("30분 지난 토큰을 거부한다", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    const token = await createMemberProfileToken(member.id, member.email);
    vi.setSystemTime(new Date("2026-10-15T00:31:00Z"));
    await expect(verifyMemberProfileToken(token, member.id, member.email)).rejects.toThrow("본인인증");
  });
  it("OTP 성공일 때만 수정용 토큰을 발급한다", async () => {
    mocks.verifyOtp.mockResolvedValue(true); mocks.getMemberByEmail.mockResolvedValue(member);
    const result = await appRouter.createCaller(context()).membership.verifyOtp({ email: member.email, code: "123456" });
    await expect(verifyMemberProfileToken(result.profileToken, member.id, member.email)).resolves.toBeUndefined();
    mocks.verifyOtp.mockResolvedValue(false);
    await expect(appRouter.createCaller(context()).membership.verifyOtp({ email: member.email, code: "123456" })).rejects.toThrow();
  });
});
