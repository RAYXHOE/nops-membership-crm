import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  getMembersWithBirthdayToday,
  getCouponTemplateByType,
  issueCoupon,
} from "./db";
import { sendBirthdayEmail } from "./email";

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
