import { SolapiMessageService } from "solapi";
import { createAlimtalkLog } from "./db";

// ─── 솔라피 클라이언트 초기화 ─────────────────────────────────────────────────
function getSolapiClient() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다.");
  }
  return new SolapiMessageService(apiKey, apiSecret);
}

const PFID = process.env.SOLAPI_KAKAO_PFID ?? "";
const SENDER = process.env.SOLAPI_SENDER_PHONE ?? "";
const TEMPLATE_WELCOME = process.env.SOLAPI_TEMPLATE_WELCOME ?? "";
const TEMPLATE_EXPIRY = process.env.SOLAPI_TEMPLATE_EXPIRY ?? "";
const TEMPLATE_ANNIVERSARY = process.env.SOLAPI_TEMPLATE_ANNIVERSARY ?? "";
const TEMPLATE_CORKAGE = process.env.SOLAPI_TEMPLATE_CORKAGE ?? "";
const TEMPLATE_POINTS = process.env.SOLAPI_TEMPLATE_POINTS ?? "";
const TEMPLATE_BIRTHDAY = process.env.SOLAPI_TEMPLATE_BIRTHDAY ?? "";
const TEMPLATE_POINTS_EXPIRY = process.env.SOLAPI_TEMPLATE_POINTS_EXPIRY ?? "";

function requireTemplateId(templateId: string, label: string): string {
  if (!templateId) {
    throw new Error(`SOLAPI_TEMPLATE_${label}이 설정되지 않았습니다. 승인된 전용 알림톡 템플릿 ID를 등록해 주세요.`);
  }
  return templateId;
}

// 전화번호 정규화 (하이픈 제거, 국제번호 형식 변환)
function normalizePhone(phone: string): string {
  let p = phone.replace(/-/g, "").replace(/\s/g, "");
  // +82 국제번호 형식 변환: +821012345678 → 01012345678
  if (p.startsWith("+82")) {
    p = "0" + p.slice(3);
  }
  // 선행 + 제거 (기타 국제번호)
  if (p.startsWith("+")) {
    p = p.slice(1);
  }
  return p;
}

// ─── 가입 환영 알림톡 ─────────────────────────────────────────────────────────
export async function sendWelcomeAlimtalk(opts: {
  to: string;
  name: string;
  coupons: Array<{ name: string; code: string }>;
}) {
  try {
    const client = getSolapiClient();
    const couponList = opts.coupons
      .map((c) => `• ${c.name}: ${c.code}`)
      .join("\n");

    const result = await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_WELCOME,
        variables: {
          "#{이름}": opts.name,
        },
      },
    } as Parameters<typeof client.send>[0]);

    console.log(`[Kakao] Welcome alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "welcome", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_WELCOME, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send welcome alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "welcome", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_WELCOME, status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}

// ─── 쿠폰 만료 D-7 알림톡 ────────────────────────────────────────────────────
export async function sendExpiryAlimtalk(opts: {
  to: string;
  name: string;
  coupons: Array<{ name: string; code: string; expiresAt: Date }>;
}) {
  try {
    const client = getSolapiClient();
    let sent = 0;

    for (const coupon of opts.coupons) {
      await client.send({
        to: normalizePhone(opts.to),
        from: normalizePhone(SENDER),
        kakaoOptions: {
          pfId: PFID,
          templateId: TEMPLATE_EXPIRY,
          variables: {
            "#{이름}": opts.name,
            "#{쿠폰명}": coupon.name,
            "#{만료일}": new Date(coupon.expiresAt).toLocaleDateString("ko-KR"),
          },
        },
      } as Parameters<typeof client.send>[0]);
      sent++;
    }

    console.log(`[Kakao] Expiry alimtalk sent to ${opts.to}: ${sent}건`);
    await createAlimtalkLog({ type: "expiry", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_EXPIRY, status: "success", variables: JSON.stringify({ count: sent }) });
    return { success: true, sent };
  } catch (err) {
    console.error(`[Kakao] Failed to send expiry alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "expiry", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_EXPIRY, status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}

// ─── API 키 유효성 검증 ───────────────────────────────────────────────────────
export async function validateSolapiApiKey(): Promise<boolean> {
  try {
    const client = getSolapiClient();
    await client.getBalance();
    return true;
  } catch {
    return false;
  }
}

