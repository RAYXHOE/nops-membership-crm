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
  getMemberByPhone,
  getMemberByNameAndPhone,
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
  listBranches,
  getBranchByCode,
  createBranch,
  updateBranch,
  deleteBranch,
  listAlimtalkLogs,
  createInquiry,
  listInquiries,
  replyInquiry,
  earnPoints,
  cancelPoints,
  usePoints,
  getPointsByMemberId,
  calcEarnPoints,
} from "./db";
import { sendWelcomeEmail, sendOtpEmail } from "./email";
import { sendWelcomeAlimtalk } from "./kakao";
import { createOtp, verifyOtp as verifyOtpDb } from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCouponCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix + "-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 쿠폰 발급 재시도 로직 (Cold Start 등 일시적 DB 연결 실패 대비)
async function issueCouponWithRetry(data: Parameters<typeof issueCoupon>[0], maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await issueCoupon(data);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const PRIVACY_CONSENT_TEXT = `개인정보 수집·이용 동의서

수집 항목: 이름, 이메일, 전화번호, 생년월일
수집 목적: 멤버십 서비스 제공, 쿠폰 발급 및 관리
보유 기간: 회원 탈퇴 후 5년 (관계 법령에 따름)
제3자 제공: 없음

[개인정보 국외 이전 고지]
이전 항목: 이름, 이메일, 전화번호, 생년월일
이전 국가: 미국 (AWS us-east-1, 버지니아 북부)
수탁 업체: PingCAP, Inc. (TiDB Cloud 서비스) / Amazon Web Services, Inc.
이전 목적: 멤버십 데이터베이스 운영 및 서비스 제공
보유 기간: 회원 탈퇴 후 5년

위 내용에 동의하지 않으실 경우 멤버십 가입이 제한될 수 있습니다.`;

const MARKETING_CONSENT_TEXT = `마케팅 정보 수신 동의서

수신 항목: 신메뉴 안내, 이벤트 정보, 프로모션 혜택
수신 방법: 이메일, SMS
보유 기간: 동의 철회 시까지
동의 거부 시 불이익: 마케팅 정보 수신이 제한되나, 기본 멤버십 혜택은 유지됩니다.`;

// ─── Permission Helpers ──────────────────────────────────────────────────────
type AllowedRole = "branch_admin" | "staff" | "admin";

function hasRole(userRole: string, allowed: AllowedRole[]): boolean {
  return (allowed as string[]).includes(userRole);
}

// 어드민 + 스태프 + 지점 관리자 (admin 대시보드 접근)
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowedRoles = ["admin", "staff", "branch_admin"];
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "접근 권한이 없습니다." });
  }
  return next({ ctx });
});

// 슈퍼 어드민만 (admin 전용 기능)
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "슈퍼 어드민 권한이 필요합니다." });
  }
  return next({ ctx });
});

// 지점 관리자 이상 (지점 관리자 + 본사 스태프 + 어드민)
const branchAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, ["branch_admin", "staff", "admin"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "지점 관리자 권한이 필요합니다." });
  }
  return next({ ctx });
});

