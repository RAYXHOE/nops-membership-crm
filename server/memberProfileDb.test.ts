import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChangedMemberProfileFields, getMemberProfileEditAvailability } from "@shared/memberProfilePolicy";
import { memberContactChallenges } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { updateSelfMemberProfile } from "./memberProfileDb";

type FakeMember = { id: number; email: string; phone: string; birthDate: Date; status: string; lastSelfProfileEditAt: Date | null };
let stored: FakeMember;
let duplicate: boolean;
let failSave: boolean;
let lockModes: string[];
let writes: Record<string, unknown>[];
let queue: Promise<unknown>;
let emailChallenge: { id: string; purpose: string; memberId: number; target: string; issuerHash: string; verifiedAt: Date | null; usedAt: Date | null; expiresAt: Date; emailSnapshot: string; phoneSnapshot: string };
let phoneChallenge: typeof emailChallenge;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
  stored = { id: 101, email: "member@example.com", phone: "010-1111-2222", birthDate: new Date("1990-02-18T00:00:00Z"), status: "active", lastSelfProfileEditAt: null };
  duplicate = false; failSave = false; lockModes = []; writes = []; queue = Promise.resolve();
  emailChallenge = { id: "proof-challenge", purpose: "email_change", memberId: 101, target: "corrected@example.com", issuerHash: "session-proof", verifiedAt: new Date("2026-10-16T01:59:00Z"), usedAt: null, expiresAt: new Date("2026-10-16T02:10:00Z"), emailSnapshot: stored.email, phoneSnapshot: "01011112222" };
  phoneChallenge = { ...emailChallenge, id: "phone-proof-challenge", purpose: "phone_change", target: "01033334444", issuerHash: "phone-session-proof" };
  mocks.getDb.mockResolvedValue({
    transaction: (callback: (tx: any) => Promise<unknown>) => {
      // Only an in-memory transaction mock. No database users are created.
      const run = queue.then(async () => {
        let staged = { ...stored };
        let stagedChallenge = { ...emailChallenge };
        let stagedPhoneChallenge = { ...phoneChallenge };
        function hasValue(value: any, sought: string): boolean { return value?.value === sought || (Array.isArray(value?.queryChunks) && value.queryChunks.some((part: any) => hasValue(part, sought))); }
        const tx = {
          select: (fields?: unknown) => ({ from: (table: unknown) => ({ where: (condition: unknown) => ({ limit: () => fields ? Promise.resolve(duplicate ? [{id:102}] : []) : { for: async (mode: string) => { lockModes.push(mode); return [table === memberContactChallenges ? hasValue(condition, phoneChallenge.id) ? { ...stagedPhoneChallenge } : { ...stagedChallenge } : { ...staged }]; } } }) }) }),
          update: (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: unknown) => {
            if (table === memberContactChallenges) { if (hasValue(condition, phoneChallenge.id)) stagedPhoneChallenge = { ...stagedPhoneChallenge, ...changes }; else stagedChallenge = { ...stagedChallenge, ...changes }; return; }
            writes.push(changes);
            if (failSave) throw new Error("mock save failure");
            staged = { ...staged, ...changes };
          } }) }),
        };
        const result = await callback(tx);
        stored = staged; emailChallenge = stagedChallenge; phoneChallenge = stagedPhoneChallenge; return result;
      });
      queue = run.catch(() => undefined); return run;
    },
  });
});
afterEach(() => vi.useRealTimers());
const request = { memberId: 101, verifiedEmail: "member@example.com", phoneProof: { challengeId: "phone-proof-challenge", issuerHash: "phone-session-proof" } };

