import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  getMembersWithBirthdayThisMonth,
  getMembersWithAnniversaryThisMonth,
  getMembersForCorkageReissue,
  getCouponTemplateByType,
  issueCoupon,
  getCouponsExpiringInDays,
} from "./db";
import { sendBirthdayEmail, sendExpiryReminderEmail, sendAnniversaryEmail } from "./email";
import { sendExpiryAlimtalk, sendAnniversaryAlimtalk, sendBirthdayAlimtalk, sendCorkageReissueAlimtalk } from "./kakao";

function generateCouponCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix + "-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * POST /api/scheduled/birthday-coupons
 * 매일 오전 9시(KST) = UTC 0시 실행
 * 오늘 생일인 활성 회원에게 생일 쿠폰 자동 발급
 */
export async function birthdayCouponHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const birthdayMembers = await getMembersWithBirthdayThisMonth();
    const template = await getCouponTemplateByType("birthday");

    if (!template) {
      return res.status(500).json({ error: "birthday coupon template not found" });
    }

    const now = new Date();
    const year = now.getFullYear();
    let issued = 0;

    for (const member of birthdayMembers) {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + template.validDays);

      const couponCode = generateCouponCode("BDAY");
      await issueCoupon({
        memberId: member.id,
        templateId: template.id,
        code: couponCode,
        type: "birthday",
        discountPercent: template.discountPercent,
        name: template.name,
        description: template.description,
        expiresAt,
        birthdayYear: year,
      });
      // 생일 이메일 발송 (비동기)
      if (member.email) {
        sendBirthdayEmail({
          to: member.email,
          name: member.name ?? "고객",
          couponCode,
          discountPercent: template.discountPercent ?? 15,
          expiresAt,
        }).catch((err) => console.error("[Email] Birthday email failed:", err));
      }
      // 생일 카카오 알림톡 발송 (비동기)
      if (member.phone) {
        sendBirthdayAlimtalk({
          to: member.phone,
          name: member.name ?? "고객",
          couponCode,
          discountPercent: template.discountPercent ?? 15,
          expiresAt,
        }).catch((err) => console.error("[Kakao] Birthday alimtalk failed:", err));
      }
      issued++;
    }

    console.log(`[Birthday Coupons] Issued ${issued} coupons for ${now.toISOString().slice(0, 10)}`);
    return res.json({ ok: true, issued, date: now.toISOString().slice(0, 10) });
  } catch (err) {
    console.error("[Birthday Coupons] Error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /api/scheduled/coupon-expiry-reminder
 * 매일 오전 10시(KST) = UTC 01:00 실행
 * 7일 후 만료되는 활성 쿠폰 보유 회원에게 이메일 알림 발송
 */
export async function couponExpiryReminderHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    // 7일 후 만료 쿠폰 조회
    const expiringItems = await getCouponsExpiringInDays(7);

    if (expiringItems.length === 0) {
      console.log("[Expiry Reminder] No coupons expiring in 7 days");
      return res.json({ ok: true, sent: 0, date: new Date().toISOString().slice(0, 10) });
    }

    // 회원별로 쿠폰 그룹화
    const byMember = new Map<
      string,
      {
        name: string;
        email: string;
        phone: string | null;
        coupons: Array<{ name: string; code: string; discountPercent: number | null; expiresAt: Date }>;
      }
    >();

    for (const item of expiringItems) {
      if (!item.memberEmail) continue;
      const key = item.memberEmail;
      if (!byMember.has(key)) {
        byMember.set(key, {
          name: item.memberName ?? "고객",
          email: item.memberEmail,
          phone: item.memberPhone ?? null,
          coupons: [],
        });
      }
      byMember.get(key)!.coupons.push({
        name: item.coupon.name,
        code: item.coupon.code,
        discountPercent: item.coupon.discountPercent,
        expiresAt: item.coupon.expiresAt,
      });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const [email, data] of Array.from(byMember.entries())) {
      try {
        // 이메일 발송
        const result = await sendExpiryReminderEmail({
          to: email,
          name: data.name,
          coupons: data.coupons,
        });
        if (result.success) sent++;
        else errors.push(`${email}: email failed`);

        // 카카오 알림톡 발송 (전화번호 있는 경우만)
        if (data.phone) {
          sendExpiryAlimtalk({
            to: data.phone,
            name: data.name,
            coupons: data.coupons,
          }).catch((err) => console.error("[Kakao] Expiry alimtalk failed:", err));
        }
      } catch (err) {
        errors.push(`${email}: ${String(err)}`);
      }
    }

    console.log(
      `[Expiry Reminder] Sent ${sent}/${byMember.size} emails for ${new Date().toISOString().slice(0, 10)}`
    );

    return res.json({
      ok: true,
      sent,
      total: byMember.size,
      errors: errors.length > 0 ? errors : undefined,
      date: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("[Expiry Reminder] Error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /api/scheduled/anniversary-coupons
 * 매일 자정(KST) 실행
 * 오늘 결혼기념일인 활성 회원에게 15% 할인 쿠폰 자동 발급 + 이메일/알림톡 발송
 */
export async function anniversaryCouponHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const anniversaryMembers = await getMembersWithAnniversaryThisMonth();
    const template = await getCouponTemplateByType("anniversary");

    if (!template) {
      return res.status(500).json({ error: "anniversary coupon template not found" });
    }

    const now = new Date();
    const year = now.getFullYear();
    let issued = 0;

    for (const member of anniversaryMembers) {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + template.validDays);

      const couponCode = generateCouponCode("ANNI");
      await issueCoupon({
        memberId: member.id,
        templateId: template.id,
        code: couponCode,
        type: "anniversary",
        discountPercent: template.discountPercent,
        name: template.name,
        description: template.description,
        expiresAt,
        birthdayYear: year, // 연도 중복 방지용
      });

      // 이메일 발송 (비동기)
      if (member.email) {
        sendAnniversaryEmail({
          to: member.email,
          name: member.name ?? "고객",
          couponCode,
          discountPercent: template.discountPercent ?? 15,
          expiresAt,
        }).catch((err) => console.error("[Email] Anniversary email failed:", err));
      }

      // 카카오 알림톡 발송 (비동기)
      if (member.phone) {
        sendAnniversaryAlimtalk({
          to: member.phone,
          name: member.name ?? "고객",
          couponCode,
          discountPercent: template.discountPercent ?? 15,
          expiresAt,
        }).catch((err) => console.error("[Kakao] Anniversary alimtalk failed:", err));
      }

      issued++;
    }

    console.log(`[Anniversary Coupons] Issued ${issued} coupons for ${now.toISOString().slice(0, 10)}`);
    return res.json({ ok: true, issued, date: now.toISOString().slice(0, 10) });
  } catch (err) {
    console.error("[Anniversary Coupons] Error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * POST /api/scheduled/corkage-reissue
 * 매일 자정(KST) 실행
 * 콜키지 프리 쿠폰 사용 후 14일 된 회원에게 자동 재발급
 */
export async function corkageReissueHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const targetMembers = await getMembersForCorkageReissue();
    const template = await getCouponTemplateByType("corkage_free");

    if (!template) {
      return res.status(500).json({ error: "corkage_free template not found" });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 45);
    expiresAt.setHours(23, 59, 59, 0);

    let issued = 0;

    for (const member of targetMembers) {
      const couponCode = generateCouponCode("CORK");
      await issueCoupon({
        memberId: member.id,
        templateId: template.id,
        code: couponCode,
        type: "corkage_free",
        name: template.name,
        description: "콜키지 프리 쿠폰 자동 재발급",
        expiresAt,
      });
      // 콜키지 재발급 알림톡 발송 (비동기)
      if (member.phone) {
        sendCorkageReissueAlimtalk({
          to: member.phone,
          name: member.name ?? "고객",
          couponCode,
          expiresAt,
        }).catch((err) => console.error("[Kakao] Corkage reissue alimtalk failed:", err));
      }
      issued++;
    }

    console.log(`[Corkage Reissue] Issued ${issued} coupons on ${now.toISOString().slice(0, 10)}`);
    return res.json({ ok: true, issued, date: now.toISOString().slice(0, 10) });
  } catch (err) {
    console.error("[Corkage Reissue] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

/**
 * POST /api/scheduled/cleanup-expired-otps
 * 매일 자정(KST 00:00) 실행
 * 만료된 OTP 레코드 자동 삭제
 */
export async function cleanupExpiredOtpsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
    const { deleteExpiredOtps } = await import("./db");
    await deleteExpiredOtps();
    console.log(`[OTP Cleanup] Expired OTPs deleted at ${new Date().toISOString()}`);
    return res.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[OTP Cleanup] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

/**
 * POST /api/scheduled/expire-points
 * 매월 1일 자정(KST) 실행
 * 유효기간이 지난 적립금 자동 만료 처리
 */
export async function expirePointsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const { expirePoints } = await import("./db");
    const result = await expirePoints();

    console.log(`[Points Expire] Expired ${result.expired} members' points on ${new Date().toISOString().slice(0, 10)}`);
    return res.json({ ok: true, expired: result.expired, date: new Date().toISOString().slice(0, 10) });
  } catch (err) {
    console.error("[Points Expire] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}

/**
 * POST /api/scheduled/check-missing-coupons
 * 매일 오전 8시(KST) = UTC 23:00 실행
 * 마케팅 동의 회원 중 10% 할인 쿠폰 미발급 회원 감지 → 자동 보정 발급 + 운영자 알림
 */
export async function checkMissingCouponsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const { getDb } = await import("./db");
    const { members, coupons } = await import("../drizzle/schema");
    const { and, eq, not, exists } = await import("drizzle-orm");
    const { notifyOwner } = await import("./_core/notification");
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB not available" });

    // 마케팅 동의 + discount_percent 쿠폰 미발급 회원 조회
    const missingMembers = await db
      .select({ id: members.id, name: members.name, email: members.email })
      .from(members)
      .where(
        and(
          eq(members.marketingConsent, true),
          eq(members.status, "active"),
          not(
            exists(
              db.select({ id: coupons.id })
                .from(coupons)
                .where(and(eq(coupons.memberId, members.id), eq(coupons.type, "discount_percent")))
            )
          )
        )
      );

    if (missingMembers.length === 0) {
      console.log("[MissingCoupons] 미발급 회원 없음");
      return res.json({ ok: true, issued: 0 });
    }

    // 자동 보정 발급
    const template = await getCouponTemplateByType("discount_percent");
    if (!template) {
      await notifyOwner({
        title: "[NOPS CRM] 쿠폰 템플릿 오류",
        content: `discount_percent 쿠폰 템플릿을 찾을 수 없습니다. 관리자 확인이 필요합니다.`,
      });
      return res.status(500).json({ error: "template not found" });
    }

    const now = new Date();
    let issued = 0;
    const issuedNames: string[] = [];

    for (const member of missingMembers) {
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + template.validDays);
      const code = `NOPS-${Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("")}`;
      await issueCoupon({
        memberId: member.id,
        templateId: template.id,
        code,
        type: "discount_percent",
        name: template.name,
        discountPercent: template.discountPercent,
        description: "자동 보정 발급 · " + (template.description ?? ""),
        status: "active",
        expiresAt,
      });
      issuedNames.push(`${member.name}(${member.email})`);
      issued++;
    }

    // 운영자 알림 발송
    await notifyOwner({
      title: `[NOPS CRM] 쿠폰 미발급 ${issued}건 자동 보정 완료`,
      content: `마케팅 동의 회원 중 10% 할인 쿠폰 미발급 ${issued}명을 감지하여 자동 발급했습니다.\n\n대상: ${issuedNames.join(", ")}`,
    });

    console.log(`[MissingCoupons] 자동 보정 발급: ${issued}명 — ${issuedNames.join(", ")}`);
    return res.json({ ok: true, issued, members: issuedNames });
  } catch (err) {
    console.error("[MissingCoupons] Error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
