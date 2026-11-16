import { createHash, createHmac, randomBytes } from "node:crypto";
import { formatISO } from "date-fns";
import { Resend } from "resend";
import type { MultipleMessageSendingRequestSchema } from "solapi";

export type OccasionNotice = {
  type: "birthday" | "anniversary";
  name: string;
  couponCode: string;
  couponName: string;
  discountPercent: number;
  expiresAt: Date;
  /** The upcoming occasion's calendar date, already determined by the caller. */
  occasionDate: string;
};

export type OccasionNoticeResult = {
  status: "accepted" | "failed" | "unknown" | "blocked";
  providerMessageId?: string;
  reason?: string;
};

const MY_PAGE_URL = "https://membership.nops.kr/mypage";
const REQUEST_TIMEOUT_MS = 20_000;
const KST = "Asia/Seoul";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function occasionLabel(o: OccasionNotice): string {
  return o.type === "birthday" ? "생일" : "결혼기념일";
}

function subject(o: OccasionNotice): string {
  // No recipient name or coupon code in the subject.
  return `(광고)[NOPS] ${occasionLabel(o)} ${o.discountPercent}% 할인 쿠폰 발급 안내`;
}

function expiryKst(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} (KST)`;
}

function validateNotice(o: OccasionNotice): void {
  if (
    !o ||
    !["birthday", "anniversary"].includes(o.type) ||
    !Number.isFinite(o.discountPercent) ||
    o.discountPercent <= 0 ||
    o.discountPercent > 100 ||
    !(o.expiresAt instanceof Date) ||
    !Number.isFinite(o.expiresAt.getTime()) ||
    ![o.name, o.couponCode, o.couponName, o.occasionDate].every(
      value => typeof value === "string" && value.trim().length > 0
    )
  ) {
    // Never include member data in validation exceptions.
    throw new Error("invalid_notice");
  }
}

export function renderOccasionNoticeEmail(o: OccasionNotice): {
  subject: string;
  html: string;
} {
  validateNotice(o);
  const title = subject(o);
  const label = occasionLabel(o);
  return {
    subject: title,
    html: `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f7f3ee;color:#1a1a1a;font-family:'Malgun Gothic',sans-serif;line-height:1.7;">
  <main style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border-radius:12px;">
    <h1 style="font-size:24px;">NOPS Steak House</h1>
    <h2 style="font-size:20px;">${escapeHtml(o.name)}님, ${label} 쿠폰이 발급되었습니다.</h2>
    <p>다가오는 ${label}(${escapeHtml(o.occasionDate)}) 30일 전, ${o.discountPercent}% 할인 쿠폰을 발급해 드립니다.</p>
    <p><strong>${escapeHtml(o.couponName)}</strong><br />쿠폰 코드: <code>${escapeHtml(o.couponCode)}</code></p>
    <p><strong>발급 후 즉시 사용 가능합니다.</strong><br />유효기간: 발급일로부터 365일<br />실제 만료일: ${expiryKst(o.expiresAt)}까지</p>
    <p>할인 쿠폰끼리는 중복 사용이 불가합니다.<br />콜키지 프리 쿠폰은 함께 사용 가능합니다.</p>
    <p><a href="${MY_PAGE_URL}">마이페이지에서 쿠폰 확인하기</a></p>
    <hr />
    <p style="font-size:12px;">본 메일은 마케팅 정보 수신에 동의하신 회원에게 발송되는 광고입니다.<br />수신거부: <a href="${MY_PAGE_URL}">마이페이지 → 마케팅 수신 동의 → 수신 철회</a> 또는 <a href="mailto:contact@nops.kr?subject=%EB%A7%88%EC%BC%80%ED%8C%85%20%EC%88%98%EC%8B%A0%EA%B1%B0%EB%B6%80">contact@nops.kr로 수신거부 요청</a><br />NOPS 문의: 02-597-4030</p>
  </main>
