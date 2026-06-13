import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  getMembersWithBirthdayToday,
  getCouponTemplateByType,
  issueCoupon,
  getCouponsExpiringInDays,
} from "./db";
import { sendBirthdayEmail, sendExpiryReminderEmail } from "./email";

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

    const birthdayMembers = await getMembersWithBirthdayToday();
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
        const result = await sendExpiryReminderEmail({
          to: email,
          name: data.name,
          coupons: data.coupons,
        });
        if (result.success) {
          sent++;
        } else {
          errors.push(`${email}: send failed`);
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
