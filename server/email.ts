import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 발신자 이메일 — 커스텀 도메인 인증 전까지 Resend 기본 도메인 사용
// 실제 운영 시 noreply@nops-steakhouse.com 등으로 변경
const FROM_EMAIL = process.env.EMAIL_FROM ?? "NOPS Steak House <onboarding@resend.dev>";

// ─── HTML 이메일 템플릿 ────────────────────────────────────────────────────────
function buildWelcomeEmailHtml(opts: {
  name: string;
  coupons: Array<{ name: string; code: string; discountPercent: number | null; expiresAt: Date }>;
}) {
  const couponRows = opts.coupons
    .map(
      (c) => `
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3;">
          <strong style="color:#1a1a1a; font-size:14px;">${c.name}</strong>
          ${c.discountPercent ? `<span style="color:#8b6914; font-weight:700; margin-left:8px;">${c.discountPercent}% 할인</span>` : ""}
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3; text-align:right;">
          <code style="background:#f7f3ee; padding:4px 10px; border-radius:6px; font-family:monospace; font-size:13px; font-weight:700; color:#1a1a1a; letter-spacing:0.1em;">${c.code}</code>
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3; text-align:right; color:#888; font-size:12px;">
          ${new Date(c.expiresAt).toLocaleDateString("ko-KR")}까지
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NOPS Steak House 멤버십 가입 완료</title>
</head>
<body style="margin:0; padding:0; background:#f7f3ee; font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif; color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ee; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a; padding:32px 40px; text-align:center;">
              <p style="margin:0 0 4px; color:#c9a84c; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; font-weight:600;">Exclusive Membership</p>
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:0.05em;">NOPS Steak House</h1>
            </td>
          </tr>

          <!-- Welcome message -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px; color:#8b6914; font-size:12px; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">Welcome</p>
              <h2 style="margin:0 0 16px; font-size:22px; font-weight:800; color:#1a1a1a;">${opts.name}님, 환영합니다!</h2>
              <p style="margin:0; font-size:15px; color:#555; line-height:1.7;">
                NOPS Steak House 멤버십에 가입해 주셔서 감사합니다.<br />
                가입 즉시 아래 쿠폰이 발급되었습니다. 방문 시 직원에게 쿠폰 코드를 제시해 주세요.
              </p>
            </td>
          </tr>

          <!-- Coupons -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#faf7f2; border:1px solid #e8dfd0; border-radius:12px; overflow:hidden;">
                <div style="padding:16px 16px 12px; border-bottom:1px solid #e8dfd0;">
                  <p style="margin:0; font-size:12px; font-weight:700; color:#8b6914; letter-spacing:0.1em; text-transform:uppercase;">발급된 쿠폰</p>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${couponRows}
                </table>
              </div>
            </td>
          </tr>

          <!-- Birthday notice -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#f0f7ff; border:1px solid #dbeafe; border-radius:12px; padding:16px 20px;">
                <p style="margin:0 0 4px; font-size:13px; font-weight:700; color:#1d4ed8;">🎂 생일 특별 혜택</p>
                <p style="margin:0; font-size:13px; color:#374151; line-height:1.6;">
                  매년 생일에 <strong>15% 할인 쿠폰</strong>이 자동으로 발급됩니다.<br />
                  쿠폰은 마이페이지에서 언제든지 확인하실 수 있습니다.
                </p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 40px; text-align:center;">
              <a href="https://membership.nops.kr/mypage"
                 style="display:inline-block; background:#1a1a1a; color:#ffffff; text-decoration:none; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:700; letter-spacing:0.05em;">
                내 쿠폰 확인하기 →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f7f3ee; padding:24px 40px; text-align:center; border-top:1px solid #e8dfd0;">
              <p style="margin:0 0 4px; font-size:12px; color:#999;">NOPS Steak House</p>
              <p style="margin:0; font-size:11px; color:#bbb;">본 메일은 발신 전용입니다. 문의는 매장으로 직접 연락해 주세요.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildBirthdayEmailHtml(opts: {
  name: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>생일 축하 쿠폰 - NOPS Steak House</title>
</head>
<body style="margin:0; padding:0; background:#f7f3ee; font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif; color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ee; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1a1a1a; padding:32px 40px; text-align:center;">
              <p style="margin:0 0 4px; color:#c9a84c; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; font-weight:600;">Happy Birthday</p>
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:0.05em;">NOPS Steak House</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px; text-align:center;">
              <p style="margin:0 0 8px; font-size:32px;">🎂</p>
              <h2 style="margin:0 0 12px; font-size:22px; font-weight:800;">${opts.name}님, 생일을 축하드립니다!</h2>
              <p style="margin:0 0 32px; font-size:15px; color:#555; line-height:1.7;">
                특별한 날을 더욱 특별하게 만들어 드리고자<br />
                생일 기념 ${opts.discountPercent}% 할인 쿠폰을 드립니다.
              </p>
              <div style="background:#faf7f2; border:2px solid #c9a84c; border-radius:12px; padding:24px; display:inline-block; min-width:240px;">
                <p style="margin:0 0 8px; font-size:11px; color:#8b6914; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">쿠폰 코드</p>
                <code style="font-size:22px; font-weight:800; color:#1a1a1a; letter-spacing:0.15em; font-family:monospace;">${opts.couponCode}</code>
                <p style="margin:8px 0 0; font-size:12px; color:#888;">${new Date(opts.expiresAt).toLocaleDateString("ko-KR")}까지</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f7f3ee; padding:24px 40px; text-align:center; border-top:1px solid #e8dfd0;">
              <p style="margin:0; font-size:11px; color:#bbb;">NOPS Steak House · 본 메일은 발신 전용입니다.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 이메일 발송 함수 ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  coupons: Array<{ name: string; code: string; discountPercent: number | null; expiresAt: Date }>;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `[NOPS Steak House] ${opts.name}님, 멤버십 가입을 환영합니다! 🎉`,
      html: buildWelcomeEmailHtml({ name: opts.name, coupons: opts.coupons }),
    });
    console.log(`[Email] Welcome email sent to ${opts.to}:`, result.data?.id ?? result.error);
    return { success: !result.error, id: result.data?.id };
  } catch (err) {
    console.error(`[Email] Failed to send welcome email to ${opts.to}:`, err);
    return { success: false };
  }
}

export async function sendBirthdayEmail(opts: {
  to: string;
  name: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `[NOPS Steak House] ${opts.name}님, 생일을 진심으로 축하드립니다! 🎂`,
      html: buildBirthdayEmailHtml(opts),
    });
    console.log(`[Email] Birthday email sent to ${opts.to}:`, result.data?.id ?? result.error);
    return { success: !result.error, id: result.data?.id };
  } catch (err) {
    console.error(`[Email] Failed to send birthday email to ${opts.to}:`, err);
    return { success: false };
  }
}

// ─── 쿠폰 만료 임박 알림 이메일 ─────────────────────────────────────────────
function buildExpiryReminderHtml(opts: {
  name: string;
  coupons: Array<{ name: string; code: string; discountPercent: number | null; expiresAt: Date }>;
}) {
  const couponRows = opts.coupons
    .map(
      (c) => `
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3;">
          <strong style="color:#1a1a1a; font-size:14px;">${c.name}</strong>
          ${c.discountPercent ? `<span style="color:#8b6914; font-weight:700; margin-left:8px;">${c.discountPercent}% 할인</span>` : ""}
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3; text-align:right;">
          <code style="background:#f7f3ee; padding:4px 10px; border-radius:6px; font-family:monospace; font-size:13px; font-weight:700; color:#1a1a1a; letter-spacing:0.1em;">${c.code}</code>
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0ebe3; text-align:right; color:#c0392b; font-size:12px; font-weight:700;">
          ${new Date(c.expiresAt).toLocaleDateString("ko-KR")} 만료
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>쿠폰 만료 안내 - NOPS Steak House</title>
</head>
<body style="margin:0; padding:0; background:#f7f3ee; font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif; color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ee; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1a1a1a; padding:32px 40px; text-align:center;">
              <p style="margin:0 0 4px; color:#c9a84c; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; font-weight:600;">Coupon Expiry Notice</p>
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:0.05em;">NOPS Steak House</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 24px;">
              <div style="background:#fff3cd; border:1px solid #ffc107; border-radius:10px; padding:14px 18px; margin-bottom:24px;">
                <p style="margin:0; font-size:14px; font-weight:700; color:#856404;">⏰ 쿠폰이 7일 후 만료됩니다</p>
              </div>
              <h2 style="margin:0 0 12px; font-size:20px; font-weight:800; color:#1a1a1a;">${opts.name}님, 쿠폰을 잊지 마세요!</h2>
              <p style="margin:0; font-size:15px; color:#555; line-height:1.7;">
                아래 쿠폰이 <strong>7일 이내에 만료</strong>됩니다.<br />
                방문 시 직원에게 쿠폰 코드를 제시해 주세요.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#faf7f2; border:1px solid #e8dfd0; border-radius:12px; overflow:hidden;">
                <div style="padding:14px 16px 10px; border-bottom:1px solid #e8dfd0;">
                  <p style="margin:0; font-size:12px; font-weight:700; color:#8b6914; letter-spacing:0.1em; text-transform:uppercase;">만료 임박 쿠폰</p>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0">${couponRows}</table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px; text-align:center;">
              <a href="https://membership.nops.kr/mypage"
                 style="display:inline-block; background:#1a1a1a; color:#ffffff; text-decoration:none; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:700; letter-spacing:0.05em;">
                내 쿠폰 확인하기 →
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#f7f3ee; padding:24px 40px; text-align:center; border-top:1px solid #e8dfd0;">
              <p style="margin:0; font-size:11px; color:#bbb;">NOPS Steak House · 본 메일은 발신 전용입니다.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendExpiryReminderEmail(opts: {
  to: string;
  name: string;
  coupons: Array<{ name: string; code: string; discountPercent: number | null; expiresAt: Date }>;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `[NOPS Steak House] ${opts.name}님, 쿠폰이 7일 후 만료됩니다 ⏰`,
      html: buildExpiryReminderHtml({ name: opts.name, coupons: opts.coupons }),
    });
    console.log(`[Email] Expiry reminder sent to ${opts.to}:`, result.data?.id ?? result.error);
    return { success: !result.error, id: result.data?.id };
  } catch (err) {
    console.error(`[Email] Failed to send expiry reminder to ${opts.to}:`, err);
    return { success: false };
  }
}