</body>
</html>`,
  };
}

function inlineText(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (
    /#\{[^}]*\}/.test(text) ||
    text.includes("080-500-4233") ||
    text.includes("(광고)")
  ) {
    // Do not let variable placeholders or injected advertising footers through.
    throw new Error("invalid_notice_text");
  }
  return text;
}

export function renderOccasionNoticeLms(o: OccasionNotice): {
  subject: string;
  text: string;
} {
  validateNotice(o);
  const label = occasionLabel(o);
  // encodeURI preserves a clickable URL; this canonical ASCII URL is already
  // percent-encoded and must never be encodeURIComponent-ed as a whole.
  const myPage = encodeURI(MY_PAGE_URL);
  return {
    subject: subject(o),
    text: `(광고)[NOPS]
${inlineText(o.name)}님, ${label} ${o.discountPercent}% 할인 쿠폰이 발급되었습니다.
다가오는 ${label}(${inlineText(o.occasionDate)}) 30일 전 쿠폰 발급 안내입니다.

쿠폰명: ${inlineText(o.couponName)}
쿠폰 코드: ${inlineText(o.couponCode)}
발급 후 즉시 사용 가능합니다.
유효기간: 발급일로부터 365일
실제 만료일: ${expiryKst(o.expiresAt)}까지