// ─── 결혼기념일 알림톡 ────────────────────────────────────────────────────────
export async function sendAnniversaryAlimtalk(opts: {
  to: string;
  name: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}) {
  console.info(`[Kakao] Anniversary alimtalk skipped for ${opts.to}: 브랜드 템플릿 발송 경로 준비 전`);
  return { success: true, skipped: true };

  try {
    const client = getSolapiClient();
    const templateId = requireTemplateId(TEMPLATE_ANNIVERSARY, "ANNIVERSARY");
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId,
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰명}": `결혼기념일 ${opts.discountPercent}% 할인 쿠폰`,
          "#{할인율}": String(opts.discountPercent),
          "#{쿠폰코드}": opts.couponCode,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Anniversary alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "anniversary", recipientPhone: opts.to, recipientName: opts.name, templateId, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send anniversary alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "anniversary", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_ANNIVERSARY || "", status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}

// ─── 생일 알림톡 ─────────────────────────────────────────────────────────────
export async function sendBirthdayAlimtalk(opts: {
  to: string;
  name: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}) {
  console.info(`[Kakao] Birthday alimtalk skipped for ${opts.to}: 생일 알림톡 보류`);
  return { success: true, skipped: true };

  try {
    const client = getSolapiClient();
    const templateId = requireTemplateId(TEMPLATE_BIRTHDAY, "BIRTHDAY");
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId,
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰명}": `생일 ${opts.discountPercent}% 할인 쿠폰`,
          "#{할인율}": String(opts.discountPercent),
          "#{쿠폰코드}": opts.couponCode,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Birthday alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "birthday", recipientPhone: opts.to, recipientName: opts.name, templateId, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send birthday alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "birthday", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_BIRTHDAY || "", status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}

// ─── 콜키지 프리 쿠폰 재발급 알림톡 ──────────────────────────────────────────
export async function sendCorkageReissueAlimtalk(opts: {
  to: string;
  name: string;
  couponCode: string;
  expiresAt: Date;
}) {
  console.info(`[Kakao] Corkage reissue alimtalk skipped for ${opts.to}: 브랜드 템플릿 발송 경로 준비 전`);
  return { success: true, skipped: true };

  try {
    const client = getSolapiClient();
    const templateId = requireTemplateId(TEMPLATE_CORKAGE, "CORKAGE");
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId,
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰명}": "콜키지 프리 쿠폰",
          "#{쿠폰코드}": opts.couponCode,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Corkage reissue alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "corkage", recipientPhone: opts.to, recipientName: opts.name, templateId, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send corkage reissue alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "corkage", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_CORKAGE || "", status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}

// ─── 적립금 만료 D-30 알림톡 ─────────────────────────────────────────────────
export async function sendPointsExpiryAlimtalk(opts: {
  to: string;
  name: string;
  expiringAmount: number;  // 만료 예정 금액
  balance: number;         // 현재 잔액
  expiresAt: Date;         // 만료일
}) {
  console.info(`[Kakao] Points expiry alimtalk skipped for ${opts.to}: 포인트 알림 보류`);
  return { success: true, skipped: true };

  try {
    const client = getSolapiClient();
    const templateId = requireTemplateId(TEMPLATE_POINTS_EXPIRY, "POINTS_EXPIRY");
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId,
        variables: {
          "#{이름}": opts.name,
          "#{만료예정적립금}": opts.expiringAmount.toLocaleString("ko-KR"),
          "#{잔액}": opts.balance.toLocaleString("ko-KR"),
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Points expiry D-30 alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({
      type: "points_expiry",
      recipientPhone: opts.to,
      recipientName: opts.name,
      templateId,
      status: "success",
      variables: JSON.stringify({ expiringAmount: opts.expiringAmount, expiresAt: opts.expiresAt }),
    });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send points expiry alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({
      type: "points_expiry",
      recipientPhone: opts.to,
      recipientName: opts.name,
      templateId: TEMPLATE_POINTS_EXPIRY || "",
      status: "failed",
      errorMessage: String(err),
    });
    return { success: false, error: String(err) };
  }
}

// ─── 적립금 적립 알림톡 ────────────────────────────────────────────────────────
export async function sendPointsAlimtalk(opts: {
  to: string;
  name: string;
  earnedAmount: number;
  balance: number;
  expiresAt: Date;
}) {
  console.info(`[Kakao] Points alimtalk skipped for ${opts.to}: 포인트 알림 보류`);
  return { success: true, skipped: true };

  try {
    const client = getSolapiClient();
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_POINTS,
        variables: {
          "#{이름}": opts.name,
          "#{적립금액}": opts.earnedAmount.toLocaleString("ko-KR"),
          "#{잔액}": opts.balance.toLocaleString("ko-KR"),
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Points alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "points", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_POINTS, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send points alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "points", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_POINTS, status: "failed", errorMessage: String(err) });
    return { success: false, error: String(err) };
  }
}
