import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createConsentLog,
  createMember,
  createPurchase,
  createVisit,
  deletePurchase,
  deleteVisit,
  getCouponByCode,
  getCouponsByMemberId,
  getCouponStats,
  getCouponTemplateByType,
  getConsentLogsByMemberId,
  getMemberByEmail,
  getMemberById,
  getMemberStats,
  getMembersWithBirthdayToday,
  getPurchaseStats,
  getPurchasesByMemberId,
  getVisitsByMemberId,
  issueCoupon,
  listAllCoupons,
  listCouponTemplates,
  listMembers,
  updateMember,
  updatePurchase,
  updateVisit,
  useCoupon,
  expireOverdueCoupons,
} from "./db";
import { sendWelcomeEmail } from "./email";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCouponCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix + "-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const PRIVACY_CONSENT_TEXT = `개인정보 수집·이용 동의서

수집 항목: 이름, 이메일, 전화번호, 생년월일
수집 목적: 멤버십 서비스 제공, 쿠폰 발급 및 관리
보유 기간: 회원 탈퇴 후 5년 (관계 법령에 따름)
제3자 제공: 없음

위 내용에 동의하지 않으실 경우 멤버십 가입이 제한될 수 있습니다.`;

const MARKETING_CONSENT_TEXT = `마케팅 정보 수신 동의서

