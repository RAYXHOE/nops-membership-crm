import { createHash, createHmac } from "node:crypto";
import { formatISO } from "date-fns";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  get: vi.fn(),
  fetchRequest: vi.fn(),
  constructor: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function (key: string) {
    mocks.constructor(key);
    return {
      emails: { send: mocks.send, get: mocks.get },
      fetchRequest: mocks.fetchRequest,
    };
  }),
}));

import { Resend } from "resend";
import {
  readOccasionNoticeDelivery,
  renderOccasionNoticeEmail,
  renderOccasionNoticeLms,
  sendOccasionNotice,
  type OccasionNotice,
} from "./occasionNotification";

const notice: OccasionNotice = {
  type: "birthday",
  name: "테스트회원",
  couponCode: "FIXTURE-COUPON",
  couponName: "생일 15% 할인 쿠폰",
  discountPercent: 15,
  expiresAt: new Date("2027-12-15T14:59:59.000Z"),
  occasionDate: "2026-12-16",
};
const email = "fixture@example.test";
const phone = "010-0000-0000";
const key = "occasion-fixture-birthday-email";
const DAYTIME = "2026-11-16T01:00:00.000Z"; // 10:00 KST
let fetchMock: ReturnType<typeof vi.fn>;
let timeoutSpy: MockInstance<typeof AbortSignal.timeout>;
let logSpies: ReturnType<typeof vi.spyOn>[];

function acceptedSms() {
  return {
    groupInfo: {
      groupId: "fixture-group-id",
      status: "SENDING",
      count: {
        total: 1,
        registeredSuccess: 1,
        registeredFailed: 0,
        sentFailed: 0,
        sentSuccess: 0,
        sentPending: 1,
      },
    },
    failedMessageList: [],
    messageList: [{ messageId: "fixture-message-id", statusCode: "2000" }],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(DAYTIME));
  vi.stubEnv("RESEND_API_KEY", "fixture-resend-key");
  vi.stubEnv(
    "EMAIL_FROM",
    "NOPS Steak House \\u003cfixture@example.test\\u003e"
  );
  vi.stubEnv("SOLAPI_API_KEY", "fixture-solapi-key");
  vi.stubEnv("SOLAPI_API_SECRET", "fixture-solapi-secret");
  vi.stubEnv("SOLAPI_SENDER_PHONE", "02-597-4030");
  vi.mocked(Resend).mockImplementation(function (apiKey: string | undefined) {
    mocks.constructor(apiKey);
    return {
      emails: { send: mocks.send, get: mocks.get },
      fetchRequest: mocks.fetchRequest,
    } as unknown as Resend;
  });
  mocks.send.mockReset();
  mocks.get.mockReset();
  mocks.get.mockResolvedValue({
    data: { id: "fixture-email-id", last_event: "sent" },
    error: null,
  });
  mocks.send.mockResolvedValue({
    data: { id: "fixture-email-id" },
    error: null,
    headers: null,
  });
  // Even unexpected provider calls are mocked: there is NEVER live network I/O.
  fetchMock = vi
    .fn()
    .mockRejectedValue(new Error("unexpected_mock_network_call"));
  vi.stubGlobal("fetch", fetchMock);
  timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(
      () =>
        controller.abort(new DOMException("fixture timeout", "TimeoutError")),
      ms
    );
    return controller.signal;
  });
  logSpies = ["log", "info", "warn", "error", "debug"].map(method =>
    vi.spyOn(console, method as "log").mockImplementation(() => {})
  );
});

