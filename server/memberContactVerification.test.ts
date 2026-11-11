import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getMemberByEmail: vi.fn(),
  sendOtpEmail: vi.fn(),
  sendOne: vi.fn(),
  send: vi.fn(),
  getBalance: vi.fn(),
  useSendOne: true,
}));
vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getMemberByEmail: mocks.getMemberByEmail,
}));
vi.mock("./email", () => ({ sendOtpEmail: mocks.sendOtpEmail }));
vi.mock("solapi", () => ({
  SolapiMessageService: vi.fn(function () {
    return {
      getBalance: mocks.getBalance,
      ...(mocks.useSendOne ? { sendOne: mocks.sendOne } : {}),
      send: mocks.send,
    };
  }),
}));
// Evaluate WHERE expressions against fixtures; there is no database connection.
vi.mock("drizzle-orm", async importOriginal => {
  const original = await importOriginal<typeof import("drizzle-orm")>();
  const compare = (op: string) => (column: any, value: any) => ({
    op,
    column,
    value,
  });
  return {
    ...original,
    eq: compare("eq"),
    gte: compare("gte"),
    isNull: (column: any) => ({ op: "null", column }),
    and: (...conditions: any[]) => ({ op: "and", conditions }),
    or: (...conditions: any[]) => ({ op: "or", conditions }),
    asc: (column: any) => ({ column, direction: 1 }),
    desc: (column: any) => ({ column, direction: -1 }),
    sql: (_strings: TemplateStringsArray, ...values: any[]) => ({
      op: "phone",
      column: values[0],
      value: values[1],
    }),
  };
});
import { members, memberContactChallenges } from "../drizzle/schema";
import {
  createMemberProfileToken,
  verifyMemberProfileToken,
} from "./memberProfileAuth";
import {
  requestMemberPhoneLogin,
  verifyMemberPhoneLogin,
  requestMemberEmailChange,
  verifyMemberEmailChange,
  verifyMemberEmailChangeProof,
  requestMemberPhoneChange,
  verifyMemberPhoneChange,
  verifyMemberPhoneChangeProof,
} from "./memberContactVerification";