describe("한국시간 월 1회 정책", () => {
  it("처음 수정하거나 지난달 수정한 고객은 허용한다", () => {
    expect(getMemberProfileEditAvailability(null).canEdit).toBe(true);
    expect(getMemberProfileEditAvailability(new Date("2026-09-30T14:59:59Z")).canEdit).toBe(true);
  });
  it("UTC 전날이어도 KST 이번 달이면 제한한다", () => {
    const status = getMemberProfileEditAvailability(new Date("2026-09-30T15:00:00Z"));
    expect(status.canEdit).toBe(false);
    expect(status.nextAllowedAt?.toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });
  it.each([
    ["2026-10-31T14:59:59.999Z", false],
    ["2026-10-31T15:00:00.000Z", true],
  ])("다음 달 1일 00:00 KST 경계 %s", (now, allowed) => {
    expect(getMemberProfileEditAvailability("2026-10-16T02:00:00Z", new Date(now)).canEdit).toBe(allowed);
  });
  it("연말 및 윤년 2월의 월 경계를 처리한다", () => {
    expect(getMemberProfileEditAvailability("2026-12-20T00:00:00Z", new Date("2026-12-31T14:59:59Z")).nextAllowedAt?.toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(getMemberProfileEditAvailability("2024-02-01T00:00:00Z", new Date("2024-02-28T15:00:00Z")).nextAllowedAt?.toISOString()).toBe("2024-02-29T15:00:00.000Z");
  });
  it("형식만 다른 동일 연락처·날짜는 변경으로 계산하지 않는다", () => {
    expect(getChangedMemberProfileFields(stored, { phone: "01011112222", birthDate: "1990-02-18" })).toEqual({});
  });
});

describe("행 잠금 및 저장 원자성", () => {
  it("전화번호·생년월일 동시 변경도 한 번의 저장으로 기록한다", async () => {
    const result = await updateSelfMemberProfile({ ...request, phone: "010-3333-4444", birthDate: "1991-02-18" });
    expect(result.changed).toBe(true); expect(result.canEdit).toBe(false);
    expect(lockModes).toEqual(["update", "update"]); expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0]).sort()).toEqual(["birthDate", "lastSelfProfileEditAt", "phone"]);
    expect(stored.lastSelfProfileEditAt?.toISOString()).toBe("2026-10-16T02:00:00.000Z");
  });
  it("같은 달 두 번째 실제 변경은 제한한다", async () => {
    await updateSelfMemberProfile({ ...request, phone: "010-3333-4444" });
    await expect(updateSelfMemberProfile({ ...request, birthDate: "1991-02-18" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(writes).toHaveLength(1);
  });
  it("연속 동일 요청은 추가 저장이나 제한 횟수를 만들지 않는다", async () => {
    await updateSelfMemberProfile({ ...request, phone: "010-3333-4444" });
    const result = await updateSelfMemberProfile({ ...request, phone: "010-3333-4444" });
    expect(result.changed).toBe(false); expect(writes).toHaveLength(1);
  });
  it("변경 없는 저장은 최초 수정 횟수도 차감하지 않는다", async () => {
    const result = await updateSelfMemberProfile({ ...request, phone: "01011112222" });
    expect(result.changed).toBe(false); expect(result.canEdit).toBe(true);
    expect(stored.lastSelfProfileEditAt).toBeNull(); expect(writes).toHaveLength(0);
  });
  it("다음 달에는 다시 수정할 수 있다", async () => {
    await updateSelfMemberProfile({ ...request, phone: "010-3333-4444" });
    vi.setSystemTime(new Date("2026-10-31T15:00:00Z"));
    expect((await updateSelfMemberProfile({ ...request, birthDate: "1991-02-18" })).changed).toBe(true);
    expect(writes).toHaveLength(2);
  });
  it("동시 서로 다른 변경 두 건 중 하나만 저장된다", async () => {
    const results = await Promise.allSettled([
      updateSelfMemberProfile({ ...request, phone: "010-3333-4444" }),
      updateSelfMemberProfile({ ...request, birthDate: "1991-02-18" }),
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(writes).toHaveLength(1); expect(lockModes).toEqual(["update", "update", "update"]);
  });
  it("저장 실패 시 정보와 수정 횟수를 모두 롤백한다", async () => {
    failSave = true;
    await expect(updateSelfMemberProfile({ ...request, phone: "010-3333-4444" })).rejects.toThrow("mock save failure");
    expect(stored.phone).toBe("010-1111-2222"); expect(stored.lastSelfProfileEditAt).toBeNull();
    failSave = false;
    expect((await updateSelfMemberProfile({ ...request, phone: "010-3333-4444" })).changed).toBe(true);
  });
  it("번호 충돌 및 비활성 회원은 횟수를 소진하지 않는다", async () => {
    duplicate = true;
    await expect(updateSelfMemberProfile({ ...request, phone: "010-3333-4444" })).rejects.toMatchObject({ code: "CONFLICT" });
    duplicate = false; stored.status = "inactive";
    await expect(updateSelfMemberProfile({ ...request, phone: "010-3333-4444" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stored.lastSelfProfileEditAt).toBeNull(); expect(writes).toHaveLength(0);
  });
  it("인증한 이메일과 잠금 뒤 회원 이메일이 다르면 저장하지 않는다", async () => {
    await expect(updateSelfMemberProfile({ ...request, verifiedEmail: "other@example.com", phone: "010-3333-4444" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(writes).toHaveLength(0);
  });
  it("인증한 연락처와 잠금 뒤 연락처가 달라도 저장하지 않는다", async () => {
    await expect(updateSelfMemberProfile({ ...request, verifiedPhone: "01099998888", phone: "010-3333-4444" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(writes).toHaveLength(0);
  });
  it("새 이메일 인증 없이 변경하지 않는다", async () => {
    await expect(updateSelfMemberProfile({ ...request, email: "corrected@example.com" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(stored.email).toBe("member@example.com"); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("새 이메일·연락처·생년월일을 한 번에 저장하고 인증 증거도 한 번 소비한다", async () => {
    const result = await updateSelfMemberProfile({ ...request, email: "corrected@example.com", phone: "010-3333-4444", birthDate: "1991-02-18", emailProof: { challengeId: emailChallenge.id, issuerHash: emailChallenge.issuerHash } });
    expect(result.changed).toBe(true); expect(stored.email).toBe("corrected@example.com"); expect(emailChallenge.usedAt).not.toBeNull();
    expect(phoneChallenge.usedAt).not.toBeNull();
    expect(writes).toHaveLength(1); expect(Object.keys(writes[0]).sort()).toEqual(["birthDate", "email", "lastSelfProfileEditAt", "phone"]);
    expect(result.auth).toEqual({ email: "corrected@example.com", phone: "010-3333-4444" });
  });
  it("같은 이메일의 대소문자·공백만 바뀌면 인증 증거·횟수를 소비하지 않는다", async () => {
    const result = await updateSelfMemberProfile({ ...request, email: " MEMBER@EXAMPLE.COM " });
    expect(result.changed).toBe(false); expect(writes).toHaveLength(0); expect(emailChallenge.usedAt).toBeNull();
  });
  it.each(["used", "expired", "wrong_member", "wrong_target", "wrong_session", "not_verified", "stale_phone", "stale_email"])("유효하지 않은 이메일 증거를 거부한다: %s", async (kind) => {
    if (kind === "used") emailChallenge.usedAt = new Date();
    if (kind === "expired") emailChallenge.expiresAt = new Date("2026-10-16T01:59:00Z");
    if (kind === "wrong_member") emailChallenge.memberId = 102;
    if (kind === "wrong_target") emailChallenge.target = "other@example.com";
    if (kind === "wrong_session") emailChallenge.issuerHash = "other-session";
    if (kind === "not_verified") emailChallenge.verifiedAt = null;
    if (kind === "stale_phone") emailChallenge.phoneSnapshot = "01099998888";
    if (kind === "stale_email") emailChallenge.emailSnapshot = "old@example.com";
    await expect(updateSelfMemberProfile({ ...request, email: "corrected@example.com", emailProof: { challengeId: emailChallenge.id, issuerHash: "session-proof" } })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(writes).toHaveLength(0); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("새 이메일 충돌 시 인증 증거·횟수를 소비하지 않는다", async () => {
    duplicate = true;
    await expect(updateSelfMemberProfile({ ...request, email: "corrected@example.com", emailProof: { challengeId: emailChallenge.id, issuerHash: emailChallenge.issuerHash } })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(emailChallenge.usedAt).toBeNull(); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("이메일 저장 실패 시 증거 소비와 수정 횟수도 모두 롤백한다", async () => {
    failSave = true;
    await expect(updateSelfMemberProfile({ ...request, email: "corrected@example.com", emailProof: { challengeId: emailChallenge.id, issuerHash: emailChallenge.issuerHash } })).rejects.toThrow("mock save failure");
    expect(emailChallenge.usedAt).toBeNull(); expect(stored.email).toBe("member@example.com"); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("새 전화번호 소유 인증 없이 수정하지 않는다", async () => {
    await expect(updateSelfMemberProfile({ ...request, phone: "010-3333-4444", phoneProof: undefined })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(stored.phone).toBe("010-1111-2222"); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("새 전화번호 증거는 다른 번호에 사용할 수 없다", async () => {
    await expect(updateSelfMemberProfile({ ...request, phone: "010-5555-6666" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(phoneChallenge.usedAt).toBeNull(); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
  it("이메일 증거 실패 시 앞서 소비한 전화번호 증거도 롤백된다", async () => {
    await expect(updateSelfMemberProfile({ ...request, phone: "010-3333-4444", email: "corrected@example.com" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(phoneChallenge.usedAt).toBeNull(); expect(stored.phone).toBe("010-1111-2222"); expect(stored.lastSelfProfileEditAt).toBeNull();
  });
});