할인 쿠폰끼리는 중복 사용이 불가합니다.
콜키지 프리 쿠폰은 함께 사용 가능합니다.
쿠폰 확인: ${myPage}
문의: 02-597-4030
무료수신거부: 080-500-4233`,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function providerId(value: unknown): string | undefined {
  // Accept only opaque IDs; avoid accidentally returning a response body or PII.
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value)
    ? value
    : undefined;
}

function httpFailure(statusCode: unknown): OccasionNoticeResult {
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500
    ? { status: "failed", reason: "provider_rejected" }
    : { status: "unknown", reason: "provider_response_unknown" };
}

function advertisingHoursOpen(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: KST,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date())
  );
  // Conservative advertising window: 09:00 inclusive, 20:00 exclusive (KST).
  return hour >= 9 && hour < 20;
}

function normalizePhone(value: string): string {
  const compact = value.replace(/[\s-]/g, "");
  return compact.startsWith("+82") ? `0${compact.slice(3)}` : compact;
}

async function sendEmail(
  destination: string,
  o: OccasionNotice,
  idempotencyKey: string
): Promise<OccasionNoticeResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey?.trim())
    return { status: "blocked", reason: "provider_not_ready" };
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(destination)) {
    return { status: "blocked", reason: "invalid_destination" };
  }
  try {
    // Do not import email.ts: it has unrelated top-level provider initialization.
    const resend = new Resend(apiKey);
    const from = (
      process.env.EMAIL_FROM ?? "NOPS Steak House <onboarding@resend.dev>"
    )
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">");
    const rendered = renderOccasionNoticeEmail(o);
    // resend@6.12.4 emails.send -> post spreads options into fetch's RequestInit.
    // The installed SDK has no automatic retry; the signal bounds its only call.
    const options: NonNullable<Parameters<typeof resend.emails.send>[1]> & {
      signal: AbortSignal;
    } = { idempotencyKey, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
    const result = await resend.emails.send(
      { from, to: destination, replyTo: "contact@nops.kr", headers: { "List-Unsubscribe": "<mailto:contact@nops.kr?subject=unsubscribe>" }, ...rendered },
      options
    );
    if (result.error) return httpFailure(result.error.statusCode);
    const id = providerId(result.data?.id);
    return id
      ? { status: "accepted", providerMessageId: id }
      : { status: "unknown", reason: "missing_provider_id" };
  } catch {
    // A thrown error or timeout may follow acceptance. Never retry/log its data.
    return { status: "unknown", reason: "request_unknown" };
  }
}

function solapiResult(value: unknown): OccasionNoticeResult {
  const response = record(value);
  const group = record(response.groupInfo);
  const count = record(group.count);
  const failedList = response.failedMessageList;
  const groupId = providerId(group.groupId);
  // Exact solapi@6.0.1 send response: groupInfo, failedMessageList, messageList.
  if (
    Array.isArray(failedList) &&
    failedList.length === 1 &&
    count.total === 1 &&
    count.registeredFailed === 1 &&
    count.registeredSuccess === 0
  ) {
    return { status: "failed", reason: "provider_rejected" };
  }
  if (
    !groupId ||
    !Array.isArray(failedList) ||
    failedList.length !== 0 ||
    !["SENDING", "COMPLETE"].includes(String(group.status)) ||
    count.total !== 1 ||
    count.registeredSuccess !== 1 ||
    count.registeredFailed !== 0 ||
    count.sentFailed !== 0
  ) {
    return { status: "unknown", reason: "provider_response_unknown" };
  }
  let messageId: string | undefined;
  if (response.messageList !== undefined) {
    if (
      !Array.isArray(response.messageList) ||
      response.messageList.length !== 1
    ) {
      return { status: "unknown", reason: "provider_response_unknown" };
    }
    messageId = providerId(record(response.messageList[0]).messageId);
    if (!messageId) return { status: "unknown", reason: "missing_provider_id" };
  }
  // Persist GROUP ID consistently; GET groups/{id} cannot track a message ID.
  return { status: "accepted", providerMessageId: groupId };
}

async function sendSms(
  destination: string,
  o: OccasionNotice,
  idempotencyKey: string
): Promise<OccasionNoticeResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = normalizePhone(process.env.SOLAPI_SENDER_PHONE ?? "");
  // The registered sender comes ONLY from the project's existing environment.
  // No fallback/guessed number: 02-597-4030 normalizes to 025974030.
  if (!apiKey?.trim() || !apiSecret?.trim() || !/^\d{8,15}$/.test(from)) {
    return { status: "blocked", reason: "provider_not_ready" };
  }
  const to = normalizePhone(destination);
  if (!/^01[016789]\d{7,8}$/.test(to)) {
    return { status: "blocked", reason: "invalid_destination" };
  }
  let rendered: ReturnType<typeof renderOccasionNoticeLms>;
  try {
    rendered = renderOccasionNoticeLms(o);
  } catch {
    return { status: "blocked", reason: "invalid_notice" };
  }
  try {
    // Verified locally against solapi@6.0.1 getAuthInfo and MessageService.send.
    // SDK defaultFetcher retries 503/network faults three times; bypass it.
    const date = formatISO(new Date());
    const salt = randomBytes(16).toString("hex");
    const signature = createHmac("sha256", apiSecret)
      .update(date + salt)
      .digest("hex");
    const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
    const payload = {
      messages: [
        {
          to,
          from,
          type: "LMS",
          subject: rendered.subject,
          text: rendered.text,
          // Correlation metadata ONLY: SOLAPI does not guarantee idempotence.
          // Caller must durably claim attempts and never auto-retry unknowns.
          customFields: {
            occasionNoticeKey: createHash("sha256")
              .update(idempotencyKey)
              .digest("hex"),
          },
        },
      ],
      allowDuplicates: false,
      showMessageList: true,
      agent: {
        sdkVersion: "nodejs/6.0.1",
        osPlatform: `${process.platform} | ${process.version}`,
      },
    } satisfies MultipleMessageSendingRequestSchema;
    const response = await fetch(
      "https://api.solapi.com/messages/v4/send-many/detail",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      }
    );
    if (!response.ok) return httpFailure(response.status);
    return solapiResult(await response.json());
  } catch {
    // No retry, balance/API query, PII logging or raw provider errors.
    return { status: "unknown", reason: "request_unknown" };
  }
}

/**
 * No default channel, implicit fallback, scheduler, database access or bulk send.
 * Passing one explicit channel is the caller's opt-in, not a marketing-consent
 * check. The parent service MUST preflight consent/eligibility, budget, quota,
 * filters and durable attempt idempotency before calling. accepted means provider
 * acceptance, not final delivery. unknown must never be retried automatically.
 */
export async function sendOccasionNotice(
  channel: "email" | "sms",
  destination: string,
  o: OccasionNotice,
  idempotencyKey: string
): Promise<OccasionNoticeResult> {
  // Fail closed even for JavaScript callers bypassing the TypeScript signature.
  if (channel !== "email" && channel !== "sms") {
    return { status: "blocked", reason: "channel_not_selected" };
  }
  if (!advertisingHoursOpen()) {
    return { status: "blocked", reason: "outside_advertising_hours" };
  }
  if (
    typeof destination !== "string" ||
    typeof idempotencyKey !== "string" ||
    !/^[\x21-\x7e]{1,256}$/.test(idempotencyKey)
  ) {
    return { status: "blocked", reason: "invalid_request" };
  }
  try {
    validateNotice(o);
  } catch {
    return { status: "blocked", reason: "invalid_notice" };
  }
  return channel === "email"
    ? sendEmail(destination, o, idempotencyKey)
    : sendSms(destination, o, idempotencyKey);
}

export type OccasionNoticeDeliveryResult = {
  status: "accepted" | "delivered" | "failed" | "unknown";
  reason?: string;
};

/** Read-only tracking for previously accepted attempts. NEVER sends/retries. */
export async function readOccasionNoticeDelivery(
  channel: "email" | "sms",
  providerMessageId: string
): Promise<OccasionNoticeDeliveryResult> {
  const unavailable: OccasionNoticeDeliveryResult = {
    status: "accepted",
    reason: "delivery_tracking_unavailable",
  };
  const unverified: OccasionNoticeDeliveryResult = {
    status: "accepted",
    reason: "tracking_unverified",
  };
  if (!providerId(providerMessageId)) return unverified;
  if (channel === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey?.trim()) return unavailable;
    try {
      const resend = new Resend(apiKey);
      // emails.get has no public options argument in this installed SDK.
      // Its per-instance transport is public and forwards RequestInit unchanged.
      const originalFetch = resend.fetchRequest.bind(resend);
      resend.fetchRequest = (path, options = {}) =>
        originalFetch(path, {
          ...options,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: "error",
        });
      const response = await resend.emails.get(providerMessageId);
      // 401/403 can mean a send-only key, NOT a failed delivery.
      if (response.error) return unavailable;
      if (response.data?.id !== providerMessageId) return unverified;
      // SDK GetEmailResponseSuccess.last_event uses unprefixed event names.
      const event = String(response.data.last_event).replace(/^email\./, "");
      if (["delivered", "opened", "clicked"].includes(event)) {
        return { status: "delivered" };
      }
      if (["bounced", "failed", "canceled", "suppressed"].includes(event)) {
        return { status: "failed", reason: "delivery_failed" };
      }
      if (["sent", "queued", "scheduled", "delivery_delayed"].includes(event)) {
        return { status: "accepted" };
      }
      return unverified;
    } catch {
      return unavailable;
    }
  }
  if (channel !== "sms") return unverified;
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey?.trim() || !apiSecret?.trim()) return unavailable;
  try {
    const date = formatISO(new Date());
    const salt = randomBytes(16).toString("hex");
    const signature = createHmac("sha256", apiSecret)
      .update(date + salt)
      .digest("hex");
    // Verified against solapi@6.0.1 GroupService.getGroup: raw group response.
    const response = await fetch(
      `https://api.solapi.com/messages/v4/groups/${encodeURIComponent(providerMessageId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "error",
      }
    );
    if (!response.ok) return unavailable;
    const group = record(await response.json());
    const count = record(group.count);
    // Refuse wrapped/ambiguous message IDs rather than guessing a lookup path.
    if (group.groupId !== providerMessageId || count.total !== 1) {
      return unverified;
    }
    if (
      count.registeredSuccess === 1 &&
      count.registeredFailed === 0 &&
      count.sentSuccess === 1 &&
      count.sentFailed === 0 &&
      count.sentPending === 0
    ) {
      return { status: "delivered" };
    }
    if (
      (count.registeredFailed === 1 && count.registeredSuccess === 0) ||
      (count.sentFailed === 1 && count.sentSuccess === 0)
    ) {
      return { status: "failed", reason: "delivery_failed" };
    }
    if (
      count.registeredSuccess === 1 &&
      count.registeredFailed === 0 &&
      count.sentSuccess === 0 &&
      count.sentFailed === 0 &&
      count.sentPending === 1
    ) {
      return { status: "accepted" };
    }
    return unverified;
  } catch {
    return unavailable;
  }
}