type Row = Record<string, any>;
let memberRows: Row[];
let challengeRows: Row[];
let queue: Promise<unknown>;
let events: Array<{
  event: string;
  tx: number;
  table?: string;
  mode?: string;
  changes?: Row;
}>;
let txNumber: number;
const PHONE = "01011112222";
const NEW_EMAIL = "correct@example.com";
const SECRET = "fixture-secret-for-contact-not-a-live-credential";
const phoneInput = { phone: PHONE, requestKey: "fixture-server-ip" };
function accepts() {
  return {
    groupId: "fixture-group",
    status: "SENDING",
    count: {
      total: 1,
      registeredSuccess: 1,
      registeredFailed: 0,
      sentFailed: 0,
    },
  };
}
function matches(row: Row, condition: any): boolean {
  if (!condition) return true;
  switch (condition.op) {
    case "and":
      return condition.conditions
        .filter(Boolean)
        .every((c: any) => matches(row, c));
    case "or":
      return condition.conditions
        .filter(Boolean)
        .some((c: any) => matches(row, c));
    case "eq":
      return row[condition.column.name] === condition.value;
    case "gte":
      return row[condition.column.name] >= condition.value;
    case "null":
      return row[condition.column.name] === null;
    case "phone":
      return row[condition.column.name].replace(/\D/g, "") === condition.value;
    default:
      throw new Error(`unhandled fixture condition ${condition.op}`);
  }
}
function makeDb() {
  return {
    transaction(callback: (tx: any) => Promise<any>) {
      const run = queue.then(async () => {
        const id = ++txNumber;
        const stagedMembers = structuredClone(memberRows);
        const stagedChallenges = structuredClone(challengeRows);
        const rowsFor = (table: any) =>
          table === members
            ? stagedMembers
            : table === memberContactChallenges
              ? stagedChallenges
              : (() => {
                  throw new Error("unexpected fixture table");
                })();
        const tableName = (table: any) =>
          table === members ? "members" : "challenges";
        const tx = {
          select(fields?: Row) {
            let table: any,
              condition: any,
              limit = Infinity,
              orders: any[] = [];
            const evaluate = () => {
              const rows = rowsFor(table)
                .filter(row => matches(row, condition))
                .slice();
              rows.sort((a, b) => {
                for (const order of orders) {
                  const left = a[order.column.name],
                    right = b[order.column.name];
                  if (left < right) return -order.direction;
                  if (left > right) return order.direction;
                }
                return 0;
              });
              return rows
                .slice(0, limit)
                .map(row =>
                  fields
                    ? Object.fromEntries(
                        Object.entries(fields).map(([key, column]) => [
                          key,
                          row[column.name],
                        ])
                      )
                    : { ...row }
                );
            };
            const query: any = {
              from(value: any) {
                table = value;
                return query;
              },
              where(value: any) {
                condition = value;
                return query;
              },
              orderBy(...value: any[]) {
                orders = value;
                return query;
              },
              limit(value: number) {
                limit = value;
                return query;
              },
              async for(mode: string) {
                events.push({
                  event: "lock",
                  tx: id,
                  table: tableName(table),
                  mode,
                });
                return evaluate();
              },
              then(resolve: any, reject: any) {
                return Promise.resolve().then(evaluate).then(resolve, reject);
              },
            };
            return query;
          },
          insert(table: any) {
            return {
              values(value: Row) {
                const perform = (upsert?: Row) => {
                  const rows = rowsFor(table),
                    existing = rows.find(row => row.id === value.id);
                  if (existing) {
                    if (upsert) Object.assign(existing, upsert);
                    else throw new Error("duplicate fixture id");
                  } else rows.push(structuredClone(value));
                  events.push({
                    event: "insert",
                    tx: id,
                    table: tableName(table),
                  });
                };
                return {
                  then(resolve: any, reject: any) {
                    return Promise.resolve()
                      .then(() => perform())
                      .then(resolve, reject);
                  },
                  async onDuplicateKeyUpdate({ set }: { set: Row }) {
                    perform(set);
                  },
                };
              },
            };
          },
          update(table: any) {
            return {
              set(changes: Row) {
                return {
                  async where(condition: any) {
                    for (const row of rowsFor(table).filter(row =>
                      matches(row, condition)
                    ))
                      Object.assign(row, structuredClone(changes));
                    events.push({
                      event: "update",
                      tx: id,
                      table: tableName(table),
                      changes: { ...changes },
                    });
                  },
                };
              },
            };
          },
        };
        events.push({ event: "begin", tx: id });
        try {
          const result = await callback(tx);
          memberRows = stagedMembers;
          challengeRows = stagedChallenges;
          events.push({ event: "commit", tx: id });
          return result;
        } catch (error) {
          events.push({ event: "rollback", tx: id });
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
function challenges() {
  return challengeRows.filter(row => row.target !== "");
}
function smsCode() {
  const calls = mocks.useSendOne
    ? mocks.sendOne.mock.calls
    : mocks.send.mock.calls;
  const text = calls[calls.length - 1][0].text as string;
  return text.match(/코드 (\d{6})/)![1];
}
function emailCode() {
  return mocks.sendOtpEmail.mock.calls.at(-1)![0].code as string;
}
async function emailInput() {
  const member = memberRows[0];
  return {
    memberId: member.id,
    profileToken: await createMemberProfileToken(
      member.id,
      member.email,
      member.phone
    ),
    newEmail: NEW_EMAIL,
    requestKey: "fixture-server-ip",
  };
}
async function verifiedEmail() {
  const input = await emailInput();
  const request = await requestMemberEmailChange(input);
  const verified = await verifyMemberEmailChange({
    ...input,
    challengeId: request.challengeId,
    code: emailCode(),
  });
  return { input, request, verified };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T07:00:00Z"));
  vi.stubEnv("JWT_SECRET", SECRET);
  vi.stubEnv("SOLAPI_API_KEY", "fixture-key");
  vi.stubEnv("SOLAPI_API_SECRET", "fixture-secret");
  vi.stubEnv("SOLAPI_SENDER_PHONE", "02-1234-5678");
  memberRows = [
    {
      id: 101,
      name: "테스트회원",
      email: "typo@example.com",
      phone: "010-1111-2222",
      status: "active",
    },
  ];
  challengeRows = [];
  queue = Promise.resolve();
  events = [];
  txNumber = 0;
  mocks.useSendOne = true;
  mocks.getDb.mockResolvedValue(makeDb());
  mocks.getMemberByEmail.mockImplementation(async email =>
    memberRows.find(row => row.email.toLowerCase() === email)
  );
  mocks.getBalance.mockResolvedValue({ balance: 100, point: 0 });
  mocks.sendOne.mockResolvedValue(accepts());
  mocks.send.mockResolvedValue({ groupInfo: accepts(), failedMessageList: [] });
  mocks.sendOtpEmail.mockResolvedValue({ success: true, id: "fixture-email" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("전화번호 로그인 복구", () => {
  it("기존 이메일 오타를 그대로 두고 등록된 휴대폰 SMS로만 복구한다", async () => {
    const request = await requestMemberPhoneLogin({
      ...phoneInput,
      phone: "010-1111-2222",
    });
    const code = smsCode(),
      row = challenges()[0];
    expect(code).toMatch(/^\d{6}$/);
    expect(row).toMatchObject({
      memberId: 101,
      target: PHONE,
      purpose: "phone_login",
      emailSnapshot: "typo@example.com",
      phoneSnapshot: PHONE,
      usedAt: null,
    });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(600_000);
    expect(row.codeHash).toBe(
      createHmac("sha256", SECRET)
        .update(`phone_login:${row.id}:${code}`)
        .digest("hex")
    );
    expect(JSON.stringify(challengeRows)).not.toContain(`"code":"${code}"`);
    expect(mocks.sendOne).toHaveBeenCalledTimes(1);
    expect(mocks.sendOne.mock.calls[0][0]).toMatchObject({
      type: "SMS",
      to: PHONE,
      from: "0212345678",
    });
    expect(mocks.sendOne.mock.calls[0][0].text).not.toMatch(/광고|080/);
    const result = await verifyMemberPhoneLogin({
      ...phoneInput,
      challengeId: request.challengeId,
      code,
    });
    expect(result.memberId).toBe(101);
    await expect(
      verifyMemberProfileToken(
        result.profileToken,
        101,
        "typo@example.com",
        "01011112222"
      )
    ).resolves.toBeUndefined();
    await expect(
      verifyMemberProfileToken(
        result.profileToken,
        101,
        "typo@example.com",
        "01033334444"
      )
    ).rejects.toThrow();
    const { payload } = await jwtVerify(
      result.profileToken,
      new TextEncoder().encode(SECRET)
    );
    expect(payload.authMethod).toBe("phone");
    expect(challenges()[0].usedAt).not.toBeNull();
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0].email).toBe("typo@example.com");
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each(["unknown", "inactive", "duplicate", "inactive duplicate"])(
    "%s 전화번호는 균일 성공 UUID, 발송 없음, 검증 불가",
    async mode => {
      if (mode === "unknown") memberRows = [];
      if (mode === "inactive") memberRows[0].status = "inactive";
      if (mode.includes("duplicate"))
        memberRows.push({
          ...memberRows[0],
          id: 102,
          status: mode === "inactive duplicate" ? "withdrawn" : "active",
        });
      const result = await requestMemberPhoneLogin(phoneInput);
      expect(result).toEqual({
        success: true,
        challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      expect(mocks.sendOne).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(challenges()[0].memberId).toBeNull();
      await expect(
        verifyMemberPhoneLogin({
          ...phoneInput,
          challengeId: result.challengeId,
          code: "123456",
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  );
  it("Solapi v6 단건 send 계약도 접수 카운트와 그룹 상태를 검사한다", async () => {
    mocks.useSendOne = false;
    const request = await requestMemberPhoneLogin(phoneInput);
    expect(mocks.sendOne).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: request.challengeId,
        code: smsCode(),
      })
    ).resolves.toMatchObject({ memberId: 101 });
  });
  it.each([
    {
      groupId: "fixture",
      status: "SENDING",
      count: {
        total: 1,
        registeredSuccess: 0,
        registeredFailed: 1,
        sentFailed: 0,
      },
    },
    { ...accepts(), failedCount: 1 },
    { ...accepts(), failedCount: -1 },
    { ...accepts(), status: "FAILED" },
    {
      groupInfo: accepts(),
      failedMessageList: [{ statusCode: "fixture-failed" }],
    },
    {},
  ])(
    "실패 또는 불확실한 접수는 챌린지를 비활성화하며 재시도하지 않는다: %j",
    async response => {
      mocks.sendOne.mockResolvedValue(response);
      await expect(requestMemberPhoneLogin(phoneInput)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
      expect(challenges()[0].usedAt).not.toBeNull();
      expect(mocks.sendOne).toHaveBeenCalledTimes(1);
      expect(mocks.send).not.toHaveBeenCalled();
      await expect(
        verifyMemberPhoneLogin({
          ...phoneInput,
          challengeId: challenges()[0].id,
          code: smsCode(),
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  );
  it("잔액 100 미만 또는 설정 누락 때 SMS를 보내지 않는다", async () => {
    mocks.getBalance.mockResolvedValue({ balance: 99, point: 10000 });
    await expect(requestMemberPhoneLogin(phoneInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(mocks.sendOne).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    vi.stubEnv("SOLAPI_API_KEY", "");
    await expect(requestMemberPhoneLogin(phoneInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
  });
  it("예외의 OTP·개인정보를 응답이나 로그에 노출하지 않는다", async () => {
    const log = vi.spyOn(console, "log"),
      error = vi.spyOn(console, "error"),
      warn = vi.spyOn(console, "warn");
    mocks.sendOne.mockRejectedValue(
      new Error("private-fixture-code 765432 phone 01011112222")
    );
    await expect(requestMemberPhoneLogin(phoneInput)).rejects.toThrow(
      "인증번호를 발송할 수 없습니다"
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
    warn.mockRestore();
  });
  it("발송 응답 대기 중에는 올바른 OTP도 검증할 수 없다", async () => {
    let complete!: (value: unknown) => void;
    mocks.sendOne.mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const pending = requestMemberPhoneLogin(phoneInput);
    for (let n = 0; n < 100 && !complete; n++) await Promise.resolve();
    expect(complete).toBeTypeOf("function");
    const row = challenges()[0];
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: row.id,
        code: smsCode(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    complete(accepts());
    await pending;
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: row.id,
        code: smsCode(),
      })
    ).resolves.toMatchObject({ memberId: 101 });
  });
});

describe("OTP 수명·실패 횟수·행 잠금", () => {
  it("틀린 답을 5회까지 각각 COMMIT하고 5회 후 올바른 코드도 차단한다", async () => {
    const request = await requestMemberPhoneLogin(phoneInput),
      correct = smsCode();
    const wrong = correct === "000000" ? "999999" : "000000";
    for (let n = 1; n <= 5; n++) {
      const start = events.length;
      await expect(
        verifyMemberPhoneLogin({
          ...phoneInput,
          challengeId: request.challengeId,
          code: wrong,
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(challenges()[0].attempts).toBe(n);
      const sequence = events.slice(start);
      expect(sequence.filter(e => e.event === "lock").map(e => e.mode)).toEqual(
        ["update", "update"]
      );
      const update = sequence.find(e => e.event === "update")!;
      expect(sequence.at(-1)).toEqual({ event: "commit", tx: update.tx });
      expect(sequence.filter(e => e.event === "rollback")).toHaveLength(0);
    }
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: request.challengeId,
        code: correct,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(challenges()[0].attempts).toBe(5);
  });
  it("형식 오류 추측도 실패 횟수로 누적한다", async () => {
    const request = await requestMemberPhoneLogin(phoneInput);
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: request.challengeId,
        code: "abc",
      })
    ).rejects.toThrow();
    expect(challenges()[0].attempts).toBe(1);
  });
  it("정확히 10분 경계에는 만료된다", async () => {
    const request = await requestMemberPhoneLogin(phoneInput),
      code = smsCode();
    vi.advanceTimersByTime(600_000);
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each(["email", "phone", "status"])(
    "운영자가 %s 스냅샷을 변경하면 과거 OTP는 무효",
    async field => {
      const request = await requestMemberPhoneLogin(phoneInput),
        code = smsCode();
      memberRows[0][field] =
        field === "email"
          ? "adminchanged@example.com"
          : field === "phone"
            ? "01033334444"
            : "inactive";
      await expect(
        verifyMemberPhoneLogin({
          ...phoneInput,
          challengeId: request.challengeId,
          code,
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  );
  it("최신 OTP만 허용하며 이전 챌린지의 해시를 다른 id에 복사할 수 없다", async () => {
    const first = await requestMemberPhoneLogin(phoneInput),
      oldCode = smsCode();
    vi.advanceTimersByTime(60_000);
    const second = await requestMemberPhoneLogin(phoneInput),
      newCode = smsCode();
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: first.challengeId,
        code: oldCode,
      })
    ).rejects.toThrow();
    const rows = challenges();
    rows[1].codeHash = rows[0].codeHash;
    await expect(
      verifyMemberPhoneLogin({
        ...phoneInput,
        challengeId: second.challengeId,
        code: newCode,
      })
    ).rejects.toThrow();
    expect(rows[0].usedAt).not.toBeNull();
    expect(challenges()[1].attempts).toBe(1);
  });
  it("동시 성공 검증 두 건 중 한 건만 토큰을 발급한다", async () => {
    const request = await requestMemberPhoneLogin(phoneInput),
      code = smsCode();
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        verifyMemberPhoneLogin({
          ...phoneInput,
          challengeId: request.challengeId,
          code,
        })
      )
    );
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
  });
});

describe("서버 측 요청 제한", () => {
  it("전화 요청 60초 재발송 및 시간당 5건을 제한하되 성공 형식은 동일하다", async () => {
    await requestMemberPhoneLogin(phoneInput);
    const suppressed = await requestMemberPhoneLogin({
      ...phoneInput,
      requestKey: "another-fixture-ip",
    });
    expect(suppressed.success).toBe(true);
    expect(challenges()).toHaveLength(1);
    expect(mocks.sendOne).toHaveBeenCalledTimes(1);
    for (let n = 1; n < 5; n++) {
      vi.advanceTimersByTime(60_000);
      await requestMemberPhoneLogin(phoneInput);
    }
    vi.advanceTimersByTime(60_000);
    await requestMemberPhoneLogin(phoneInput);
    expect(mocks.sendOne).toHaveBeenCalledTimes(5);
    expect(challenges()).toHaveLength(5);
    vi.advanceTimersByTime(3_600_001);
    await requestMemberPhoneLogin(phoneInput);
    expect(mocks.sendOne).toHaveBeenCalledTimes(6);
  });
  it("첫 요청 동시 실행도 타깃·requester 잠금으로 한 번만 발송한다", async () => {
    await Promise.all([
      requestMemberPhoneLogin(phoneInput),
      requestMemberPhoneLogin(phoneInput),
    ]);
    expect(mocks.sendOne).toHaveBeenCalledTimes(1);
    expect(challengeRows.filter(row => row.target === "")).toHaveLength(2);
  });
  it("알 수 없는 번호도 requester 한 시간 30회 상한에 포함한다", async () => {
    memberRows = [];
    for (let n = 0; n < 31; n++)
      await requestMemberPhoneLogin({
        phone: `010${String(n).padStart(8, "0")}`,
        requestKey: "shared-fixture-ip",
      });
    expect(challenges()).toHaveLength(30);
    expect(mocks.sendOne).not.toHaveBeenCalled();
  });
  it("이메일 주소 변경으로 회원·목적별 60초 제한을 우회할 수 없다", async () => {
    const input = await emailInput();
    await requestMemberEmailChange(input);
    await expect(
      requestMemberEmailChange({
        ...input,
        newEmail: "another@example.com",
        requestKey: "another-fixture-ip",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(1);
  });
  it("주소·requester를 매번 바꿔도 동일 회원은 이메일 변경 시간당 5건이다", async () => {
    const input = await emailInput();
    for (let n = 0; n < 5; n++) {
      if (n) vi.advanceTimersByTime(60_000);
      await requestMemberEmailChange({
        ...input,
        newEmail: `correct${n}@example.com`,
        requestKey: `fixture-ip-${n}`,
      });
    }
    vi.advanceTimersByTime(60_000);
    await expect(
      requestMemberEmailChange({
        ...input,
        newEmail: "sixth@example.com",
        requestKey: "fixture-ip-sixth",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(5);
  });
  it("서로 다른 회원이 같은 새 이메일을 요청해도 타깃 제한 적용", async () => {
    const input = await emailInput();
    await requestMemberEmailChange(input);
    memberRows.push({
      ...memberRows[0],
      id: 102,
      email: "other@example.com",
      phone: "01033334444",
    });
    const profileToken = await createMemberProfileToken(
      102,
      "other@example.com",
      "01033334444"
    );
    await expect(
      requestMemberEmailChange({
        ...input,
        memberId: 102,
        profileToken,
        requestKey: "other-ip",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("프로필 인증을 전제로 한 새 이메일 OTP와 변경 증빙", () => {
  it("trim·소문자 정규화, purpose 전달, verifiedAt 및 proof 10분·목적·세션 결합", async () => {
    const input = await emailInput();
    const request = await requestMemberEmailChange({
      ...input,
      newEmail: " Correct@Example.COM ",
    });
    expect(mocks.sendOtpEmail).toHaveBeenCalledWith({
      to: NEW_EMAIL,
      name: "테스트회원",
      code: expect.stringMatching(/^\d{6}$/),
      purpose: "email_change",
    });
    vi.advanceTimersByTime(540_000);
    const verified = await verifyMemberEmailChange({
      ...input,
      challengeId: request.challengeId,
      code: emailCode(),
    });
    const { payload } = await jwtVerify(
      verified.emailChangeToken,
      new TextEncoder().encode(SECRET),
      {
        issuer: "nops-member-contact-proof",
        audience: "nops-member-email-change",
      }
    );
    expect(payload).toMatchObject({
      memberId: 101,
      newEmail: NEW_EMAIL,
      challengeId: request.challengeId,
      issuerHash: challenges()[0].issuerHash,
    });
    expect(payload.exp! - payload.iat!).toBe(600);
    expect(challenges()[0].verifiedAt).not.toBeNull();
    expect(challenges()[0].usedAt).toBeNull();
    const proof = await verifyMemberEmailChangeProof({
      ...input,
      emailChangeToken: verified.emailChangeToken,
    });
    expect(proof).toEqual({
      challengeId: request.challengeId,
      issuerHash: challenges()[0].issuerHash,
    });
    expect(challenges()[0].usedAt).toBeNull();
    expect(memberRows[0].email).toBe("typo@example.com");
    await expect(
      verifyMemberEmailChange({
        ...input,
        challengeId: request.challengeId,
        code: emailCode(),
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberProfileToken(
        verified.emailChangeToken,
        101,
        "typo@example.com",
        PHONE
      )
    ).rejects.toThrow();
  });
  it("정상 기존 프로필 토큰 없이 새 주소에 발송하지 않는다", async () => {
    const input = await emailInput();
    await expect(
      requestMemberEmailChange({ ...input, profileToken: "not-authenticated" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
    expect(challenges()).toHaveLength(0);
    const attacker = await createMemberProfileToken(
      999,
      "attacker@example.com",
      "01099998888"
    );
    await expect(
      requestMemberEmailChange({ ...input, profileToken: attacker })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each([
    "known@example.com",
    "typo@example.com",
    "bad@gmial.com",
    "not-email",
  ])(
    "중복·현재·오타도메인·잘못된 주소 %s 는 발송하지 않는다",
    async newEmail => {
      const input = await emailInput();
      memberRows.push({
        ...memberRows[0],
        id: 102,
        email: "known@example.com",
      });
      await expect(
        requestMemberEmailChange({ ...input, newEmail })
      ).rejects.toThrow();
      expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
    }
  );
  it.each([{ success: false }, undefined, { success: false, id: "uncertain" }])(
    "메일 실패 반환 %j는 OTP를 비활성화한다",
    async result => {
      const input = await emailInput();
      mocks.sendOtpEmail.mockResolvedValue(result);
      await expect(requestMemberEmailChange(input)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
      expect(challenges()[0].usedAt).not.toBeNull();
      expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(1);
    }
  );
  it("메일 예외도 비활성화하며 재발송하지 않는다", async () => {
    const input = await emailInput();
    mocks.sendOtpEmail.mockRejectedValue(
      new Error("fixture-sensitive-provider-error")
    );
    await expect(requestMemberEmailChange(input)).rejects.toThrow(
      "인증번호를 발송할 수 없습니다"
    );
    expect(challenges()[0].usedAt).not.toBeNull();
    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(1);
  });
  it("새 이메일 OTP 오답도 커밋되며 다른 타깃·세션은 사용할 수 없다", async () => {
    const input = await emailInput(),
      request = await requestMemberEmailChange(input),
      code = emailCode();
    await expect(
      verifyMemberEmailChange({
        ...input,
        challengeId: request.challengeId,
        code: code === "000000" ? "111111" : "000000",
      })
    ).rejects.toThrow();
    expect(challenges()[0].attempts).toBe(1);
    expect(events.at(-1)?.event).toBe("commit");
    await expect(
      verifyMemberEmailChange({
        ...input,
        newEmail: "attacker@example.com",
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    const newSession = await createMemberProfileToken(
      101,
      "typo@example.com",
      PHONE
    );
    await expect(
      verifyMemberEmailChange({
        ...input,
        profileToken: newSession,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberEmailChange({
        ...input,
        challengeId: request.challengeId,
        code,
      })
    ).resolves.toMatchObject({ success: true });
  });
  it("프로필 토큰을 변경 proof로 재사용하거나 증빙을 다른 계정·주소·세션에 전용할 수 없다", async () => {
    const { input, verified } = await verifiedEmail();
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: input.profileToken,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        newEmail: "attacker@example.com",
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        memberId: 102,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    const newSession = await createMemberProfileToken(
      101,
      "typo@example.com",
      PHONE
    );
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        profileToken: newSession,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
  });
  it("미검증·소비됨·기한 만료·운영자 변경 proof를 거부한다", async () => {
    const { input, verified } = await verifiedEmail(),
      row = challenges()[0];
    row.usedAt = new Date();
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    challenges()[0].usedAt = null;
    challenges()[0].verifiedAt = null;
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    challenges()[0].verifiedAt = new Date();
    memberRows[0].phone = "01033334444";
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    memberRows[0].phone = "01011112222";
    vi.advanceTimersByTime(600_000);
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
  });
  it("새 이메일 OTP를 요청하면 이미 검증된 이전 proof도 무효화한다", async () => {
    const { input, verified } = await verifiedEmail();
    vi.advanceTimersByTime(60_000);
    await requestMemberEmailChange({ ...input, newEmail: "newer@example.com" });
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        emailChangeToken: verified.emailChangeToken,
      })
    ).rejects.toThrow();
    expect(challenges()[0].usedAt).not.toBeNull();
  });
  it("서명이 맞더라도 다른 audience 및 challengeId를 가진 증빙은 거부한다", async () => {
    const { input, request } = await verifiedEmail();
    const token = await new SignJWT({
      memberId: 101,
      newEmail: NEW_EMAIL,
      challengeId: request.challengeId,
      issuerHash: challenges()[0].issuerHash,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("nops-member-contact-proof")
      .setAudience("staff-auth")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(
      verifyMemberEmailChangeProof({ ...input, emailChangeToken: token })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("새 전화번호 소유 인증 및 월 1회 합산 제한", () => {
  async function phoneChangeInput() {
    const input = await emailInput();
    return {
      memberId: input.memberId,
      profileToken: input.profileToken,
      newPhone: "010-3333-4444",
      requestKey: input.requestKey,
    };
  }
  it("새 번호에 SMS를 보내고 전화 변경 목적 proof만 발급하며 저장은 하지 않는다", async () => {
    const input = await phoneChangeInput();
    const request = await requestMemberPhoneChange(input),
      code = smsCode();
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
    expect(mocks.sendOne.mock.calls[0][0]).toMatchObject({
      to: "01033334444",
      type: "SMS",
    });
    expect(challenges()[0]).toMatchObject({
      target: "01033334444",
      purpose: "phone_change",
      phoneSnapshot: PHONE,
    });
    const verified = await verifyMemberPhoneChange({
      ...input,
      challengeId: request.challengeId,
      code,
    });
    const { payload } = await jwtVerify(
      verified.phoneChangeToken,
      new TextEncoder().encode(SECRET),
      {
        issuer: "nops-member-contact-proof",
        audience: "nops-member-phone-change",
      }
    );
    expect(payload).toMatchObject({
      memberId: 101,
      newPhone: "01033334444",
      challengeId: request.challengeId,
      issuerHash: challenges()[0].issuerHash,
    });
    expect(payload.exp! - payload.iat!).toBe(600);
    expect(memberRows[0].phone).toBe("010-1111-2222");
    const proof = await verifyMemberPhoneChangeProof({
      ...input,
      phoneChangeToken: verified.phoneChangeToken,
    });
    expect(proof).toEqual({
      challengeId: request.challengeId,
      issuerHash: challenges()[0].issuerHash,
    });
    expect(challenges()[0].usedAt).toBeNull();
    expect(challenges()[0].verifiedAt).not.toBeNull();
    await expect(
      verifyMemberPhoneChange({
        ...input,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberEmailChangeProof({
        ...input,
        newEmail: NEW_EMAIL,
        emailChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberProfileToken(
        verified.phoneChangeToken,
        101,
        "typo@example.com",
        PHONE
      )
    ).rejects.toThrow();
  });
  it("본인인증 없는 요청·현재 번호·다른 상태 회원의 중복 번호는 발송하지 않는다", async () => {
    const input = await phoneChangeInput();
    await expect(
      requestMemberPhoneChange({ ...input, profileToken: "fake" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      requestMemberPhoneChange({ ...input, newPhone: PHONE })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    memberRows.push({
      ...memberRows[0],
      id: 102,
      phone: "01033334444",
      status: "withdrawn",
    });
    await expect(requestMemberPhoneChange(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.sendOne).not.toHaveBeenCalled();
    expect(challenges()).toHaveLength(0);
  });
  it("새 전화 OTP 오답도 커밋·5회 제한, 성공 코드라도 다른 번호는 검증할 수 없다", async () => {
    const input = await phoneChangeInput(),
      request = await requestMemberPhoneChange(input),
      code = smsCode();
    await expect(
      verifyMemberPhoneChange({
        ...input,
        newPhone: "01055556666",
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
    expect(challenges()[0].attempts).toBe(0);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let n = 1; n <= 5; n++) {
      await expect(
        verifyMemberPhoneChange({
          ...input,
          challengeId: request.challengeId,
          code: wrong,
        })
      ).rejects.toThrow();
      expect(challenges()[0].attempts).toBe(n);
      expect(events.at(-1)?.event).toBe("commit");
    }
    await expect(
      verifyMemberPhoneChange({
        ...input,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
  });
  it("새 전화 OTP 최신화·만료·운영자 스냅샷 변경을 검사한다", async () => {
    const input = await phoneChangeInput(),
      first = await requestMemberPhoneChange(input),
      firstCode = smsCode();
    vi.advanceTimersByTime(60_000);
    const second = await requestMemberPhoneChange({
        ...input,
        newPhone: "01055556666",
      }),
      secondCode = smsCode();
    await expect(
      verifyMemberPhoneChange({
        ...input,
        challengeId: first.challengeId,
        code: firstCode,
      })
    ).rejects.toThrow();
    memberRows[0].email = "edited@example.com";
    await expect(
      verifyMemberPhoneChange({
        ...input,
        newPhone: "01055556666",
        challengeId: second.challengeId,
        code: secondCode,
      })
    ).rejects.toThrow();
    memberRows[0].email = "typo@example.com";
    vi.advanceTimersByTime(600_000);
    await expect(
      verifyMemberPhoneChange({
        ...input,
        newPhone: "01055556666",
        challengeId: second.challengeId,
        code: secondCode,
      })
    ).rejects.toThrow();
  });
  it("전화 변경 증빙도 다른 세션·번호·계정과 소비·만료 후에는 무효다", async () => {
    const input = await phoneChangeInput(),
      request = await requestMemberPhoneChange(input);
    const verified = await verifyMemberPhoneChange({
      ...input,
      challengeId: request.challengeId,
      code: smsCode(),
    });
    await expect(
      verifyMemberPhoneChangeProof({
        ...input,
        newPhone: "01055556666",
        phoneChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
    await expect(
      verifyMemberPhoneChangeProof({
        ...input,
        memberId: 102,
        phoneChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    const differentSession = await createMemberProfileToken(
      101,
      "typo@example.com",
      PHONE
    );
    await expect(
      verifyMemberPhoneChangeProof({
        ...input,
        profileToken: differentSession,
        phoneChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
    challenges()[0].usedAt = new Date();
    await expect(
      verifyMemberPhoneChangeProof({
        ...input,
        phoneChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
    challenges()[0].usedAt = null;
    vi.advanceTimersByTime(600_000);
    await expect(
      verifyMemberPhoneChangeProof({
        ...input,
        phoneChangeToken: verified.phoneChangeToken,
      })
    ).rejects.toThrow();
  });
  it("phone_change proof와 phone_login OTP는 서로 대체할 수 없다", async () => {
    const input = await phoneChangeInput(),
      request = await requestMemberPhoneChange(input),
      code = smsCode();
    await expect(
      verifyMemberPhoneLogin({
        phone: input.newPhone,
        challengeId: request.challengeId,
        code,
      })
    ).rejects.toThrow();
    const login = await requestMemberPhoneLogin(phoneInput);
    await expect(
      verifyMemberPhoneChange({
        ...input,
        challengeId: login.challengeId,
        code: smsCode(),
      })
    ).rejects.toThrow();
  });
  it("새 번호를 바꿔가며 요청해도 동일 회원·목적 60초 및 시간당 5건 제한", async () => {
    const input = await phoneChangeInput();
    await requestMemberPhoneChange(input);
    await expect(
      requestMemberPhoneChange({ ...input, newPhone: "01055556666" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    for (let n = 1; n < 5; n++) {
      vi.advanceTimersByTime(60_000);
      await requestMemberPhoneChange({
        ...input,
        newPhone: `010${String(10000000 + n)}`,
        requestKey: `phone-fixture-ip-${n}`,
      });
    }
    vi.advanceTimersByTime(60_000);
    await expect(
      requestMemberPhoneChange({
        ...input,
        newPhone: "01077778888",
        requestKey: "phone-fixture-last",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.sendOne).toHaveBeenCalledTimes(5);
  });
  it("SMS 실패 시 전화 변경 챌린지도 비활성화하고 한 번만 제출한다", async () => {
    const input = await phoneChangeInput();
    mocks.sendOne.mockResolvedValue({ ...accepts(), failedCount: 1 });
    await expect(requestMemberPhoneChange(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(challenges()[0].usedAt).not.toBeNull();
    expect(mocks.sendOne).toHaveBeenCalledTimes(1);
  });
  it("이번 달 이미 연락처·이메일·생일 중 하나를 수정했다면 유료 발송 전 차단", async () => {
    memberRows[0].lastSelfProfileEditAt = new Date("2026-11-01T00:00:00Z");
    await expect(
      requestMemberEmailChange(await emailInput())
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(
      requestMemberPhoneChange(await phoneChangeInput())
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
    expect(mocks.getBalance).not.toHaveBeenCalled();
    expect(mocks.sendOne).not.toHaveBeenCalled();
    expect(challenges()).toHaveLength(0);
    // Monthly edit limits do not prevent recovery/login.
    await expect(requestMemberPhoneLogin(phoneInput)).resolves.toMatchObject({
      success: true,
    });
  });
  it("지난달 수정 기록은 새 OTP 요청을 허용하며 요청 자체는 월간 기록을 소비하지 않는다", async () => {
    memberRows[0].lastSelfProfileEditAt = new Date("2026-10-01T00:00:00Z");
    await requestMemberEmailChange(await emailInput());
    await requestMemberPhoneChange(await phoneChangeInput());
    expect(memberRows[0].lastSelfProfileEditAt.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    );
    expect(mocks.sendOne).toHaveBeenCalledTimes(1);
    expect(mocks.sendOtpEmail).toHaveBeenCalledTimes(1);
  });
});