// ─── 결혼기념일 쿠폰 이메일 ─────────────────────────────────────────────────────
export async function sendAnniversaryEmail(opts: {
  to: string;
  name: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}) {
  try {
    const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>결혼기념일 쿠폰 - NOPS Steak House</title></head>
<body style="margin:0; padding:0; background:#f7f3ee; font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif; color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ee; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#1a1a1a; padding:32px 40px; text-align:center;">
          <p style="margin:0 0 4px; color:#c9a84c; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; font-weight:600;">Happy Anniversary</p>
          <h1 style="margin:0; color:#fff; font-size:24px; font-weight:800;">NOPS Steak House</h1>
        </td></tr>
        <tr><td style="padding:40px; text-align:center;">
          <p style="margin:0 0 8px; font-size:32px;">💍</p>
          <h2 style="margin:0 0 12px; font-size:22px; font-weight:800;">${opts.name}님, 결혼기념일을 축하드립니다!</h2>
          <p style="margin:0 0 32px; font-size:15px; color:#555; line-height:1.7;">특별한 날을 더욱 특별하게 만들어 드리고자<br />${opts.discountPercent}% 할인 쿠폰을 드립니다.</p>
          <div style="background:#faf7f2; border:2px solid #c9a84c; border-radius:12px; padding:24px; display:inline-block; min-width:240px;">
            <p style="margin:0 0 8px; font-size:11px; color:#8b6914; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">쿠폰 코드</p>
            <code style="font-size:22px; font-weight:800; color:#1a1a1a; letter-spacing:0.15em; font-family:monospace;">${opts.couponCode}</code>
            <p style="margin:8px 0 0; font-size:12px; color:#888;">${new Date(opts.expiresAt).toLocaleDateString("ko-KR")}까지</p>
          </div>
        </td></tr>
        <tr><td style="background:#f7f3ee; padding:24px 40px; text-align:center; border-top:1px solid #e8dfd0;">
          <p style="margin:0; font-size:11px; color:#bbb;">NOPS Steak House · 본 메일은 발신 전용입니다.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `[NOPS Steak House] ${opts.name}님, 결혼기념일을 진심으로 축하드립니다! 💍`,
      html,
    });
    console.log(`[Email] Anniversary email sent to ${opts.to}:`, result.data?.id ?? result.error);
    return { success: !result.error, id: result.data?.id };
  } catch (err) {
    console.error(`[Email] Failed to send anniversary email to ${opts.to}:`, err);
    return { success: false };
  }
}

