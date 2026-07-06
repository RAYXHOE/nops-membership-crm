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
          "#{쿠폰목록}": couponList,
          "#{링크}": "https://membership.nops.kr/mypage",
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
            "#{링크}": "https://membership.nops.kr/mypage",
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
  try {
    const client = getSolapiClient();
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_ANNIVERSARY || TEMPLATE_EXPIRY,
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰명}": `결혼기념일 ${opts.discountPercent}% 할인 쿠폰`,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Anniversary alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "anniversary", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_ANNIVERSARY || TEMPLATE_EXPIRY, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send anniversary alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "anniversary", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_ANNIVERSARY || TEMPLATE_EXPIRY, status: "failed", errorMessage: String(err) });
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
  try {
    const client = getSolapiClient();
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_EXPIRY, // 생일 쿠폰은 만료 알림 템플릿 변수 구조와 유사
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰명}": `생일 ${opts.discountPercent}% 할인 쿠폰`,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Birthday alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "birthday", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_EXPIRY, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send birthday alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "birthday", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_EXPIRY, status: "failed", errorMessage: String(err) });
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
  try {
    const client = getSolapiClient();
    await client.send({
      to: normalizePhone(opts.to),
      from: normalizePhone(SENDER),
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_CORKAGE || TEMPLATE_EXPIRY,
        variables: {
          "#{이름}": opts.name,
          "#{쿠폰코드}": opts.couponCode,
          "#{만료일}": new Date(opts.expiresAt).toLocaleDateString("ko-KR"),
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    } as Parameters<typeof client.send>[0]);
    console.log(`[Kakao] Corkage reissue alimtalk sent to ${opts.to}`);
    await createAlimtalkLog({ type: "corkage", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_CORKAGE || TEMPLATE_EXPIRY, status: "success" });
    return { success: true };
  } catch (err) {
    console.error(`[Kakao] Failed to send corkage reissue alimtalk to ${opts.to}:`, err);
    await createAlimtalkLog({ type: "corkage", recipientPhone: opts.to, recipientName: opts.name, templateId: TEMPLATE_CORKAGE || TEMPLATE_EXPIRY, status: "failed", errorMessage: String(err) });
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