수신 항목: 신메뉴 안내, 이벤트 정보, 프로모션 혜택
수신 방법: 이메일, SMS
보유 기간: 동의 철회 시까지
동의 거부 시 불이익: 마케팅 정보 수신이 제한되나, 기본 멤버십 혜택은 유지됩니다.`;

// ─── Admin Middleware ─────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "관리자 권한이 필요합니다." });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Public: 멤버십 가입 ────────────────────────────────────────────────────
  membership: router({
    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          email: z.string().email(),
          phone: z.string().min(9).max(20),
          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          privacyConsent: z.boolean(),
          marketingConsent: z.boolean(),
          ipAddress: z.string().optional(),
          userAgent: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (!input.privacyConsent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "개인정보 수집 동의는 필수입니다.",
          });
        }

        // 중복 이메일 체크
        const existing = await getMemberByEmail(input.email);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "이미 가입된 이메일입니다.",
          });
        }

        const now = new Date();

        // 회원 생성
        await createMember({
          name: input.name,
          email: input.email,
          phone: input.phone,
          birthDate: new Date(input.birthDate),
          privacyConsent: true,
          privacyConsentAt: now,
          privacyConsentContent: PRIVACY_CONSENT_TEXT,
          marketingConsent: input.marketingConsent,
          marketingConsentAt: input.marketingConsent ? now : undefined,
          marketingConsentContent: input.marketingConsent ? MARKETING_CONSENT_TEXT : undefined,
          status: "active",
          joinedAt: now,
        });

        const member = await getMemberByEmail(input.email);
        if (!member) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // 동의 기록 저장
        await createConsentLog({
          memberId: member.id,
          consentType: "privacy",
          agreed: true,
          consentContent: PRIVACY_CONSENT_TEXT,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });

        if (input.marketingConsent) {
          await createConsentLog({
            memberId: member.id,
            consentType: "marketing",
            agreed: true,
            consentContent: MARKETING_CONSENT_TEXT,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          });
        }

        // ─── 쿠폰 발급 로직 ─────────────────────────────────────────────────────
        // 모든 회원: 콜키지 프리 쿠폰 (기본 혜택)
        // 마케팅 동의 회원: 10% 할인 쿠폰 + 생일 15% 쿠폰 추가 발급

        const [discountTemplate, corkageTemplate, birthdayTemplate] = await Promise.all([
          getCouponTemplateByType("discount_percent"),
          getCouponTemplateByType("corkage_free"),
          getCouponTemplateByType("birthday"),
        ]);

        // 기본 혜택: 콜키지 프리 (모든 회원)
        if (corkageTemplate) {
          const expiresAt = new Date(now);
          expiresAt.setDate(expiresAt.getDate() + corkageTemplate.validDays);
          await issueCoupon({
            memberId: member.id,
            templateId: corkageTemplate.id,
            code: generateCouponCode("CORK"),
            type: "corkage_free",
            name: corkageTemplate.name,
            description: corkageTemplate.description,
            expiresAt,
          });
        }

        // 마케팅 동의 시 추가 혜택: 10% 할인 쿠폰 + 생일 쿠폰
        if (input.marketingConsent) {
          if (discountTemplate) {
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + discountTemplate.validDays);
            await issueCoupon({
              memberId: member.id,
              templateId: discountTemplate.id,
              code: generateCouponCode("NOPS"),
              type: "discount_percent",
              discountPercent: discountTemplate.discountPercent,
              name: discountTemplate.name,
              description: "마케팅 동의 감사 혜택 · " + (discountTemplate.description ?? ""),
              expiresAt,
            });
          }

          // 생일 쿠폰 즉시 발급 (올해분)
          if (birthdayTemplate) {
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + birthdayTemplate.validDays);
            await issueCoupon({
              memberId: member.id,
              templateId: birthdayTemplate.id,
              code: generateCouponCode("BDAY"),
              type: "birthday",
              discountPercent: birthdayTemplate.discountPercent,
              name: birthdayTemplate.name,
              description: "마케팅 동의 감사 혜택 · " + (birthdayTemplate.description ?? ""),
              expiresAt,
              birthdayYear: now.getFullYear(),
            });
          }
        }

        // 발급된 쿠폰 목록 조회 후 환영 이메일 발송 (비동기, 실패해도 가입은 성공)
        const issuedCoupons = await getCouponsByMemberId(member.id);
        sendWelcomeEmail({
          to: member.email,
          name: member.name,
          coupons: issuedCoupons.map((c) => ({
            name: c.name,
            code: c.code,
            discountPercent: c.discountPercent,
            expiresAt: c.expiresAt,
          })),
        }).catch((err) => console.error("[Email] Welcome email failed:", err));

        return { success: true, memberId: member.id };
      }),

    // 이메일로 회원 조회 (마이페이지 접근용)
    getByEmail: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        const member = await getMemberByEmail(input.email);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
        return member;
      }),

    // 고객 마이페이지: 쿠폰 조회
    getMyCoupons: publicProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getCouponsByMemberId(input.memberId);
      }),

    // 마케팅 동의 변경 (마이페이지에서 고객이 직접 변경)
    updateMarketingConsent: publicProcedure
      .input(
        z.object({
          memberId: z.number(),
          email: z.string().email(), // 본인 확인용
          agreed: z.boolean(),
          userAgent: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // 이메일로 회원 확인 (본인 검증)
        const member = await getMemberById(input.memberId);
        if (!member || member.email !== input.email) {
          throw new TRPCError({ code: "FORBIDDEN", message: "본인 확인에 실패했습니다." });
        }

        // 이미 같은 상태면 스킵
        if (member.marketingConsent === input.agreed) {
          return { success: true, couponsIssued: 0, alreadySame: true };
        }

        const now = new Date();

        // 동의 상태 업데이트
        await updateMember(input.memberId, {
          marketingConsent: input.agreed,
          marketingConsentAt: input.agreed ? now : undefined,
          marketingConsentContent: input.agreed ? MARKETING_CONSENT_TEXT : undefined,
        });

        // 동의 이력 저장
        await createConsentLog({
          memberId: input.memberId,
          consentType: input.agreed ? "marketing" : "marketing_withdraw",
          agreed: input.agreed,
          consentContent: MARKETING_CONSENT_TEXT,
          ipAddress: undefined,
          userAgent: input.userAgent,
        });

        let couponsIssued = 0;

        // 동의 시: 10% 할인 쿠폰 + 생일 쿠폰 자동 발급 (미발급자만)
        if (input.agreed) {
          const existingCoupons = await getCouponsByMemberId(input.memberId);
          const hasDiscount = existingCoupons.some((c) => c.type === "discount_percent");
          const hasBirthday = existingCoupons.some(
            (c) => c.type === "birthday" && c.birthdayYear === now.getFullYear()
          );

          const [discountTemplate, birthdayTemplate] = await Promise.all([
            getCouponTemplateByType("discount_percent"),
            getCouponTemplateByType("birthday"),
          ]);

          // 10% 할인 쿠폰 (아직 없는 경우만)
          if (!hasDiscount && discountTemplate) {
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + discountTemplate.validDays);
            await issueCoupon({
              memberId: input.memberId,
              templateId: discountTemplate.id,
              code: generateCouponCode("NOPS"),
              type: "discount_percent",
              discountPercent: discountTemplate.discountPercent,
              name: discountTemplate.name,
              description: "마케팅 동의 감사 혜택 · " + (discountTemplate.description ?? ""),
              expiresAt,
            });
            couponsIssued++;
          }

          // 생일 쿠폰 (올해 미발급인 경우만)
          if (!hasBirthday && birthdayTemplate) {
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + birthdayTemplate.validDays);
            await issueCoupon({
              memberId: input.memberId,
              templateId: birthdayTemplate.id,
              code: generateCouponCode("BDAY"),
              type: "birthday",
              discountPercent: birthdayTemplate.discountPercent,
              name: birthdayTemplate.name,
              description: "마케팅 동의 감사 혜택 · " + (birthdayTemplate.description ?? ""),
              expiresAt,
              birthdayYear: now.getFullYear(),
            });
            couponsIssued++;
          }
        }

        return { success: true, couponsIssued, alreadySame: false };
      }),
  }),

  // ─── Admin: 회원 관리 ───────────────────────────────────────────────────────
  admin: router({
    // 회원 목록
    listMembers: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(["active", "inactive", "withdrawn"]).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return listMembers(input);
      }),

    // 회원 상세
    getMember: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const member = await getMemberById(input.id);
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });
        return member;
      }),

    // 회원 정보 수정
    updateMember: adminProcedure
      .input(
        z.object({
          id: z.number(),
          notes: z.string().optional(),
          status: z.enum(["active", "inactive", "withdrawn"]).optional(),
          marketingConsent: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, marketingConsent, ...data } = input;
        // 마케팅 동의 변경 시 이력 기록
        if (marketingConsent !== undefined) {
          const existing = await getMemberById(id);
          if (existing && existing.marketingConsent !== marketingConsent) {
            const now = new Date();
            await createConsentLog({
              memberId: id,
              consentType: marketingConsent ? "marketing" : "marketing_withdraw",
              agreed: marketingConsent,
              consentContent: MARKETING_CONSENT_TEXT,
              ipAddress: undefined,
              userAgent: "admin-update",
            });
            await updateMember(id, {
              ...data,
              marketingConsent,
              marketingConsentAt: marketingConsent ? now : undefined,
              marketingConsentContent: marketingConsent ? MARKETING_CONSENT_TEXT : undefined,
            });
            return { success: true };
          }
        }
        await updateMember(id, { ...data, ...(marketingConsent !== undefined ? { marketingConsent } : {}) });
        return { success: true };
      }),

    // 동의 기록 조회
    getConsentLogs: adminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getConsentLogsByMemberId(input.memberId);
      }),

    // ─── 쿠폰 관리 ──────────────────────────────────────────────────────────
    listCoupons: adminProcedure
      .input(
        z.object({
          memberId: z.number().optional(),
          status: z.enum(["active", "used", "expired"]).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return listAllCoupons(input);
      }),

    issueCoupon: adminProcedure
      .input(
        z.object({
          memberId: z.number(),
          type: z.enum(["discount_percent", "corkage_free", "birthday"]),
          validDays: z.number().min(1).default(365),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const template = await getCouponTemplateByType(input.type);
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰 템플릿을 찾을 수 없습니다." });

        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + input.validDays);

        const prefix = input.type === "discount_percent" ? "NOPS" : input.type === "corkage_free" ? "CORK" : "BDAY";

        await issueCoupon({
          memberId: input.memberId,
          templateId: template.id,
          code: generateCouponCode(prefix),
          type: input.type,
          discountPercent: template.discountPercent,
          name: template.name,
          description: input.note ?? template.description,
          expiresAt,
          birthdayYear: input.type === "birthday" ? now.getFullYear() : undefined,
        });

        return { success: true };
      }),

    useCoupon: adminProcedure
      .input(
        z.object({
          couponId: z.number().optional(),
          couponCode: z.string().optional(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let couponId = input.couponId;

        if (!couponId && input.couponCode) {
          const coupon = await getCouponByCode(input.couponCode);
          if (!coupon) throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." });
          if (coupon.status !== "active") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `이미 ${coupon.status === "used" ? "사용된" : "만료된"} 쿠폰입니다.` });
          }
          couponId = coupon.id;
        }

        if (!couponId) throw new TRPCError({ code: "BAD_REQUEST", message: "쿠폰 ID 또는 코드가 필요합니다." });

        await useCoupon(couponId, ctx.user.id, input.note);
        return { success: true };
      }),

    listCouponTemplates: adminProcedure.query(async () => {
      return listCouponTemplates();
    }),

    expireCoupons: adminProcedure.mutation(async () => {
      await expireOverdueCoupons();
      return { success: true };
    }),

    // ─── 방문 기록 ──────────────────────────────────────────────────────────
    getVisits: adminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getVisitsByMemberId(input.memberId);
      }),

    addVisit: adminProcedure
      .input(
        z.object({
          memberId: z.number(),
          visitedAt: z.string(),
          partySize: z.number().min(1).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await createVisit({
          memberId: input.memberId,
          visitedAt: new Date(input.visitedAt),
          partySize: input.partySize,
          notes: input.notes,
          recordedByStaffId: ctx.user.id,
        });
        return { success: true };
      }),

    updateVisit: adminProcedure
      .input(
        z.object({
          id: z.number(),
          visitedAt: z.string().optional(),
          partySize: z.number().min(1).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, visitedAt, ...rest } = input;
        await updateVisit(id, {
          ...rest,
          ...(visitedAt ? { visitedAt: new Date(visitedAt) } : {}),
        });
        return { success: true };
      }),

    deleteVisit: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteVisit(input.id);
        return { success: true };
      }),

    // ─── 구매 이력 ──────────────────────────────────────────────────────────
    getPurchases: adminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getPurchasesByMemberId(input.memberId);
      }),

    addPurchase: adminProcedure
      .input(
        z.object({
          memberId: z.number(),
          visitId: z.number().optional(),
          amount: z.number().positive(),
          discountAmount: z.number().min(0).default(0),
          finalAmount: z.number().positive(),
          couponId: z.number().optional(),
          memo: z.string().optional(),
          purchasedAt: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await createPurchase({
          memberId: input.memberId,
          visitId: input.visitId,
          amount: String(input.amount),
          discountAmount: String(input.discountAmount),
          finalAmount: String(input.finalAmount),
          couponId: input.couponId,
          memo: input.memo,
          purchasedAt: new Date(input.purchasedAt),
          recordedByStaffId: ctx.user.id,
        });
        return { success: true };
      }),

    updatePurchase: adminProcedure
      .input(
        z.object({
          id: z.number(),
          amount: z.number().positive().optional(),
          discountAmount: z.number().min(0).optional(),
          finalAmount: z.number().positive().optional(),
          memo: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, amount, discountAmount, finalAmount, ...rest } = input;
        await updatePurchase(id, {
          ...rest,
          ...(amount !== undefined ? { amount: String(amount) } : {}),
          ...(discountAmount !== undefined ? { discountAmount: String(discountAmount) } : {}),
          ...(finalAmount !== undefined ? { finalAmount: String(finalAmount) } : {}),
        });
        return { success: true };
      }),

    deletePurchase: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePurchase(input.id);
        return { success: true };
      }),

    // ─── 데이터 분석 ─────────────────────────────────────────────────────────
    getAnalytics: adminProcedure.query(async () => {
      const [memberStats, couponStats, purchaseStats] = await Promise.all([
        getMemberStats(),
        getCouponStats(),
        getPurchaseStats(),
      ]);
      return { memberStats, couponStats, purchaseStats };
    }),

    // 생일 쿠폰 수동 발급 (스케줄러 대용)
    issueBirthdayCoupons: adminProcedure.mutation(async () => {
      const birthdayMembers = await getMembersWithBirthdayToday();
      const template = await getCouponTemplateByType("birthday");
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "생일 쿠폰 템플릿이 없습니다." });

      const now = new Date();
      const year = now.getFullYear();
      let issued = 0;

      for (const member of birthdayMembers) {
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + template.validDays);
        await issueCoupon({
          memberId: member.id,
          templateId: template.id,
          code: generateCouponCode("BDAY"),
          type: "birthday",
          discountPercent: template.discountPercent,
          name: template.name,
          description: template.description,
          expiresAt,
          birthdayYear: year,
        });
        issued++;
      }

      return { success: true, issued };
    }),
  }),
});

export type AppRouter = typeof appRouter;