// ─── OTP 인증 이메일 ───────────────────────────────────────────────────────────────────
export async function sendOtpEmail({
  to,
  name,
  code,
}: {
  to: string;
  name: string;
  code: string;
}) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[NOPS Steak House] 인증코드: ${code}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
          <p style="color: #c9a84c; font-size: 11px; letter-spacing: 0.2em; margin: 0 0 8px;">EXCLUSIVE MEMBERSHIP</p>
          <h1 style="color: #ffffff; font-size: 22px; margin: 0;">NOPS Steak House</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e5e5; border-top: none;">
          <h2 style="font-size: 18px; margin: 0 0 8px;">${name}님, 인증코드를 확인해주세요</h2>
          <p style="color: #666; font-size: 14px; margin: 0 0 24px;">아래 6자리 코드를 입력하면 쿠폰을 확인할 수 있습니다.</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="font-size: 36px; font-weight: bold; font-family: monospace; letter-spacing: 0.3em; color: #1a1a1a; margin: 0;">${code}</p>
            <p style="font-size: 12px; color: #999; margin: 8px 0 0;">10분 이내에 입력해주세요</p>
          </div>
          <p style="text-align: center; color: #999; font-size: 11px; margin: 0;">
            본인이 요청하지 않은 경우 이 메일을 무시하세요.<br>
            NOPS Steak House
          </p>
        </div>
      </div>
    `,
  });
}

// ─── 고객 문의 답변 이메일 ──────────────────────────────────────────────────────
export async function sendInquiryReplyEmail(opts: {
  to: string;
  name: string;
  subject: string;
  originalContent: string;
  adminReply: string;
}) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `[NOPS Steak House] 문의 답변: ${opts.subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: #1a1a1a; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <p style="color: #c9a84c; font-size: 11px; letter-spacing: 0.2em; margin: 0 0 8px;">EXCLUSIVE MEMBERSHIP</p>
            <h1 style="color: #ffffff; font-size: 22px; margin: 0;">NOPS Steak House</h1>
          </div>
          <div style="background: #ffffff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e5e5; border-top: none;">
            <p style="color: #c9a84c; font-size: 12px; letter-spacing: 0.15em; margin: 0 0 8px;">INQUIRY REPLY</p>
            <h2 style="font-size: 18px; margin: 0 0 8px;">${opts.name}님, 문의 답변이 도착했습니다</h2>
            <p style="color: #666; font-size: 14px; margin: 0 0 24px;">문의하신 내용에 대한 답변을 안내드립니다.</p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="font-size: 11px; color: #999; margin: 0 0 6px;">문의 내용</p>
              <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.6; white-space: pre-wrap;">${opts.originalContent}</p>
            </div>
            <div style="background: #fff8f0; border: 1px solid #f0d9b5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="font-size: 11px; color: #c9a84c; margin: 0 0 6px; font-weight: bold;">관리자 답변</p>
              <p style="font-size: 14px; color: #333; margin: 0; line-height: 1.7; white-space: pre-wrap;">${opts.adminReply}</p>
            </div>
            <a href="https://membership.nops.kr/mypage" style="display: block; background: #1a1a1a; color: #ffffff; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-size: 14px;">
              마이페이지 바로가기 →
            </a>
            <p style="text-align: center; color: #999; font-size: 11px; margin-top: 24px;">
              NOPS Steak House<br>
              본 메일은 발신 전용입니다. 추가 문의는 마이페이지를 이용해 주세요.
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Email] Inquiry reply sent to ${opts.to}`);
    return { success: true };
  } catch (err) {
    console.error(`[Email] Failed to send inquiry reply to ${opts.to}:`, err);
    return { success: false };
  }
}

// API 키 유효성 검증용
export async function validateResendApiKey(): Promise<boolean> {
  try {
    const result = await resend.domains.list();
    return !result.error;
  } catch {
    return false;
  }
}

// ─── DB 백업 알림 이메일 ──────────────────────────────────────────────────────
export async function sendBackupNotificationEmail(opts: {
  success: boolean;
  backupKey?: string;
  rowCounts?: Record<string, number>;
  dumpSizeKB?: number;
  encryptedSizeKB?: number;
  error?: string;
  timestamp: string;
}) {
  const ownerEmail = process.env.OWNER_EMAIL || "spvltm@gmail.com";
  const statusIcon = opts.success ? "✅" : "❌";
  const statusText = opts.success ? "성공" : "실패";

  const rowCountsHtml = opts.rowCounts
    ? Object.entries(opts.rowCounts)
        .map(([t, c]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;">${t}</td><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${c}</td></tr>`)
        .join("")
    : "";

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ownerEmail,
      subject: `[NOPS CRM] DB 백업 ${statusText} ${statusIcon} — ${opts.timestamp.slice(0, 10)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #f7f7f7; padding: 24px;">
          <div style="background: ${opts.success ? '#1a1a1a' : '#c0392b'}; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 16px;">NOPS CRM — DB 백업 ${statusText} ${statusIcon}</h2>
            <p style="color: #ccc; margin: 4px 0 0; font-size: 12px;">${opts.timestamp}</p>
          </div>
          <div style="background: #fff; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
            ${opts.success ? `
              <p style="color: #27ae60; font-weight: bold; margin: 0 0 16px;">백업이 정상적으로 완료되었습니다.</p>
              <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:16px;">
                <tr style="background:#f5f5f5;"><th style="padding:6px 12px;text-align:left;">항목</th><th style="padding:6px 12px;text-align:right;">값</th></tr>
                <tr><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;">백업 파일</td><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:11px;">${opts.backupKey || '-'}</td></tr>
                <tr><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;">덤프 크기</td><td style="padding:4px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${opts.dumpSizeKB || 0} KB</td></tr>
                <tr><td style="padding:4px 12px;">암호화 후 크기</td><td style="padding:4px 12px;text-align:right;">${opts.encryptedSizeKB || 0} KB</td></tr>
              </table>
              ${rowCountsHtml ? `
              <p style="font-size:13px; font-weight:bold; margin:0 0 8px;">테이블별 행 수:</p>
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <tr style="background:#f5f5f5;"><th style="padding:4px 12px;text-align:left;">테이블</th><th style="padding:4px 12px;text-align:right;">행 수</th></tr>
                ${rowCountsHtml}
              </table>` : ''}
            ` : `
              <p style="color: #e74c3c; font-weight: bold; margin: 0 0 16px;">⚠️ 백업 중 오류가 발생했습니다. 즉시 확인이 필요합니다.</p>
              <div style="background: #fff5f5; border: 1px solid #fcc; border-radius: 6px; padding: 12px; font-size: 13px; color: #c0392b;">
                ${opts.error || '알 수 없는 오류'}
              </div>
            `}
          </div>
        </div>
      `,
    });
    console.log(`[Email] 백업 알림 이메일 발송: ${ownerEmail}`);
  } catch (err) {
    console.error("[Email] 백업 알림 이메일 발송 실패:", err);
  }
}