// 본사 스태프 이상 (본사 스태프 + 어드민)
const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, ["staff", "admin"])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "본사 스태프 권한이 필요합니다." });
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
          anniversaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

        // 중복 이메일 체크 (탈퇴 회원 포함)
        const existing = await getMemberByEmail(input.email);
        if (existing) {
          if (existing.status === "withdrawn") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "탈퇴한 이력이 있는 이메일입니다. 재가입을 원하시면 매장으로 문의해 주세요.",
            });
          }
          throw new TRPCError({
            code: "CONFLICT",
            message: "이미 가입된 이메일입니다. 마이페이지에서 쿠폰을 확인해 주세요.",
          });
        }

        // 동일 전화번호 중복 체크 (탈퇴 회원 포함)
        const existingByPhone = await getMemberByPhone(input.phone);
        if (existingByPhone) {
          if (existingByPhone.status === "withdrawn") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "탈퇴한 이력이 있는 전화번호입니다. 재가입을 원하시면 매장으로 문의해 주세요.",
            });
          }
          throw new TRPCError({
            code: "CONFLICT",
            message: "이미 해당 전화번호로 가입된 계정이 있습니다. 마이페이지에서 쿠폰을 확인해 주세요.",
          });
        }

        // 이름+전화번호 중복 체크
        const existingByNamePhone = await getMemberByNameAndPhone(input.name, input.phone);
        if (existingByNamePhone) {
          if (existingByNamePhone.status === "withdrawn") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "탈퇴한 이력이 있는 회원입니다. 재가입을 원하시면 매장으로 문의해 주세요.",
            });
          }
          throw new TRPCError({
            code: "CONFLICT",
            message: "동일한 이름과 전화번호로 이미 가입된 계정이 있습니다.",
          });
        }

        const now = new Date();

        // 회원 생성
        await createMember({
          name: input.name,
          email: input.email,
          phone: input.phone,
          birthDate: new Date(input.birthDate),
          anniversaryDate: input.anniversaryDate ? new Date(input.anniversaryDate) : undefined,
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
          try {
            await issueCouponWithRetry({
              memberId: member.id,
              templateId: corkageTemplate.id,
              code: generateCouponCode("CORK"),
              type: "corkage_free",
              name: corkageTemplate.name,
              description: corkageTemplate.description,
              expiresAt,
            });
            console.log(`[Register] 콜키지 프리 쿠폰 발급 성공: memberId=${member.id}`);
          } catch (err) {
            console.error(`[CouponIssue] Failed for memberId=${member.id} type=corkage_free`, err);
          }
        }

        // 마케팅 동의 시 추가 혜택: 10% 할인 쿠폰 + 생일 쿠폰
        if (input.marketingConsent) {
          if (discountTemplate) {
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + discountTemplate.validDays);
            try {
              await issueCouponWithRetry({
                memberId: member.id,
                templateId: discountTemplate.id,
                code: generateCouponCode("NOPS"),
                type: "discount_percent",
                discountPercent: discountTemplate.discountPercent,
                name: discountTemplate.name,
                description: "마케팅 동의 감사 혜택 · " + (discountTemplate.description ?? ""),
                expiresAt,
              });
              console.log(`[Register] 10% 할인 쿠폰 발급 성공: memberId=${member.id}`);
            } catch (couponErr) {
              console.error(`[CouponIssue] Failed for memberId=${member.id} type=discount_percent`, couponErr);
            }
          } else {
            console.error(`[Register] ⚠️ discount_percent 템플릿을 찾을 수 없음: memberId=${member.id}, marketingConsent=true`);
          }

          // 생일 쿠폰: 마케팅 동의 + 가입 월 = 생일 월이면 즉시 발급 (연도 중복 제외)
          if (birthdayTemplate && input.birthDate && input.marketingConsent) {
            const birthMonth = new Date(input.birthDate).getMonth() + 1;
            const joinMonth = now.getMonth() + 1;
            const joinYear = now.getFullYear();
            if (birthMonth === joinMonth) {
              // 이미 올해 생일 쿠폰 발급된 경우 제외
              const { getDb: getDbLocal } = await import("./db");
              const dbLocal = await getDbLocal();
              const { coupons: couponsSchema } = await import("../drizzle/schema");
              const { and: andOp, eq: eqOp, sql: sqlOp } = await import("drizzle-orm");
              const existingBirthday = dbLocal ? await dbLocal.select()
                .from(couponsSchema)
                .where(
                  andOp(
                    eqOp(couponsSchema.memberId, member.id),
                    eqOp(couponsSchema.type, "birthday"),
                    sqlOp`YEAR(issuedAt) = ${joinYear}`
                  )
                ).limit(1) : [];
              if (!existingBirthday || existingBirthday.length === 0) {
                const expiresAt = new Date(now);
                expiresAt.setDate(expiresAt.getDate() + birthdayTemplate.validDays);
                try {
                  await issueCouponWithRetry({
                    memberId: member.id,
                    templateId: birthdayTemplate.id,
                    code: generateCouponCode("BDAY"),
                    type: "birthday",
                    discountPercent: birthdayTemplate.discountPercent,
                    name: birthdayTemplate.name,
                    description: `${joinYear}년 생일 축하 쿠폰`,
                    expiresAt,
                  });
                  console.log(`[Register] 생일 쿠폰 즉시 발급: memberId=${member.id} (${birthMonth}월 생일)`);
                } catch (err) {
                  console.error(`[CouponIssue] Failed for memberId=${member.id} type=birthday`, err);
                }
              }
            }
          }
        }

        // 발급된 쿠폰 목록 조회
        const issuedCoupons = await getCouponsByMemberId(member.id);
        const couponPayload = issuedCoupons.map((c) => ({
          name: c.name,
          code: c.code,
          discountPercent: c.discountPercent,
          expiresAt: c.expiresAt,
        }));

        // 환영 이메일 발송 (비동기)
        sendWelcomeEmail({
          to: member.email,
          name: member.name,
          coupons: couponPayload,
        }).catch((err) => console.error("[Email] Welcome email failed:", err));

        // 환영 카카오 알림톡 발송 (전화번호 있는 경우만, 비동기)
        if (member.phone) {
          sendWelcomeAlimtalk({
            to: member.phone,
            name: member.name,
            coupons: couponPayload.map((c) => ({ name: c.name, code: c.code })),
          }).catch((err) => console.error("[Kakao] Welcome alimtalk failed:", err));
        }

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

    // memberId로 회원 정보 조회 (OTP 인증 후 사용)
    getMemberInfo: publicProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        const member = await getMemberById(input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
        return member;
      }),

    // 고객 마이페이지: 쿠폰 조회
    getMyCoupons: publicProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getCouponsByMemberId(input.memberId);
      }),

    // 마케팅 동의 변경 (마이페이지 철회 전용)
    updateMarketing: publicProcedure
      .input(z.object({ memberId: z.number(), marketingConsent: z.boolean() }))
      .mutation(async ({ input }) => {
        const member = await getMemberById(input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });
        const now = new Date();
        await createConsentLog({
          memberId: input.memberId,
          consentType: input.marketingConsent ? "marketing" : "marketing_withdraw",
          agreed: input.marketingConsent,
          consentContent: MARKETING_CONSENT_TEXT,
          ipAddress: undefined,
          userAgent: "mypage",
        });
        await updateMember(input.memberId, {
          marketingConsent: input.marketingConsent,
          marketingConsentAt: input.marketingConsent ? now : undefined,
        });

        // 마케팅 동의 시: 생일 월 / 기념일 월이면 쿠폰 즉시 발급
        if (input.marketingConsent) {
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();
          const { getDb: getDbLocal } = await import("./db");
          const { coupons: couponsSchema } = await import("../drizzle/schema");
          const { and: andOp, eq: eqOp, sql: sqlOp } = await import("drizzle-orm");
          const dbLocal = await getDbLocal();

          // 생일 월 일치 시 생일 쿠폰 발급
          if (member.birthDate) {
            const birthMonth = new Date(member.birthDate).getMonth() + 1;
            if (birthMonth === currentMonth && dbLocal) {
              const existingBirthday = await dbLocal.select()
                .from(couponsSchema)
                .where(andOp(
                  eqOp(couponsSchema.memberId, member.id),
                  eqOp(couponsSchema.type, "birthday"),
                  sqlOp`YEAR(issuedAt) = ${currentYear}`
                )).limit(1);
              if (existingBirthday.length === 0) {
                const birthdayTemplate = await getCouponTemplateByType("birthday");
                if (birthdayTemplate) {
                  const expiresAt = new Date(now);
                  expiresAt.setDate(expiresAt.getDate() + birthdayTemplate.validDays);
                  try {
                    await issueCoupon({
                      memberId: member.id,
                      templateId: birthdayTemplate.id,
                      code: generateCouponCode("BDAY"),
                      type: "birthday",
                      discountPercent: birthdayTemplate.discountPercent,
                      name: birthdayTemplate.name,
                      description: `${currentYear}년 생일 축하 쿠폰`,
                      expiresAt,
                    });
                    console.log(`[UpdateMarketing] 생일 쿠폰 즉시 발급: memberId=${member.id}`);
                  } catch (err) {
                    console.error(`[UpdateMarketing] 생일 쿠폰 발급 실패:`, err);
                  }
                }
              }
            }
          }

          // 기념일 월 일치 시 기념일 쿠폰 발급
          if (member.anniversaryDate) {
            const anniversaryMonth = new Date(member.anniversaryDate).getMonth() + 1;
            if (anniversaryMonth === currentMonth && dbLocal) {
              const existingAnniversary = await dbLocal.select()
                .from(couponsSchema)
                .where(andOp(
                  eqOp(couponsSchema.memberId, member.id),
                  eqOp(couponsSchema.type, "anniversary"),
                  sqlOp`YEAR(issuedAt) = ${currentYear}`
                )).limit(1);
              if (existingAnniversary.length === 0) {
                const anniversaryTemplate = await getCouponTemplateByType("anniversary");
                if (anniversaryTemplate) {
                  const expiresAt = new Date(now);
                  expiresAt.setDate(expiresAt.getDate() + anniversaryTemplate.validDays);
                  try {
                    await issueCoupon({
                      memberId: member.id,
                      templateId: anniversaryTemplate.id,
                      code: generateCouponCode("ANNI"),
                      type: "anniversary",
                      discountPercent: anniversaryTemplate.discountPercent,
                      name: anniversaryTemplate.name,
                      description: `${currentYear}년 결혼기념일 축하 쿠폰`,
                      expiresAt,
                    });
                    console.log(`[UpdateMarketing] 기념일 쿠폰 즉시 발급: memberId=${member.id}`);
                  } catch (err) {
                    console.error(`[UpdateMarketing] 기념일 쿠폰 발급 실패:`, err);
                  }
                }
              }
            }
          }
        }

        return { success: true };
      }),

    // OTP 발송
    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const member = await getMemberByEmail(input.email);
        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND", message: "가입되지 않은 이메일입니다." });
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await createOtp(input.email, code);
        await sendOtpEmail({ to: input.email, name: member.name ?? "회원", code });
        return { success: true };
      }),

    // OTP 검증
    verifyOtp: publicProcedure
      .input(z.object({ email: z.string().email(), code: z.string().length(6) }))
      .mutation(async ({ input }) => {
        const valid = await verifyOtpDb(input.email, input.code);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "인증코드가 올바르지 않거나 만료되었습니다." });
        }
        const member = await getMemberByEmail(input.email);
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });
        return { success: true, memberId: member.id };
      }),

    // 결혼기념일 업데이트 (미등록 시만 1회 허용)
    updateAnniversary: publicProcedure
      .input(z.object({
        memberId: z.number(),
        anniversaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getMemberById(input.memberId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        // 이미 등록된 경우 수정 불가
        if (existing.anniversaryDate) {
          throw new TRPCError({ code: "FORBIDDEN", message: "결혼기념일은 최초 등록 후 수정할 수 없습니다." });
        }
        await updateMember(input.memberId, {
          anniversaryDate: input.anniversaryDate ? new Date(input.anniversaryDate) : null,
        });
        return { success: true };
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

          // 생일 쿠폰: 생일 월 = 현재 월이면 즉시 발급 (연도 중복 제외)
          if (!hasBirthday && birthdayTemplate && member.birthDate) {
            const birthMonth = new Date(member.birthDate).getMonth() + 1;
            const currentMonth = now.getMonth() + 1;
            if (birthMonth === currentMonth) {
              const expiresAt = new Date(now);
              expiresAt.setDate(expiresAt.getDate() + birthdayTemplate.validDays);
              await issueCoupon({
                memberId: input.memberId,
                templateId: birthdayTemplate.id,
                code: generateCouponCode("BDAY"),
                type: "birthday",
                discountPercent: birthdayTemplate.discountPercent,
                name: birthdayTemplate.name,
                description: `${now.getFullYear()}년 생일 축하 쿠폰`,
                expiresAt,
              });
              couponsIssued++;
            }
          }

          // 기념일 쿠폰: 기념일 월 = 현재 월이면 즉시 발급 (연도 중복 제외)
          const hasAnniversary = existingCoupons.some(
            (c) => c.type === "anniversary" && c.birthdayYear === now.getFullYear()
          );
          if (!hasAnniversary && member.anniversaryDate) {
            const anniversaryMonth = new Date(member.anniversaryDate).getMonth() + 1;
            const currentMonth = now.getMonth() + 1;
            if (anniversaryMonth === currentMonth) {
              const anniversaryTemplate = await getCouponTemplateByType("anniversary");
              if (anniversaryTemplate) {
                const expiresAt = new Date(now);
                expiresAt.setDate(expiresAt.getDate() + anniversaryTemplate.validDays);
                await issueCoupon({
                  memberId: input.memberId,
                  templateId: anniversaryTemplate.id,
                  code: generateCouponCode("ANNI"),
                  type: "anniversary",
                  discountPercent: anniversaryTemplate.discountPercent,
                  name: anniversaryTemplate.name,
                  description: `${now.getFullYear()}년 결혼기념일 축하 쿠폰`,
                  expiresAt,
                });
                couponsIssued++;
              }
            }
          }
        }

        return { success: true, couponsIssued, alreadySame: false };
      }),

    // 고객 문의 제출
    submitInquiry: publicProcedure
      .input(z.object({
        memberId: z.number().optional(),
        name: z.string().min(1).max(100),
        email: z.string().email(),
        phone: z.string().optional(),
        category: z.enum(["coupon", "membership", "points", "other"]).default("other"),
        subject: z.string().min(1).max(200),
        content: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        await createInquiry(input);
        return { success: true };
      }),

    // 회원 탈퇴
    withdraw: publicProcedure
      .input(z.object({
        memberId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const member = await getMemberById(input.memberId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
        if (member.status === "withdrawn") throw new TRPCError({ code: "BAD_REQUEST", message: "이미 탈퇴한 회원입니다." });

        // 마케팅 동의 철회 이력 저장
        if (member.marketingConsent) {
          await createConsentLog({
            memberId: input.memberId,
            consentType: "marketing_withdraw",
            agreed: false,
            consentContent: "회원 탈퇴로 인한 마케팅 수신 자동 철회",
          });
        }

        // 상태 withdrawn 변경
        await updateMember(input.memberId, {
          status: "withdrawn",
          marketingConsent: false,
          notes: `[${new Date().toLocaleDateString("ko-KR")} 탈퇴] ${input.reason ?? "사유 미기재"} | 기존 메모: ${member.notes ?? "없음"}`
        });

        return { success: true };
      }),
  }),

  // ─── Admin: 회원 관리 ───────────────────────────────────────────────────────
  admin: router({
    // 회원 목록
    listMembers: branchAdminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(["active", "inactive", "withdrawn"]).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          startDate: z.string().optional(), // YYYY-MM-DD
          endDate: z.string().optional(),   // YYYY-MM-DD
        })
      )
      .query(async ({ input }) => {
        return listMembers({
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        });
      }),

    // 회원 Raw Data 엑셀 다운로드 (전체 조회)
    exportMembersRaw: branchAdminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(["active", "inactive", "withdrawn"]).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const result = await listMembers({
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          limit: 10000,
          offset: 0,
        });
        return result.items.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          phone: m.phone,
          birthDate: m.birthDate ? new Date(m.birthDate).toLocaleDateString("ko-KR") : "",
          anniversaryDate: m.anniversaryDate ? new Date(m.anniversaryDate).toLocaleDateString("ko-KR") : "",
          marketingConsent: m.marketingConsent ? "동의" : "미동의",
          status: m.status === "active" ? "활성" : m.status === "inactive" ? "비활성" : "탈퇴",
          joinedAt: new Date(m.joinedAt).toLocaleDateString("ko-KR"),
          pointBalance: m.pointBalance ?? 0,
        }));
      }),

    // 회원 상세
    getMember: branchAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const member = await getMemberById(input.id);
        if (!member) throw new TRPCError({ code: "NOT_FOUND" });
        return member;
      }),

    // 회원 정보 수정
    updateMember: branchAdminProcedure
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
    getConsentLogs: branchAdminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getConsentLogsByMemberId(input.memberId);
      }),

    // ─── 쿠폰 관리 ──────────────────────────────────────────────────────────
    listCoupons: branchAdminProcedure
      .input(
        z.object({
          memberId: z.number().optional(),
          status: z.enum(["active", "used", "expired"]).optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          memberSearch: z.string().optional(), // 회원 이름/이메일 검색
          usedBranchCode: z.string().optional(), // 사용 지점 필터
          startDate: z.string().optional(), // YYYY-MM-DD 발급일 기준
          endDate: z.string().optional(),   // YYYY-MM-DD
        })
      )
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { items: [], total: 0 };
        const { coupons, members } = await import("../drizzle/schema");
        const { and, eq, like, or, desc, sql, gte, lte } = await import("drizzle-orm");
        const conditions: ReturnType<typeof eq>[] = [];
        if (input.memberId) conditions.push(eq(coupons.memberId, input.memberId) as ReturnType<typeof eq>);
        if (input.status) conditions.push(eq(coupons.status, input.status) as ReturnType<typeof eq>);
        if (input.usedBranchCode) conditions.push(eq(coupons.usedBranchCode, input.usedBranchCode) as ReturnType<typeof eq>);
        if (input.startDate) conditions.push(gte(coupons.issuedAt, new Date(input.startDate)) as ReturnType<typeof eq>);
        if (input.endDate) {
          const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);
          conditions.push(lte(coupons.issuedAt, end) as ReturnType<typeof eq>);
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = input.limit;
        const offset = input.offset;
        // 회원 이름 검색이 있으면 join 후 필터
        if (input.memberSearch) {
          const searchPattern = `%${input.memberSearch}%`;
          const [items, countResult] = await Promise.all([
            db.select({ coupon: coupons, memberName: members.name, memberEmail: members.email, memberPhone: members.phone })
              .from(coupons)
              .leftJoin(members, eq(coupons.memberId, members.id))
              .where(and(where, or(like(members.name, searchPattern), like(members.email, searchPattern))))
              .orderBy(desc(coupons.issuedAt)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)` }).from(coupons)
              .leftJoin(members, eq(coupons.memberId, members.id))
              .where(and(where, or(like(members.name, searchPattern), like(members.email, searchPattern)))),
          ]);
          return { items, total: Number(countResult[0]?.count ?? 0) };
        }
        // 날짜 필터가 있으면 join 필요
        if (input.startDate || input.endDate) {
          const [items, countResult] = await Promise.all([
            db.select({ coupon: coupons, memberName: members.name, memberEmail: members.email, memberPhone: members.phone })
              .from(coupons)
              .leftJoin(members, eq(coupons.memberId, members.id))
              .where(where)
              .orderBy(desc(coupons.issuedAt)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)` }).from(coupons).where(where),
          ]);
          return { items, total: Number(countResult[0]?.count ?? 0) };
        }
        return listAllCoupons({ memberId: input.memberId, status: input.status, limit, offset });
      }),

    // 쿠폰 Raw Data 엑셀 다운로드
    exportCouponsRaw: branchAdminProcedure
      .input(
        z.object({
          status: z.enum(["active", "used", "expired"]).optional(),
          memberSearch: z.string().optional(),
          usedBranchCode: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { coupons, members } = await import("../drizzle/schema");
        const { and, eq, like, or, desc, gte, lte } = await import("drizzle-orm");
        const conditions: ReturnType<typeof eq>[] = [];
        if (input.status) conditions.push(eq(coupons.status, input.status) as ReturnType<typeof eq>);
        if (input.usedBranchCode) conditions.push(eq(coupons.usedBranchCode, input.usedBranchCode) as ReturnType<typeof eq>);
        if (input.startDate) conditions.push(gte(coupons.issuedAt, new Date(input.startDate)) as ReturnType<typeof eq>);
        if (input.endDate) {
          const end = new Date(input.endDate); end.setHours(23, 59, 59, 999);
          conditions.push(lte(coupons.issuedAt, end) as ReturnType<typeof eq>);
        }
        if (input.memberSearch) {
          const p = `%${input.memberSearch}%`;
          conditions.push(or(like(members.name, p), like(members.email, p)) as ReturnType<typeof eq>);
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const items = await db.select({ coupon: coupons, memberName: members.name, memberEmail: members.email, memberPhone: members.phone })
          .from(coupons)
          .leftJoin(members, eq(coupons.memberId, members.id))
          .where(where)
          .orderBy(desc(coupons.issuedAt))
          .limit(10000);
        return items.map(({ coupon: c, memberName, memberEmail, memberPhone }) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          type: c.type,
          discountPercent: c.discountPercent ?? "",
          status: c.status === "active" ? "사용가능" : c.status === "used" ? "사용완료" : "만료",
          memberName: memberName ?? "",
          memberEmail: memberEmail ?? "",
          memberPhone: memberPhone ?? "",
          issuedAt: new Date(c.issuedAt).toLocaleDateString("ko-KR"),
          expiresAt: new Date(c.expiresAt).toLocaleDateString("ko-KR"),
          usedAt: c.usedAt ? new Date(c.usedAt).toLocaleDateString("ko-KR") : "",
          usedBranchCode: c.usedBranchCode ?? "",
        }));
      }),

    // 쿠폰 사용처리 되돌리기 (used → active)
    revertCoupon: branchAdminProcedure
      .input(z.object({ couponId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { coupons } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const result = await db.select().from(coupons).where(and(eq(coupons.id, input.couponId), eq(coupons.status, "used"))).limit(1);
        if (!result[0]) throw new TRPCError({ code: "NOT_FOUND", message: "사용 완료 상태의 쿠폰이 아닙니다." });
        await db.update(coupons).set({ status: "active", usedAt: null, usedByStaffId: null, usedBranchCode: null, usedNote: null })
          .where(eq(coupons.id, input.couponId));
        return { success: true };
      }),

    issueCoupon: branchAdminProcedure
      .input(
        z.object({
          memberId: z.number(),
          type: z.enum(["discount_percent", "corkage_free", "birthday", "employee"]),
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

        const prefix = input.type === "discount_percent" ? "NOPS" : input.type === "corkage_free" ? "CORK" :
                       input.type === "employee" ? "EMP" : "BDAY";

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

    // 임직원 쿠폰 발급 (어드민 전용)
    issueEmployeeCoupon: adminProcedure
      .input(z.object({
        memberId: z.number(),
        note: z.string().optional(),
        validDays: z.number().min(1).default(365),
      }))
      .mutation(async ({ input }) => {
        const template = await getCouponTemplateByType("employee");
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "임직원 쿠폰 템플릿이 없습니다." });
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + input.validDays);
        await issueCoupon({
          memberId: input.memberId,
          templateId: template.id,
          code: generateCouponCode("EMP"),
          type: "employee",
          discountPercent: template.discountPercent,
          name: template.name,
          description: input.note ?? template.description,
          expiresAt,
        });
        return { success: true };
      }),

    useCoupon: branchAdminProcedure
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

        // 로그인 직원의 branchCode 자동 기록
        const staffBranchCode = (ctx.user as typeof ctx.user & { branchCode?: string | null }).branchCode ?? null;
        await useCoupon(couponId, ctx.user.id, input.note, staffBranchCode);
        return { success: true };
      }),

    listCouponTemplates: branchAdminProcedure.query(async () => {
      return listCouponTemplates();
    }),

    // 쿠폰 코드로 직접 조회 (QR 스캔 전용)
    getCouponByCode: branchAdminProcedure
      .input(z.object({ code: z.string().min(1) }))
      .query(async ({ input }) => {
        const coupon = await getCouponByCode(input.code.trim().toUpperCase());
        if (!coupon) throw new TRPCError({ code: "NOT_FOUND", message: "쿠폰을 찾을 수 없습니다." });

        // 회원 정보 함께 반환
        const member = await getMemberById(coupon.memberId);
        return {
          ...coupon,
          memberName: member?.name ?? null,
          memberEmail: member?.email ?? null,
        };
      }),

    expireCoupons: branchAdminProcedure.mutation(async () => {
      await expireOverdueCoupons();
      return { success: true };
    }),

    // ─── 방문 기록 ──────────────────────────────────────────────────────────
    getVisits: branchAdminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getVisitsByMemberId(input.memberId);
      }),

    addVisit: branchAdminProcedure
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

    // ─── 체크인 통합 처리 (1회 저장으로 방문+구매+쿠폰+적립금) ────────────────────────────────
    checkin: branchAdminProcedure
      .input(z.object({
        memberId: z.number(),
        partySize: z.number().min(1).default(1),
        visitNotes: z.string().optional(),
        // 구매 정보 (선택 - 없으면 방문만 기록)
        amount: z.number().positive().optional(),
        discountAmount: z.number().min(0).default(0).optional(),
        finalAmount: z.number().positive().optional(),
        couponId: z.number().optional(),
        purchaseMemo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const now = new Date();
        const staffBranchCode = (ctx.user as typeof ctx.user & { branchCode?: string | null }).branchCode ?? null;

        // 1. 방문 기록
        await createVisit({
          memberId: input.memberId,
          visitedAt: now,
          partySize: input.partySize,
          notes: input.visitNotes,
          recordedByStaffId: ctx.user.id,
        });

        // 2. 쿠폰 사용 처리 (쿠폰 선택된 경우)
        if (input.couponId) {
          await useCoupon(input.couponId, ctx.user.id, "체크인 쿠폰 사용", staffBranchCode);
        }

        // 3. 구매 이력 + 적립금 (결제 금액 입력된 경우)
        if (input.amount && input.finalAmount) {
          await createPurchase({
            memberId: input.memberId,
            amount: String(input.amount),
            discountAmount: String(input.discountAmount ?? 0),
            finalAmount: String(input.finalAmount),
            couponId: input.couponId,
            memo: input.purchaseMemo,
            purchasedAt: now,
            recordedByStaffId: ctx.user.id,
          });
          // 적립금 자동 적립
          try {
            const purchases = await getPurchasesByMemberId(input.memberId);
            const latest = purchases[0];
            if (latest) await earnPoints(input.memberId, input.finalAmount, latest.id);
          } catch (err) {
            console.error("[체크인 적립금] 자동 적립 실패:", err);
          }
        }

        return { success: true };
      }),

    updateVisit: branchAdminProcedure
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

    deleteVisit: branchAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteVisit(input.id);
        return { success: true };
      }),

    // ─── 구매 이력 ──────────────────────────────────────────────────────────
    getPurchases: branchAdminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getPurchasesByMemberId(input.memberId);
      }),

    addPurchase: branchAdminProcedure
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
        // 구매 완료 시 자동 적립 (finalAmount 기준 3%)
        try {
          const { getPurchasesByMemberId: getPurchases } = await import("./db");
          const purchases = await getPurchases(input.memberId);
          const latest = purchases[0]; // 가장 최신 구매
          if (latest) {
            await earnPoints(input.memberId, input.finalAmount, latest.id);
          }
        } catch (err) {
          console.error("[적립금] 자동 적립 실패:", err);
        }
        return { success: true };
      }),

    updatePurchase: branchAdminProcedure
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

    deletePurchase: branchAdminProcedure
      .input(z.object({ id: z.number(), memberId: z.number() }))
      .mutation(async ({ input }) => {
        // 적립금 회수 (구매 취소)
        try {
          await cancelPoints(input.memberId, input.id);
        } catch (err) {
          console.error("[적립금] 회수 실패:", err);
        }
        await deletePurchase(input.id);
        return { success: true };
      }),

    // ─── 데이터 분석 ─────────────────────────────────────────────────────────
    getAnalytics: staffProcedure.query(async () => {
      const [memberStats, couponStats, purchaseStats] = await Promise.all([
        getMemberStats(),
        getCouponStats(),
        getPurchaseStats(),
      ]);
      return { memberStats, couponStats, purchaseStats };
    }),

    // 지점 코드 목록 조회
    listBranchCodes: staffProcedure.query(async () => {
      // branches 테이블 기반으로 변경 - 활성 지점만 반환
      const activeBranches = await listBranches(true);
      return activeBranches.map((b) => ({ code: b.code, name: b.name }));
    }),

    // 기간별 가입자 통계
    getMembersByPeriod: staffProcedure
      .input(z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupBy: z.enum(["day", "month"]).default("day"),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { members } = await import("../drizzle/schema");
        const { and, gte, lte, sql } = await import("drizzle-orm");
        const start = new Date(input.startDate + "T00:00:00");
        const end = new Date(input.endDate + "T23:59:59");
        const fmt = input.groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
        const result = await db
          .select({
            period: sql<string>`DATE_FORMAT(joinedAt, ${fmt})`,
            count: sql<number>`COUNT(*)`,
          })
          .from(members)
          .where(and(gte(members.joinedAt, start), lte(members.joinedAt, end)))
          .groupBy(sql`DATE_FORMAT(joinedAt, ${fmt})`)
          .orderBy(sql`DATE_FORMAT(joinedAt, ${fmt})`);
        return result;
      }),

    // 기간별 쿠폰 사용 통계 (지점 필터 포함)
    getCouponUsageByPeriod: staffProcedure
      .input(z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupBy: z.enum(["day", "month"]).default("day"),
        branchCode: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { coupons } = await import("../drizzle/schema");
        const { and, gte, lte, eq, sql } = await import("drizzle-orm");
        const start = new Date(input.startDate + "T00:00:00");
        const end = new Date(input.endDate + "T23:59:59");
        const fmt = input.groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
        const conditions: ReturnType<typeof eq>[] = [
          eq(coupons.status, "used") as ReturnType<typeof eq>,
          gte(coupons.usedAt, start) as unknown as ReturnType<typeof eq>,
          lte(coupons.usedAt, end) as unknown as ReturnType<typeof eq>,
        ];
        if (input.branchCode) conditions.push(eq(coupons.usedBranchCode, input.branchCode) as ReturnType<typeof eq>);
        const result = await db
          .select({
            period: sql<string>`DATE_FORMAT(usedAt, ${fmt})`,
            count: sql<number>`COUNT(*)`,
            type: coupons.type,
          })
          .from(coupons)
          .where(and(...conditions))
          .groupBy(sql`DATE_FORMAT(usedAt, ${fmt})`, coupons.type)
          .orderBy(sql`DATE_FORMAT(usedAt, ${fmt})`);
        return result;
      }),

    // Raw data 다운로드 - 가입자
    exportMembers: staffProcedure
      .input(z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { members } = await import("../drizzle/schema");
        const { and, gte, lte } = await import("drizzle-orm");
        const conditions = [];
        if (input.startDate) conditions.push(gte(members.joinedAt, new Date(input.startDate + "T00:00:00")));
        if (input.endDate) conditions.push(lte(members.joinedAt, new Date(input.endDate + "T23:59:59")));
        return db
          .select({
            id: members.id,
            name: members.name,
            email: members.email,
            phone: members.phone,
            birthDate: members.birthDate,
            marketingConsent: members.marketingConsent,
            status: members.status,
            joinedAt: members.joinedAt,
          })
          .from(members)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(members.joinedAt);
      }),

    // Raw data 다운로드 - 쿠폰 사용 (지점 필터 포함)
    exportCouponUsage: staffProcedure
      .input(z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        branchCode: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { coupons, members } = await import("../drizzle/schema");
        const { and, gte, lte, eq } = await import("drizzle-orm");
        const conditions: ReturnType<typeof eq>[] = [eq(coupons.status, "used") as ReturnType<typeof eq>];
        if (input.startDate) conditions.push(gte(coupons.usedAt, new Date(input.startDate + "T00:00:00")) as unknown as ReturnType<typeof eq>);
        if (input.endDate) conditions.push(lte(coupons.usedAt, new Date(input.endDate + "T23:59:59")) as unknown as ReturnType<typeof eq>);
        if (input.branchCode) conditions.push(eq(coupons.usedBranchCode, input.branchCode) as ReturnType<typeof eq>);
        return db
          .select({
            couponId: coupons.id,
            couponCode: coupons.code,
            couponName: coupons.name,
            couponType: coupons.type,
            discountPercent: coupons.discountPercent,
            memberName: members.name,
            memberEmail: members.email,
            memberPhone: members.phone,
            usedAt: coupons.usedAt,
            usedBranchCode: coupons.usedBranchCode,
          })
          .from(coupons)
          .leftJoin(members, eq(coupons.memberId, members.id))
          .where(and(...conditions))
          .orderBy(coupons.usedAt);
      }),

    // 생일 쿠폰 수동 발급 (스케줄러 대용)
    issueBirthdayCoupons: branchAdminProcedure.mutation(async () => {
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

    // ─── 스태프 관리 (admin 전용) ──────────────────────────────────────────
    listStaff: superAdminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          roleFilter: z.enum(["user", "admin", "branch_admin", "staff"]).optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return [];
        const { users } = await import("../drizzle/schema");
        const { ne, and, or, like, eq } = await import("drizzle-orm");

        const conditions: ReturnType<typeof ne>[] = [ne(users.role, "user" as const)];

        if (input.roleFilter) {
          conditions.push(eq(users.role, input.roleFilter as typeof users.role._.data) as ReturnType<typeof ne>);
        }

        if (input.search) {
          conditions.push(
            or(
              like(users.name, `%${input.search}%`),
              like(users.email, `%${input.search}%`)
            ) as unknown as ReturnType<typeof ne>
          );
        }

        return db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            branchCode: users.branchCode,
            lastSignedIn: users.lastSignedIn,
          })
          .from(users)
          .where(and(...conditions))
          .orderBy(users.createdAt);
      }),

    updateStaff: superAdminProcedure
      .input(
        z.object({
          id: z.number(),
          branchCode: z.string().max(20).nullable(),
          role: z.enum(["user", "admin", "branch_admin", "staff"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await db
          .update(users)
          .set({
            ...(input.branchCode !== undefined ? { branchCode: input.branchCode } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
          })
          .where(eq(users.id, input.id));
        return { success: true };
      }),

    // ─── 권한 관리 (admin 전용) ──────────────────────────────────────────
    listUsers: superAdminProcedure
      .input(z.object({
        search: z.string().optional(),
        role: z.enum(["user", "branch_admin", "staff", "admin"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return { items: [], total: 0 };
        const { eq, like, or, and, desc, sql } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        const conditions = [];
        if (input.role) conditions.push(eq(users.role, input.role));
        if (input.search) {
          conditions.push(or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`)
          ));
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const [items, countResult] = await Promise.all([
          db.select().from(users).where(where).orderBy(desc(users.lastSignedIn)).limit(input.limit).offset(input.offset),
          db.select({ count: sql<number>`count(*)` }).from(users).where(where),
        ]);
        return { items, total: Number(countResult[0]?.count ?? 0) };
      }),

    updateUserRole: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["user", "branch_admin", "staff", "admin"]),
        branchCode: z.string().max(20).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 자기 자신의 어드민 권한은 변경 불가
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "자신의 권한은 변경할 수 없습니다." });
        }
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await db.update(users).set({
          role: input.role,
          branchCode: input.branchCode ?? null,
        }).where(eq(users.id, input.userId));
        return { success: true };
      }),

    // ─── 적립 누락 모니터링 ──────────────────────────────────────────────────
    getPointsMissingStats: adminProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return { todayPurchases: 0, todayEarns: 0, missingCount: 0, missingItems: [] };
      const { sql } = await import("drizzle-orm");

      // 오늘 날짜 범위 (KST 기준)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [todayPurchasesResult, todayEarnsResult, missingResult] = await Promise.all([
        // 오늘 구매 건수 (finalAmount > 0)
        db.execute(sql`SELECT COUNT(*) as cnt FROM purchases WHERE finalAmount > 0 AND purchasedAt >= ${todayStart} AND purchasedAt <= ${todayEnd}`),
        // 오늘 적립 건수
        db.execute(sql`SELECT COUNT(*) as cnt FROM points WHERE type = 'earn' AND createdAt >= ${todayStart} AND createdAt <= ${todayEnd}`),
        // 누락 목록 (구매 있는데 적립 없는 건, 단 calcEarnPoints > 0인 경우만)
        db.execute(sql`
          SELECT p.id as purchaseId, p.memberId, p.finalAmount, p.purchasedAt,
                 m.name as memberName, m.email as memberEmail
          FROM purchases p
          LEFT JOIN points pt ON pt.purchaseId = p.id AND pt.type = 'earn'
          LEFT JOIN members m ON m.id = p.memberId
          WHERE p.finalAmount >= 3400
          AND pt.id IS NULL
          AND p.status != 'cancelled'
          ORDER BY p.purchasedAt DESC
          LIMIT 50
        `),
      ]);

      const purchaseRows = Array.isArray(todayPurchasesResult[0]) ? todayPurchasesResult[0] as Record<string,unknown>[] : [];
      const earnRows = Array.isArray(todayEarnsResult[0]) ? todayEarnsResult[0] as Record<string,unknown>[] : [];
      const todayPurchases = Number(purchaseRows[0]?.cnt ?? 0);
      const todayEarns = Number(earnRows[0]?.cnt ?? 0);
      const missingRaw = Array.isArray(missingResult[0]) ? missingResult[0] as unknown[] : [];
      const missingItems = missingRaw.map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return {
          purchaseId: Number(row.purchaseId),
          memberId: Number(row.memberId),
          finalAmount: Number(row.finalAmount),
          purchasedAt: row.purchasedAt as Date,
          memberName: row.memberName as string | null,
          memberEmail: row.memberEmail as string | null,
          expectedPoints: Math.floor(Number(row.finalAmount) * 3 / 100) * 100,
        };
      });

      return {
        todayPurchases,
        todayEarns,
        missingCount: missingItems.length,
        missingItems,
      };
    }),

    // 누락 적립 수동 보정
    fixMissingPoint: adminProcedure
      .input(z.object({ purchaseId: z.number() }))
      .mutation(async ({ input }) => {
        const { earnPoints } = await import("./db");
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { sql } = await import("drizzle-orm");
        // 구매 정보 조회
        const result = await db.execute(sql`SELECT * FROM purchases WHERE id = ${input.purchaseId} LIMIT 1`);
        const rows = Array.isArray(result[0]) ? result[0] as unknown[] : [];
        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "구매 기록을 찾을 수 없습니다." });
        const purchase = rows[0] as Record<string, unknown>;
        // 이미 적립됐는지 확인
        const existing = await db.execute(sql`SELECT id FROM points WHERE purchaseId = ${input.purchaseId} AND type = 'earn' LIMIT 1`);
        const existingRows = Array.isArray(existing[0]) ? existing[0] as unknown[] : [];
        if (existingRows.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "이미 적립된 구매입니다." });
        await earnPoints(Number(purchase.memberId), Number(purchase.finalAmount), input.purchaseId, "누락 적립 수동 보정");
        return { success: true };
      }),

    // ─── 알림톡 발송 로그 ──────────────────────────────────────────────────
    listAlimtalkLogs: staffProcedure
      .input(z.object({
        type: z.string().optional(),
        status: z.enum(["success", "failed"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        return listAlimtalkLogs(input);
      }),

    // ─── 지점 관리 (admin 전용) ──────────────────────────────────────────────
    listBranches: adminProcedure.query(async () => {
      return listBranches();
    }),

    createBranch: superAdminProcedure
      .input(z.object({
        code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, "영문 대문자, 숫자, 언더스코어만 사용 가능합니다"),
        name: z.string().min(1).max(100),
        address: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getBranchByCode(input.code);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "이미 존재하는 지점 코드입니다." });
        await createBranch({ code: input.code, name: input.name, address: input.address, phone: input.phone });
        return { success: true };
      }),

    updateBranch: superAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        address: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateBranch(id, data);
        return { success: true };
      }),

    deleteBranch: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBranch(input.id);
        return { success: true };
      }),

    // ─── 고객 문의 관리 ──────────────────────────────────────────────────
    listInquiries: staffProcedure
      .input(z.object({
        status: z.enum(["pending", "answered", "closed"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        return listInquiries(input);
      }),

    replyInquiry: staffProcedure
      .input(z.object({
        id: z.number(),
        adminReply: z.string().min(1),
        status: z.enum(["answered", "closed"]).default("answered"),
      }))
      .mutation(async ({ input }) => {
        // 답변 저장 전 문의 정보 조회
        const { inquiries } = await import("../drizzle/schema");
        const { getDb: getDbFn } = await import("./db");
        const { eq: eqFn } = await import("drizzle-orm");
        const dbInst = await getDbFn();
        const inquiryRows = dbInst ? await dbInst.select().from(inquiries).where(eqFn(inquiries.id, input.id)).limit(1) : [];
        const inquiry = inquiryRows[0];

        await replyInquiry(input.id, input.adminReply, input.status);

        // 답변 이메일 자동 발송 (비동기, 실패 시 무시)
        if (inquiry) {
          import("./email").then(({ sendInquiryReplyEmail }) => {
            sendInquiryReplyEmail({
              to: inquiry.email,
              name: inquiry.name,
              subject: inquiry.subject,
              originalContent: inquiry.content,
              adminReply: input.adminReply,
            }).catch((err) => console.error("[문의 답변 이메일] 발송 실패:", err));
          }).catch(() => {});
        }

        return { success: true };
      }),

    // ─── 적립금 관리 ──────────────────────────────────────────────────
    getPointsByMember: branchAdminProcedure
      .input(z.object({ memberId: z.number() }))
      .query(async ({ input }) => {
        return getPointsByMemberId(input.memberId);
      }),

    usePoints: branchAdminProcedure
      .input(z.object({
        memberId: z.number(),
        amount: z.number().min(10000).multipleOf(10000),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await usePoints(input.memberId, input.amount, input.note);
        return { success: true, ...result };
      }),

    calcPoints: branchAdminProcedure
      .input(z.object({ finalAmount: z.number() }))
      .query(async ({ input }) => {
        return { earned: calcEarnPoints(input.finalAmount) };
      }),
  }),
});

export type AppRouter = typeof appRouter;