afterEach(() => {
  // Stronger than redaction: this module never logs provider/member data at all.
  for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("기념일 안내 렌더러", () => {
  it.each([
    ["birthday", "생일"],
    ["anniversary", "결혼기념일"],
  ] as const)(
    "%s 이메일 제목에는 이름 없이 광고 표시와 할인율이 있다",
    (type, label) => {
      const rendered = renderOccasionNoticeEmail({ ...notice, type });
      expect(rendered.subject).toBe(
        `(광고)[NOPS] ${label} 15% 할인 쿠폰 발급 안내`
      );
      expect(rendered.subject).not.toContain(notice.name);
      expect(rendered.subject).not.toContain(notice.couponCode);
      expect(rendered.html).toContain(
        `${label}(${notice.occasionDate}) 30일 전`
      );
    }
  );

  it("이름·쿠폰 코드·쿠폰명·기념일 날짜의 HTML 특수문자를 모두 이스케이프한다", () => {
    const rendered = renderOccasionNoticeEmail({
      ...notice,
      name: "<script>\"회원\" & '이름'</script>",
      couponCode: '<img src=x onerror="bad">&',
      couponName: "<b>쿠폰</b>",
      occasionDate: "2026-12-16<svg>",
    });
    expect(rendered.html).toContain(
      "&lt;script&gt;&quot;회원&quot; &amp; &#39;이름&#39;&lt;/script&gt;"
    );
    expect(rendered.html).toContain(
      "&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;"
    );
    expect(rendered.html).toContain("&lt;b&gt;쿠폰&lt;/b&gt;");
    expect(rendered.html).toContain("2026-12-16&lt;svg&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
  });

  it.each(["email", "sms"] as const)(
    "%s는 즉시 사용·365일·실제 KST 만료일·중복 정책을 명시한다",
    channel => {
      const rendered =
        channel === "email"
          ? renderOccasionNoticeEmail(notice).html
          : renderOccasionNoticeLms(notice).text;
      expect(rendered).toContain("발급 후 즉시 사용 가능");
      expect(rendered).toContain("발급일로부터 365일");
      expect(rendered).toContain("2027-12-15 23:59:59 (KST)");
      expect(rendered).toContain("할인 쿠폰끼리는 중복 사용이 불가");
      expect(rendered).toContain("콜키지 프리 쿠폰은 함께 사용 가능");
      expect(rendered).toContain("https://membership.nops.kr/mypage");
      expect(rendered).not.toMatch(
        /당일만|당일에만|기념일 당일|생일 당일|nobs-membership|manus\.space|#\{[^}]+\}/
      );
    }
  );

  it("서버 타임존과 관계없이 자정 경계를 KST로 렌더링한다", () => {
    const rendered = renderOccasionNoticeLms({
      ...notice,
      expiresAt: new Date("2027-12-15T15:00:00.000Z"),
    });
    expect(rendered.text).toContain("2027-12-16 00:00:00 (KST)");
  });

  it("이메일에 수신거부 마케팅 동의 링크와 매장 문의번호가 있다", () => {
    const { html } = renderOccasionNoticeEmail(notice);
    expect(html).toContain("수신거부:");
    expect(html).toContain("마이페이지 → 마케팅 수신 동의 → 수신 철회");
    expect(html).toContain('href="https://membership.nops.kr/mypage"');
    expect(html).toContain("NOPS 문의: 02-597-4030");
  });

  it("LMS 제목과 본문에 광고 표시가 있고 본문 무료수신거부는 정확히 1회다", () => {
    const { subject, text } = renderOccasionNoticeLms(notice);
    expect(subject.startsWith("(광고)[NOPS]")).toBe(true);
    expect(text.startsWith("(광고)[NOPS]\n")).toBe(true);
    expect(text.match(/\(광고\)/g)).toHaveLength(1);
    expect(text.match(/080-500-4233/g)).toHaveLength(1);
    expect(text).toContain(`${notice.name}님`);
    expect(text).toContain(`쿠폰 코드: ${notice.couponCode}`);
    expect(text).not.toMatch(/#\{[^}]+\}/);
    const url = text.match(/쿠폰 확인: (\S+)/)![1];
    expect(url).toBe(encodeURI("https://membership.nops.kr/mypage"));
    expect(new URL(url).href).toBe("https://membership.nops.kr/mypage");
  });

  it("LMS 사용자 입력 개행은 공백 처리하고 이름은 직접 삽입한다", () => {
    const { text } = renderOccasionNoticeLms({
      ...notice,
      name: "  테스트\n\t회원  ",
    });
    expect(text).toContain("테스트 회원님");
    expect(text).not.toContain("\n회원님");
  });

  it.each(["#{이름}", "회원 080-500-4233", "(광고)회원"])(
    "LMS에 미해결 변수나 고지 주입을 허용하지 않는다: %s",
    name => {
      expect(() => renderOccasionNoticeLms({ ...notice, name })).toThrow(
        "invalid_notice_text"
      );
    }
  );

  it.each([
    { name: " " },
    { couponCode: "" },
    { couponName: "" },
    { occasionDate: "" },
    { discountPercent: Number.NaN },
    { discountPercent: 0 },
    { discountPercent: 101 },
    { expiresAt: new Date("invalid") },
  ])("잘못된 안내 입력은 PII 없는 검증 오류로 차단한다", change => {
    expect(() => renderOccasionNoticeEmail({ ...notice, ...change })).toThrow(
      "invalid_notice"
    );
    expect(() => renderOccasionNoticeLms({ ...notice, ...change })).toThrow(
      "invalid_notice"
    );
  });
});

describe("공통 발송 보호", () => {
  it.each([undefined, null, "", "kakao", "email_sms"])(
    "명시적 단일 채널 없이 발송하지 않는다: %s",
    async channel => {
      const result = await sendOccasionNotice(
        channel as "email",
        email,
        notice,
        key
      );
      expect(result).toEqual({
        status: "blocked",
        reason: "channel_not_selected",
      });
      expect(mocks.constructor).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["email", "sms"] as const)(
    "%s는 광고 시간 밖에서 공급자를 호출하지 않는다",
    async channel => {
      for (const instant of [
        "2026-11-15T23:59:59.000Z", // 08:59:59 KST
        "2026-11-16T11:00:00.000Z", // 20:00 KST
        "2026-11-16T15:00:00.000Z", // midnight KST
      ]) {
        vi.setSystemTime(new Date(instant));
        expect(
          await sendOccasionNotice(
            channel,
            channel === "email" ? email : phone,
            notice,
            key
          )
        ).toEqual({
          status: "blocked",
          reason: "outside_advertising_hours",
        });
      }
      expect(mocks.constructor).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["2026-11-16T00:00:00.000Z", "2026-11-16T10:59:59.000Z"])(
    "KST 09:00부터 19:59:59까지 허용한다: %s",
    async instant => {
      vi.setSystemTime(new Date(instant));
      expect(
        (await sendOccasionNotice("email", email, notice, key)).status
      ).toBe("accepted");
      expect(mocks.send).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["", "key\nheader", "한글키", "x".repeat(257)])(
    "잘못된 멱등키는 공급자 호출 전에 차단한다",
    async invalidKey => {
      expect(
        await sendOccasionNotice("email", email, notice, invalidKey)
      ).toEqual({ status: "blocked", reason: "invalid_request" });
      expect(mocks.send).not.toHaveBeenCalled();
    }
  );

  it("잘못된 쿠폰 입력은 공급자 호출 전에 차단한다", async () => {
    expect(
      await sendOccasionNotice("email", email, { ...notice, name: "" }, key)
    ).toEqual({ status: "blocked", reason: "invalid_notice" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("Resend 이메일 어댑터", () => {
  it("ID가 있는 접수만 accepted이며 환경 FROM 정규화·멱등키·20초 signal을 전달한다", async () => {
    expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
      status: "accepted",
      providerMessageId: "fixture-email-id",
    });
    expect(mocks.constructor).toHaveBeenCalledWith("fixture-resend-key");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload).toEqual({
      from: "NOPS Steak House <fixture@example.test>",
      to: email,
      replyTo: "contact@nops.kr",
      headers: { "List-Unsubscribe": "<mailto:contact@nops.kr?subject=unsubscribe>" },
      ...renderOccasionNoticeEmail(notice),
    });
    expect(options.idempotencyKey).toBe(key);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("EMAIL_FROM 미설정 시 기존 안전 기본값을 유지한다", async () => {
    vi.stubEnv("EMAIL_FROM", undefined);
    await sendOccasionNotice("email", email, notice, key);
    expect(mocks.send.mock.calls[0][0].from).toBe(
      "NOPS Steak House <onboarding@resend.dev>"
    );
  });

  it("RESEND_API_KEY 미설정 시 초기화·발송하지 않는다", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
      status: "blocked",
      reason: "provider_not_ready",
    });
    expect(mocks.constructor).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    "invalid",
    "fixture@example.test,other@example.test",
    "fixture@example.test\n",
    "Display <fixture@example.test>",
  ])("단일 수신주소만 허용한다", async destination => {
    expect(
      (await sendOccasionNotice("email", destination, notice, key)).status
    ).toBe("blocked");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 409, 422, 429])(
    "Resend %s 오류는 failed이고 재시도하지 않는다",
    async statusCode => {
      mocks.send.mockResolvedValue({
        data: null,
        error: { statusCode, message: `${email} private error` },
      });
      expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
        status: "failed",
        reason: "provider_rejected",
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([500, 502, 503, null, undefined])(
    "Resend %s 오류는 unknown이고 원문 오류를 노출하지 않는다",
    async statusCode => {
      mocks.send.mockResolvedValue({
        data: null,
        error: {
          statusCode,
          message: `${email} ${notice.name} ${notice.couponCode}`,
        },
      });
      expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
        status: "unknown",
        reason: "provider_response_unknown",
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
    }
  );

  it.each([null, {}, { id: null }, { id: "" }, { id: email }])(
    "오류 null이어도 data.id 누락/비정상은 성공이 아니다",
    async data => {
      mocks.send.mockResolvedValue({ data, error: null });
      expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
        status: "unknown",
        reason: "missing_provider_id",
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
    }
  );

  it("ID가 있어도 오류 응답이 있으면 접수 성공으로 처리하지 않는다", async () => {
    mocks.send.mockResolvedValue({
      data: { id: "fixture-email-id" },
      error: { statusCode: 400 },
    });
    expect((await sendOccasionNotice("email", email, notice, key)).status).toBe(
      "failed"
    );
  });

  it("예외는 개인정보 없이 unknown이며 문자 대체나 재시도를 하지 않는다", async () => {
    mocks.send.mockRejectedValue(
      new Error(`${email} ${notice.name} ${notice.couponCode}`)
    );
    expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
      status: "unknown",
      reason: "request_unknown",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Resend 타임아웃은 20초 후 unknown이며 취소 signal을 전달한다", async () => {
    mocks.send.mockImplementation(
      (_payload, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true }
          );
        })
    );
    const result = sendOccasionNotice("email", email, notice, key);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toEqual({
      status: "unknown",
      reason: "request_unknown",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("설치된 실제 Resend SDK도 목 fetch에만 Idempotency-Key와 signal을 전달한다", async () => {
    const actual = await vi.importActual<typeof import("resend")>("resend");
    vi.mocked(Resend).mockImplementation(function (apiKey: string | undefined) {
      return new actual.Resend(apiKey);
    });
    fetchMock.mockResolvedValue(jsonResponse({ id: "fixture-sdk-email-id" }));
    expect(await sendOccasionNotice("email", email, notice, key)).toEqual({
      status: "accepted",
      providerMessageId: "fixture-sdk-email-id",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.get("Idempotency-Key")).toBe(key);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.method).toBe("POST");
  });
});

describe("SOLAPI 무재시도 raw LMS 어댑터", () => {
  it("SDK에서 확인한 경로·단건 배열·환경 발신번호·HMAC·20초 signal을 사용한다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(acceptedSms()));
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "accepted",
      providerMessageId: "fixture-group-id",
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.solapi.com/messages/v4/send-many/detail");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    const authorization = options.headers.Authorization;
    const match = authorization.match(
      /^HMAC-SHA256 apiKey=([^,]+), date=([^,]+), salt=([^,]+), signature=(\w+)$/
    )!;
    expect(match).not.toBeNull();
    expect(match[1]).toBe("fixture-solapi-key");
    expect(match[2]).toBe(formatISO(new Date(DAYTIME)));
    expect(match[3]).toMatch(/^[a-f0-9]{32}$/);
    expect(match[4]).toBe(
      createHmac("sha256", "fixture-solapi-secret")
        .update(match[2] + match[3])
        .digest("hex")
    );
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({
      allowDuplicates: false,
      showMessageList: true,
      agent: { sdkVersion: "nodejs/6.0.1" },
    });
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]).toEqual({
      to: "01000000000",
      from: "025974030",
      type: "LMS",
      ...renderOccasionNoticeLms(notice),
      customFields: {
        occasionNoticeKey: createHash("sha256").update(key).digest("hex"),
      },
    });
    // Renderer calls it text (not html); no replacements/variables are submitted.
    expect(payload.messages[0]).not.toHaveProperty("replacements");
    expect(payload.messages[0]).not.toHaveProperty("kakaoOptions");
    expect(payload.messages[0].text.match(/080-500-4233/g)).toHaveLength(1);
  });

  it("+82 수신번호를 국내 형식으로 정규화한다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(acceptedSms()));
    await sendOccasionNotice("sms", "+82 10-0000-0000", notice, key);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].to).toBe(
      "01000000000"
    );
  });

  it("LMS 접수는 최종 delivered 상태가 아니며 messageList 미포함 시 groupId를 반환한다", async () => {
    const response = acceptedSms();
    const { messageList: _list, ...groupOnly } = response;
    fetchMock.mockResolvedValue(jsonResponse(groupOnly));
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "accepted",
      providerMessageId: "fixture-group-id",
    });
    expect(response.groupInfo.count.sentSuccess).toBe(0);
  });

  it("COMPLETE 그룹도 단건 접수 카운트와 실패 없음이 확인되어야 accepted다", async () => {
    const response = acceptedSms();
    response.groupInfo.status = "COMPLETE";
    fetchMock.mockResolvedValue(jsonResponse(response));
    expect((await sendOccasionNotice("sms", phone, notice, key)).status).toBe(
      "accepted"
    );
  });

  it.each(["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_PHONE"])(
    "%s 미설정은 API 조회/발송 없이 blocked다",
    async environment => {
      vi.stubEnv(environment, "");
      expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
        status: "blocked",
        reason: "provider_not_ready",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("잘못된 발신번호는 guessed fallback 없이 차단한다", async () => {
    vi.stubEnv("SOLAPI_SENDER_PHONE", "invalid-sender");
    expect((await sendOccasionNotice("sms", phone, notice, key)).status).toBe(
      "blocked"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "010invalid0000",
    "01000000000,01000000001",
    "fixture@example.test",
  ])("단일 유효 휴대폰만 허용한다", async destination => {
    expect(
      (await sendOccasionNotice("sms", destination, notice, key)).status
    ).toBe("blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("미해결 LMS 변수가 있으면 공급자 호출 전에 차단한다", async () => {
    expect(
      await sendOccasionNotice(
        "sms",
        phone,
        { ...notice, couponCode: "#{코드}" },
        key
      )
    ).toEqual({ status: "blocked", reason: "invalid_notice" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 409, 422, 429])(
    "HTTP %s는 failed이고 자동 재시도/조회/이메일 대체가 없다",
    async status => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { errorMessage: `${phone} ${notice.name} ${notice.couponCode}` },
          status
        )
      );
      expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
        status: "failed",
        reason: "provider_rejected",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.send).not.toHaveBeenCalled();
    }
  );

  it.each([500, 502, 503, 504])(
    "HTTP %s는 unknown이고 SDK식 재시도를 하지 않는다",
    async status => {
      fetchMock.mockResolvedValue(
        jsonResponse({ errorMessage: "private provider error" }, status)
      );
      expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
        status: "unknown",
        reason: "provider_response_unknown",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("모든 단건 등록 실패는 raw failedMessageList 원문 없이 failed다", async () => {
    const response = acceptedSms();
    response.groupInfo.count.registeredSuccess = 0;
    response.groupInfo.count.registeredFailed = 1;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...response,
        failedMessageList: [{ to: phone, statusMessage: notice.name }],
      })
    );
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "failed",
      reason: "provider_rejected",
    });
  });

  it.each([
    null,
    {},
    { groupId: "fixture-group-id" },
    { data: { groupId: "fixture-group-id" } },
  ])("검증되지 않은 응답 모양을 접수로 추측하지 않는다", async response => {
    fetchMock.mockResolvedValue(jsonResponse(response));
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "unknown",
      reason: "provider_response_unknown",
    });
  });

  it.each([
    "groupId",
    "status",
    "total",
    "registeredSuccess",
    "registeredFailed",
    "sentFailed",
    "failedMessageList",
    "messageList",
  ])("모순/누락 %s는 성공이 아니다", async field => {
    const response: any = acceptedSms();
    if (field === "groupId") response.groupInfo.groupId = "";
    else if (field === "status") response.groupInfo.status = "PENDING";
    else if (field === "failedMessageList") delete response.failedMessageList;
    else if (field === "messageList") response.messageList = [];
    else response.groupInfo.count[field] = 2;
    fetchMock.mockResolvedValue(jsonResponse(response));
    expect((await sendOccasionNotice("sms", phone, notice, key)).status).toBe(
      "unknown"
    );
  });

  it("목 네트워크 예외는 PII 없이 unknown이며 재시도하지 않는다", async () => {
    fetchMock.mockRejectedValue(
      new Error(`ECONNRESET ${phone} ${notice.name} ${notice.couponCode}`)
    );
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "unknown",
      reason: "request_unknown",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("20초 타임아웃은 unknown이며 raw 요청 취소 뒤 재전송하지 않는다", async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true }
          );
        })
    );
    const result = sendOccasionNotice("sms", phone, notice, key);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toEqual({
      status: "unknown",
      reason: "request_unknown",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("JSON 파싱 실패도 불확실 요청이며 raw 본문을 노출하지 않는다", async () => {
    fetchMock.mockResolvedValue(
      new Response(`${phone} private html`, { status: 200 })
    );
    expect(await sendOccasionNotice("sms", phone, notice, key)).toEqual({
      status: "unknown",
      reason: "request_unknown",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("발송 없는 읽기 전용 배달상태 추적", () => {
  it.each(["delivered", "email.delivered", "opened", "clicked"])(
    "Resend %s 이벤트는 delivered다",
    async last_event => {
      mocks.get.mockResolvedValue({
        data: { id: "fixture-email-id", last_event },
        error: null,
      });
      expect(
        await readOccasionNoticeDelivery("email", "fixture-email-id")
      ).toEqual({ status: "delivered" });
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.get).toHaveBeenCalledWith("fixture-email-id");
      expect(mocks.send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["sent", "queued", "scheduled", "delivery_delayed"])(
    "Resend %s 이벤트는 접수 상태다",
    async last_event => {
      mocks.get.mockResolvedValue({
        data: { id: "fixture-email-id", last_event },
        error: null,
      });
      expect(
        await readOccasionNoticeDelivery("email", "fixture-email-id")
      ).toEqual({ status: "accepted" });
      expect(mocks.send).not.toHaveBeenCalled();
    }
  );

  it.each(["bounced", "failed", "canceled", "suppressed"])(
    "Resend %s 이벤트는 원문 이유 없이 failed다",
    async last_event => {
      mocks.get.mockResolvedValue({
        data: { id: "fixture-email-id", last_event },
        error: null,
      });
      expect(
        await readOccasionNoticeDelivery("email", "fixture-email-id")
      ).toEqual({ status: "failed", reason: "delivery_failed" });
    }
  );

  it.each([401, 403, 404, 500, 503])(
    "조회 HTTP %s는 발송 실패가 아니라 추적 불가다",
    async statusCode => {
      mocks.get.mockResolvedValue({
        data: null,
        error: { statusCode, message: `${email} private error` },
      });
      expect(
        await readOccasionNoticeDelivery("email", "fixture-email-id")
      ).toEqual({
        status: "accepted",
        reason: "delivery_tracking_unavailable",
      });
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.send).not.toHaveBeenCalled();
    }
  );

  it("Resend 응답 ID 불일치/미확인 이벤트는 기존 접수를 유지한다", async () => {
    mocks.get.mockResolvedValue({
      data: { id: "other-id", last_event: "delivered" },
      error: null,
    });
    expect(
      await readOccasionNoticeDelivery("email", "fixture-email-id")
    ).toEqual({ status: "accepted", reason: "tracking_unverified" });
    mocks.get.mockResolvedValue({
      data: { id: "fixture-email-id", last_event: "unverified" },
      error: null,
    });
    expect(
      await readOccasionNoticeDelivery("email", "fixture-email-id")
    ).toEqual({ status: "accepted", reason: "tracking_unverified" });
  });

  it("실제 설치 Resend SDK 조회도 목 GET 한 번과 20초 signal만 사용한다", async () => {
    const actual = await vi.importActual<typeof import("resend")>("resend");
    vi.mocked(Resend).mockImplementation(function (apiKey: string | undefined) {
      return new actual.Resend(apiKey);
    });
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "fixture-email-id", last_event: "delivered" })
    );
    expect(
      await readOccasionNoticeDelivery("email", "fixture-email-id")
    ).toEqual({ status: "delivered" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/fixture-email-id");
    expect(options.method).toBe("GET");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe("error");
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("SOLAPI는 검증된 단일 그룹 GET 경로를 사용하며 pending은 accepted다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(acceptedSms().groupInfo));
    expect(await readOccasionNoticeDelivery("sms", "fixture-group-id")).toEqual(
      { status: "accepted" }
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.solapi.com/messages/v4/groups/fixture-group-id"
    );
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("SOLAPI 성공1·실패0·pending0을 확인해야 delivered다", async () => {
    const group = acceptedSms().groupInfo;
    group.count.sentSuccess = 1;
    group.count.sentPending = 0;
    group.status = "COMPLETE";
    fetchMock.mockResolvedValue(jsonResponse(group));
    expect(await readOccasionNoticeDelivery("sms", "fixture-group-id")).toEqual(
      { status: "delivered" }
    );
  });

  it("SOLAPI 단건 전송 실패는 개인정보 없는 failed다", async () => {
    const group = acceptedSms().groupInfo;
    group.count.sentFailed = 1;
    group.count.sentPending = 0;
    fetchMock.mockResolvedValue(
      jsonResponse({ ...group, reason: `${phone} private` })
    );
    expect(await readOccasionNoticeDelivery("sms", "fixture-group-id")).toEqual(
      { status: "failed", reason: "delivery_failed" }
    );
  });

  it.each([
    {},
    { groupInfo: acceptedSms().groupInfo },
    { groupId: "fixture-message-id", count: { total: 1, sentSuccess: 1 } },
  ])("미확인 그룹/메시지 ID 혼합 응답은 추측하지 않는다", async response => {
    fetchMock.mockResolvedValue(jsonResponse(response));
    expect(await readOccasionNoticeDelivery("sms", "fixture-group-id")).toEqual(
      { status: "accepted", reason: "tracking_unverified" }
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 503])(
    "SOLAPI 조회 HTTP %s도 재시도 없이 추적 불가다",
    async status => {
      fetchMock.mockResolvedValue(
        jsonResponse({ errorMessage: "private" }, status)
      );
      expect(
        await readOccasionNoticeDelivery("sms", "fixture-group-id")
      ).toEqual({
        status: "accepted",
        reason: "delivery_tracking_unavailable",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["email", "sms"] as const)(
    "%s 추적에 비정상 ID는 호출 없이 보류한다",
    async channel => {
      expect(
        await readOccasionNoticeDelivery(channel, "../private@example.test")
      ).toEqual({ status: "accepted", reason: "tracking_unverified" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    }
  );

  it.each(["email", "sms"] as const)(
    "%s 추적 공급자 키 미설정 시 조회하지 않는다",
    async channel => {
      vi.stubEnv(
        channel === "email" ? "RESEND_API_KEY" : "SOLAPI_API_SECRET",
        ""
      );
      expect(
        await readOccasionNoticeDelivery(channel, "fixture-provider-id")
      ).toEqual({
        status: "accepted",
        reason: "delivery_tracking_unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    }
  );

  it("조회 타임아웃은 접수 상태를 유지하고 실제 발송하지 않는다", async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error(`${phone} private timeout`)),
            { once: true }
          );
        })
    );
    const result = readOccasionNoticeDelivery("sms", "fixture-group-id");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toEqual({
      status: "accepted",
      reason: "delivery_tracking_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