// ─── 적립 누락 알림 이메일 ────────────────────────────────────────────────────

export async function sendPointsMissingAlertEmail(items: Array<{
  memberName: string | null;
  memberEmail: string | null;
  finalAmount: number;
  expectedPoints: number;
  purchasedAt: Date;
  purchaseId: number;
}>) {
  const ownerEmail = process.env.OWNER_EMAIL || "spvltm@gmail.com";

  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #f0ebe3; font-size:13px; color:#1a1a1a;">
        ${item.memberName ?? "(이름 없음)"}
      </td>
      <td style="padding:10px 14px; border-bottom:1px solid #f0ebe3; font-size:13px; color:#666;">
        ${item.memberEmail ?? ""}
      </td>
      <td style="padding:10px 14px; border-bottom:1px solid #f0ebe3; font-size:13px; text-align:right; color:#1a1a1a; font-weight:700;">
        ${item.finalAmount.toLocaleString()}원
      </td>
      <td style="padding:10px 14px; border-bottom:1px solid #f0ebe3; font-size:13px; text-align:right; color:#c9a84c; font-weight:700;">
        ${item.expectedPoints.toLocaleString()}원
      </td>
      <td style="padding:10px 14px; border-bottom:1px solid #f0ebe3; font-size:12px; color:#888;">
        ${new Date(item.purchasedAt).toLocaleString("ko-KR")}
      </td>
    </tr>
  `).join("");

  await resend.emails.send({
    from: FROM_EMAIL,
    to: ownerEmail,
    subject: `[NOPS CRM] ⚠️ 적립금 누락 ${items.length}건 감지`,
    html: `
      <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <p style="color: #c9a84c; font-size: 11px; letter-spacing: 0.2em; margin: 0 0 6px;">NOPS CRM ALERT</p>
          <h1 style="color: #ffffff; font-size: 18px; margin: 0;">적립금 누락 감지</h1>
        </div>
        <div style="background: #fff8f0; border: 1px solid #f0ebe3; border-top: none; padding: 24px 32px; border-radius: 0 0 12px 12px;">
          <p style="color: #c0392b; font-size: 14px; font-weight: 700; margin: 0 0 16px;">
            ⚠️ 구매 기록은 있으나 적립금이 발급되지 않은 ${items.length}건이 감지됐습니다.
          </p>
          <p style="color: #666; font-size: 13px; margin: 0 0 20px;">
            아래 목록을 확인하고 관리자 대시보드에서 수동 보정해 주세요.
          </p>
          <table style="width:100%; border-collapse:collapse; background:#fff; border-radius:8px; overflow:hidden; border:1px solid #f0ebe3;">
            <thead>
              <tr style="background:#f7f3ee;">
                <th style="padding:10px 14px; text-align:left; font-size:12px; color:#888; font-weight:600;">회원명</th>
                <th style="padding:10px 14px; text-align:left; font-size:12px; color:#888; font-weight:600;">이메일</th>
                <th style="padding:10px 14px; text-align:right; font-size:12px; color:#888; font-weight:600;">구매금액</th>
                <th style="padding:10px 14px; text-align:right; font-size:12px; color:#888; font-weight:600;">예상 적립금</th>
                <th style="padding:10px 14px; text-align:left; font-size:12px; color:#888; font-weight:600;">구매 시각</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <div style="margin-top:20px; padding:14px 18px; background:#fff3cd; border-radius:8px; border:1px solid #ffc107;">
            <p style="margin:0; font-size:13px; color:#856404;">
              <strong>보정 방법:</strong> 관리자 대시보드 → 대시보드 상단 적립 모니터링 위젯 → 목록 보기 → 적립 보정 버튼 클릭
            </p>
          </div>
          <p style="text-align:center; color:#999; font-size:11px; margin-top:20px;">
            이 알림은 매 2시간마다 자동 발송됩니다 (누락 감지 시에만).<br>
            NOPS Steak House CRM
          </p>
        </div>
      </div>
    `,
  });
}

// ─── 적립 실패 즉시 알림 이메일 ───────────────────────────────────────────────

export async function sendPointsFailureAlertEmail(opts: {
  memberId: number;
  memberName: string | null;
  purchaseId?: number;
  purchaseAmount: number;
  error: string;
}) {
  const ownerEmail = process.env.OWNER_EMAIL || "spvltm@gmail.com";

  await resend.emails.send({
    from: FROM_EMAIL,
    to: ownerEmail,
    subject: `[NOPS CRM] 🚨 적립금 실패 즉시 알림 - ${opts.memberName ?? "회원"} (${opts.purchaseAmount.toLocaleString()}원)`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #c0392b; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <p style="color: #fff; font-size: 11px; letter-spacing: 0.2em; margin: 0 0 6px;">NOPS CRM — 즉시 알림</p>
          <h1 style="color: #ffffff; font-size: 18px; margin: 0;">적립금 실패</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e5e5; border-top: none; padding: 24px 32px; border-radius: 0 0 12px 12px;">
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888; width:120px;">회원 ID</td>
              <td style="padding:8px 0; font-size:13px; color:#1a1a1a; font-weight:700;">${opts.memberId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888;">회원명</td>
              <td style="padding:8px 0; font-size:13px; color:#1a1a1a; font-weight:700;">${opts.memberName ?? "(이름 없음)"}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888;">구매 ID</td>
              <td style="padding:8px 0; font-size:13px; color:#1a1a1a;">${opts.purchaseId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888;">구매금액</td>
              <td style="padding:8px 0; font-size:13px; color:#1a1a1a; font-weight:700;">${opts.purchaseAmount.toLocaleString()}원</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888;">오류 내용</td>
              <td style="padding:8px 0; font-size:12px; color:#c0392b; font-family:monospace;">${opts.error}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; font-size:13px; color:#888;">발생 시각</td>
              <td style="padding:8px 0; font-size:13px; color:#1a1a1a;">${new Date().toLocaleString("ko-KR")}</td>
            </tr>
          </table>
          <div style="margin-top:20px; padding:14px 18px; background:#fff3cd; border-radius:8px; border:1px solid #ffc107;">
            <p style="margin:0; font-size:13px; color:#856404;">
              <strong>보정 방법:</strong> 관리자 대시보드 → 적립 모니터링 위젯 → 목록 보기 → 적립 보정 버튼
            </p>
          </div>
        </div>
      </div>
    `,
  });
}
