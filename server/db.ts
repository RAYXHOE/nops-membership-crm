import { and, desc, eq, gte, lte, sql, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  members,
  coupons,
  couponTemplates,
  visits,
  purchases,
  consentLogs,
  type InsertMember,
  type InsertCoupon,
  type InsertVisit,
  type InsertPurchase,
  type InsertConsentLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Auth User ────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Members ──────────────────────────────────────────────────────────────────
export async function createMember(data: InsertMember) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(members).values(data);
  return result[0];
}

export async function getMemberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return result[0];
}

export async function getMemberByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(members).where(eq(members.email, email)).limit(1);
  return result[0];
}

export async function getMemberByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  // 전화번호 숫자만 비교 (하이픈 제거)
  const normalized = phone.replace(/[^0-9]/g, "");
  const result = await db.select().from(members)
    .where(eq(members.phone, phone))
    .limit(1);
  if (result[0]) return result[0];
  // 숫자만 저장된 경우도 체크
  const result2 = await db.select().from(members)
    .where(eq(members.phone, normalized))
    .limit(1);
  return result2[0];
}

export async function getMemberByNameAndPhone(name: string, phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = phone.replace(/[^0-9]/g, "");
  const { and, or } = await import("drizzle-orm");
  const result = await db.select().from(members)
    .where(and(
      eq(members.name, name),
      or(eq(members.phone, phone), eq(members.phone, normalized))
    ))
    .limit(1);
  return result[0];
}

export async function listMembers(opts?: {
  search?: string;
  status?: "active" | "inactive" | "withdrawn";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions = [];
  if (opts?.status) conditions.push(eq(members.status, opts.status));
  if (opts?.search) {
    conditions.push(
      or(
        like(members.name, `%${opts.search}%`),
        like(members.email, `%${opts.search}%`),
        like(members.phone, `%${opts.search}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(members)
      .where(where)
      .orderBy(desc(members.joinedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(where),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function updateMember(id: number, data: Partial<InsertMember>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(members).set(data).where(eq(members.id, id));
}

// ─── Coupon Templates ─────────────────────────────────────────────────────────
export async function listCouponTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(couponTemplates).where(eq(couponTemplates.isActive, true));
}

export async function getCouponTemplateByType(type: "discount_percent" | "corkage_free" | "birthday" | "anniversary" | "employee") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(couponTemplates)
    .where(and(eq(couponTemplates.type, type), eq(couponTemplates.isActive, true)))
    .limit(1);
  return result[0];
}

// ─── Coupons ──────────────────────────────────────────────────────────────────
export async function issueCoupon(data: InsertCoupon) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(coupons).values(data);
}

export async function getCouponsByMemberId(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(coupons)
    .where(eq(coupons.memberId, memberId))
    .orderBy(desc(coupons.issuedAt));
}

export async function getCouponByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return result[0];
}

export async function useCoupon(
  couponId: number,
  staffId: number,
  note?: string,
  branchCode?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(coupons)
    .set({
      status: "used",
      usedAt: new Date(),
      usedByStaffId: staffId,
      usedNote: note ?? null,
      usedBranchCode: branchCode ?? null,
    })
    .where(and(eq(coupons.id, couponId), eq(coupons.status, "active")));
}

export async function listAllCoupons(opts?: {
  memberId?: number;
  status?: "active" | "used" | "expired";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions = [];
  if (opts?.memberId) conditions.push(eq(coupons.memberId, opts.memberId));
  if (opts?.status) conditions.push(eq(coupons.status, opts.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [items, countResult] = await Promise.all([
    db
      .select({
        coupon: coupons,
        memberName: members.name,
        memberEmail: members.email,
      })
      .from(coupons)
      .leftJoin(members, eq(coupons.memberId, members.id))
      .where(where)
      .orderBy(desc(coupons.issuedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(coupons).where(where),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function expireOverdueCoupons() {
  const db = await getDb();
  if (!db) return;
  await db
    .update(coupons)
    .set({ status: "expired" })
    .where(and(eq(coupons.status, "active"), lte(coupons.expiresAt, new Date())));
}

// ─── Visits ───────────────────────────────────────────────────────────────────
export async function createVisit(data: InsertVisit) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(visits).values(data);
  return result[0];
}

export async function getVisitsByMemberId(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(visits)
    .where(eq(visits.memberId, memberId))
    .orderBy(desc(visits.visitedAt));
}

export async function updateVisit(id: number, data: Partial<InsertVisit>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(visits).set(data).where(eq(visits.id, id));
}

export async function deleteVisit(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(visits).where(eq(visits.id, id));
}

// ─── Purchases ────────────────────────────────────────────────────────────────
export async function createPurchase(data: InsertPurchase) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(purchases).values(data);
  return result[0];
}

export async function getPurchasesByMemberId(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(purchases)
    .where(eq(purchases.memberId, memberId))
    .orderBy(desc(purchases.purchasedAt));
}

export async function updatePurchase(id: number, data: Partial<InsertPurchase>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(purchases).set(data).where(eq(purchases.id, id));
}

export async function deletePurchase(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(purchases).where(eq(purchases.id, id));
}

// ─── Consent Logs ─────────────────────────────────────────────────────────────
export async function createConsentLog(data: InsertConsentLog) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(consentLogs).values(data);
}

export async function getConsentLogsByMemberId(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(consentLogs)
    .where(eq(consentLogs.memberId, memberId))
    .orderBy(desc(consentLogs.createdAt));
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export async function getMemberStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalResult, activeResult, marketingResult, monthlyResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(members),
    db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.status, "active")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(members)
      .where(eq(members.marketingConsent, true)),
    db
      .select({
        month: sql<string>`DATE_FORMAT(joinedAt, '%Y-%m')`,
        count: sql<number>`count(*)`,
      })
      .from(members)
      .where(gte(members.joinedAt, sql`DATE_SUB(NOW(), INTERVAL 12 MONTH)`))
      .groupBy(sql`DATE_FORMAT(joinedAt, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(joinedAt, '%Y-%m')`),
  ]);

  return {
    total: Number(totalResult[0]?.count ?? 0),
    active: Number(activeResult[0]?.count ?? 0),
    marketingConsented: Number(marketingResult[0]?.count ?? 0),
    monthlyJoins: monthlyResult.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
  };
}

export async function getCouponStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalResult, usedResult, expiredResult, byTypeResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(coupons),
    db
      .select({ count: sql<number>`count(*)` })
      .from(coupons)
      .where(eq(coupons.status, "used")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(coupons)
      .where(eq(coupons.status, "expired")),
    db
      .select({
        type: coupons.type,
        total: sql<number>`count(*)`,
        used: sql<number>`sum(case when status = 'used' then 1 else 0 end)`,
      })
      .from(coupons)
      .groupBy(coupons.type),
  ]);

  const total = Number(totalResult[0]?.count ?? 0);
  const used = Number(usedResult[0]?.count ?? 0);

  return {
    total,
    used,
    expired: Number(expiredResult[0]?.count ?? 0),
    active: total - used - Number(expiredResult[0]?.count ?? 0),
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0,
    byType: byTypeResult.map((r) => ({
      type: r.type,
      total: Number(r.total),
      used: Number(r.used),
    })),
  };
}

export async function getPurchaseStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalResult, monthlyResult] = await Promise.all([
    db
      .select({
        totalAmount: sql<number>`sum(finalAmount)`,
        count: sql<number>`count(*)`,
      })
      .from(purchases),
    db
      .select({
        month: sql<string>`DATE_FORMAT(purchasedAt, '%Y-%m')`,
        amount: sql<number>`sum(finalAmount)`,
        count: sql<number>`count(*)`,
      })
      .from(purchases)
      .where(gte(purchases.purchasedAt, sql`DATE_SUB(NOW(), INTERVAL 12 MONTH)`))
      .groupBy(sql`DATE_FORMAT(purchasedAt, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(purchasedAt, '%Y-%m')`),
  ]);

  return {
    totalAmount: Number(totalResult[0]?.totalAmount ?? 0),
    totalCount: Number(totalResult[0]?.count ?? 0),
    monthly: monthlyResult.map((r) => ({
      month: r.month,
      amount: Number(r.amount),
      count: Number(r.count),
    })),
  };
}

// 만료 7일 전 활성 쿠폰 + 회원 이메일 조회 (알림 발송용)
export async function getCouponsExpiringInDays(days: number) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  // 정확히 'days일 후' 하루 전체를 조회 (00:00:00 ~ 23:59:59)
  const from = new Date(now);
  from.setDate(from.getDate() + days);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setHours(23, 59, 59, 999);

  const result = await db
    .select({
      coupon: coupons,
      memberName: members.name,
      memberEmail: members.email,
      memberPhone: members.phone,
      memberId: members.id,
    })
    .from(coupons)
    .leftJoin(members, eq(coupons.memberId, members.id))
    .where(
      and(
        eq(coupons.status, "active"),
        gte(coupons.expiresAt, from),
        lte(coupons.expiresAt, to)
      )
    );

  return result;
}

// 결혼기념일 쿠폰 발급 대상 조회 (이번 달 결혼기념일인 회원 중 올해 쿠폰 미발급자)
// 매월 1일에 실행 → 해당 월에 결혼기념일인 회원 전체 조회
export async function getMembersWithAnniversaryThisMonth() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  const result = await db
    .select({ member: members })
    .from(members)
    .where(
      and(
        eq(members.status, "active"),
        sql`MONTH(anniversaryDate) = ${month}`,
        sql`anniversaryDate IS NOT NULL`
      )
    );

  // 올해 이미 발급된 회원 필터링
  const filtered = [];
  for (const { member } of result) {
    const existing = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.memberId, member.id),
          eq(coupons.type, "anniversary"),
          eq(coupons.birthdayYear, year)
        )
      )
      .limit(1);
    if (existing.length === 0) filtered.push(member);
  }

  return filtered;
}

// 구 함수명 호환성 유지 (기존 코드와의 호환성)
export const getMembersWithAnniversaryToday = getMembersWithAnniversaryThisMonth;

// 생일 쿠폰 발급 대상 조회 (이번 달 생일인 회원 중 올해 쿠폰 미발급자)
// 매월 1일에 실행 → 해당 월에 생일인 회원 전체 조회
export async function getMembersWithBirthdayThisMonth() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  const result = await db
    .select({ member: members })
    .from(members)
    .where(
      and(
        eq(members.status, "active"),
        sql`MONTH(birthDate) = ${month}`
      )
    );

  // 올해 이미 발급된 회원 필터링
  const filtered = [];
  for (const { member } of result) {
    const existing = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.memberId, member.id),
          eq(coupons.type, "birthday"),
          eq(coupons.birthdayYear, year)
        )
      )
      .limit(1);
    if (existing.length === 0) filtered.push(member);
  }

  return filtered;
}

// 구 함수명 호환성 유지
export const getMembersWithBirthdayToday = getMembersWithBirthdayThisMonth;

// 콜키지 프리 쿠폰 사용 후 14일 된 회원 조회 (재발급 대상)
export async function getMembersForCorkageReissue() {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  // 14일 전 날짜 범위 (당일 00:00 ~ 23:59)
  const targetStart = new Date(now);
  targetStart.setDate(targetStart.getDate() - 14);
  targetStart.setHours(0, 0, 0, 0);

  const targetEnd = new Date(targetStart);
  targetEnd.setHours(23, 59, 59, 999);

  // 14일 전에 콜키지 프리 쿠폰을 사용한 회원 조회
  const usedCoupons = await db
    .select({
      memberId: coupons.memberId,
      usedAt: coupons.usedAt,
    })
    .from(coupons)
    .where(
      and(
        eq(coupons.type, "corkage_free"),
        eq(coupons.status, "used"),
        gte(coupons.usedAt, targetStart),
        lte(coupons.usedAt, targetEnd)
      )
    );

  // 이미 오늘 재발급된 회원 제외
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const filtered = [];
  for (const { memberId } of usedCoupons) {
    const member = await db
      .select()
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.status, "active")))
      .limit(1);

    if (!member[0]) continue;

    // 오늘 이미 재발급됐는지 확인
    const alreadyIssued = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.memberId, memberId),
          eq(coupons.type, "corkage_free"),
          eq(coupons.status, "active"),
          gte(coupons.issuedAt, todayStart)
        )
      )
      .limit(1);

    if (alreadyIssued.length === 0) {
      filtered.push(member[0]);
    }
  }

  return filtered;
}

// ─── OTP ──────────────────────────────────────────────────────────────────────
import { otpCodes } from "../drizzle/schema";

export async function createOtp(email: string, code: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분
  // 기존 미사용 OTP 삭제
  await db.delete(otpCodes).where(eq(otpCodes.email, email));
  await db.insert(otpCodes).values({ email, code, expiresAt });
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.code, code),
        eq(otpCodes.used, false),
        gte(otpCodes.expiresAt, new Date())
      )
    )
    .limit(1);
  if (result.length === 0) return false;
  // 사용 처리
  await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, result[0].id));
  return true;
}

export async function deleteExpiredOtps() {
  const db = await getDb();
  if (!db) return;
  await db.delete(otpCodes).where(lte(otpCodes.expiresAt, new Date()));
}

// ─── Branches ─────────────────────────────────────────────────────────────────
import { branches } from "../drizzle/schema";
import type { InsertBranch } from "../drizzle/schema";

export async function listBranches(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(branches).where(eq(branches.isActive, true)).orderBy(branches.name);
  }
  return db.select().from(branches).orderBy(branches.name);
}

export async function getBranchByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(branches).where(eq(branches.code, code)).limit(1);
  return result[0];
}

export async function createBranch(data: InsertBranch) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(branches).values(data);
}

export async function updateBranch(id: number, data: Partial<InsertBranch>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(branches).set(data).where(eq(branches.id, id));
}

export async function deleteBranch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(branches).where(eq(branches.id, id));
}

// ─── Alimtalk Logs ────────────────────────────────────────────────────────────
import { alimtalkLogs } from "../drizzle/schema";
import type { InsertAlimtalkLog } from "../drizzle/schema";

export async function createAlimtalkLog(data: InsertAlimtalkLog) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(alimtalkLogs).values(data);
  } catch (err) {
    // 로그 저장 실패는 무시 (알림톡 발송 자체에 영향 없음)
    console.error("[AlimtalkLog] Failed to save log:", err);
  }
}

export async function listAlimtalkLogs(opts?: {
  type?: string;
  status?: "success" | "failed";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { and, eq, desc, sql } = await import("drizzle-orm");
  const conditions: ReturnType<typeof eq>[] = [];
  if (opts?.type) conditions.push(eq(alimtalkLogs.type, opts.type) as ReturnType<typeof eq>);
  if (opts?.status) conditions.push(eq(alimtalkLogs.status, opts.status) as ReturnType<typeof eq>);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const [items, countResult] = await Promise.all([
    db.select().from(alimtalkLogs).where(where).orderBy(desc(alimtalkLogs.sentAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(alimtalkLogs).where(where),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

// ─── Points (적립금) ───────────────────────────────────────────────────────────
import { points } from "../drizzle/schema";
import type { InsertPoint } from "../drizzle/schema";

const POINT_RATE = 0.03; // 3% 적립
const POINT_MIN_USE = 10000; // 최소 사용 단위 1만원
const POINT_EXPIRE_YEARS = 2; // 유효기간 2년

/** 구매금액에서 적립금 계산 (원 단위, 100원 미만 절사) */
export function calcEarnPoints(amount: number): number {
  return Math.floor(amount * POINT_RATE / 100) * 100;
}

/** 적립금 적립 (구매 시 자동 호출) */
export async function earnPoints(memberId: number, purchaseAmount: number, purchaseId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const earnAmount = calcEarnPoints(purchaseAmount);
  if (earnAmount <= 0) return { earned: 0 };

  // 현재 잔액 조회
  const member = await getMemberById(memberId);
  if (!member) throw new Error("회원을 찾을 수 없습니다.");
  const newBalance = (member.pointBalance ?? 0) + earnAmount;

  // 만료일 계산 (2년 후)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + POINT_EXPIRE_YEARS);

  // 이력 기록
  await db.insert(points).values({
    memberId,
    type: "earn",
    amount: earnAmount,
    balanceAfter: newBalance,
    purchaseId,
    note: note ?? `구매 적립 (${purchaseAmount.toLocaleString()}원 × 3%)`,
    expiresAt,
  });

  // 잔액 업데이트
  await db.update(members).set({ pointBalance: newBalance }).where(eq(members.id, memberId));

  // 적립금 알림톡 발송 (비동기, 실패 시 무시)
  if (member.phone) {
    import("./kakao").then(({ sendPointsAlimtalk }) => {
      sendPointsAlimtalk({
        to: member.phone!,
        name: member.name ?? "고객",
        earnedAmount: earnAmount,
        balance: newBalance,
        expiresAt,
      }).catch((err) => console.error("[적립금 알림톡] 발송 실패:", err));
    }).catch(() => {});
  }

  return { earned: earnAmount, newBalance };
}

/** 구매 취소 시 적립금 회수 */
export async function cancelPoints(memberId: number, purchaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { and } = await import("drizzle-orm");

  // 해당 구매의 적립 이력 조회
  const earnLog = await db.select().from(points)
    .where(and(eq(points.memberId, memberId), eq(points.purchaseId, purchaseId), eq(points.type, "earn")))
    .limit(1);
  if (!earnLog[0]) return { cancelled: 0 };

  const earnAmount = earnLog[0].amount;
  const member = await getMemberById(memberId);
  if (!member) throw new Error("회원을 찾을 수 없습니다.");
  const newBalance = Math.max(0, (member.pointBalance ?? 0) - earnAmount);

  await db.insert(points).values({
    memberId,
    type: "cancel",
    amount: -earnAmount,
    balanceAfter: newBalance,
    purchaseId,
    note: "구매 취소로 인한 적립금 회수",
  });

  await db.update(members).set({ pointBalance: newBalance }).where(eq(members.id, memberId));
  return { cancelled: earnAmount, newBalance };
}

/** 적립금 사용 처리 */
export async function usePoints(memberId: number, useAmount: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  if (useAmount < POINT_MIN_USE) throw new Error(`최소 사용 금액은 ${POINT_MIN_USE.toLocaleString()}원입니다.`);
  if (useAmount % POINT_MIN_USE !== 0) throw new Error(`${POINT_MIN_USE.toLocaleString()}원 단위로만 사용 가능합니다.`);

  const member = await getMemberById(memberId);
  if (!member) throw new Error("회원을 찾을 수 없습니다.");
  if ((member.pointBalance ?? 0) < useAmount) throw new Error("적립금이 부족합니다.");

  const newBalance = (member.pointBalance ?? 0) - useAmount;

  await db.insert(points).values({
    memberId,
    type: "use",
    amount: -useAmount,
    balanceAfter: newBalance,
    note: note ?? "적립금 사용",
  });

  await db.update(members).set({ pointBalance: newBalance }).where(eq(members.id, memberId));
  return { used: useAmount, newBalance };
}

/** 회원 적립금 이력 조회 */
export async function getPointsByMemberId(memberId: number) {
  const db = await getDb();
  if (!db) return [];
  const { desc } = await import("drizzle-orm");
  return db.select().from(points).where(eq(points.memberId, memberId)).orderBy(desc(points.createdAt));
}

/** 만료 적립금 처리 (heartbeat 스케줄러용) */
export async function expirePoints() {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const { lte, and } = await import("drizzle-orm");
  const now = new Date();

  // 만료된 earn 이력에서 아직 expire 처리 안 된 것 조회
  const expiredEarns = await db.select().from(points)
    .where(and(eq(points.type, "earn"), lte(points.expiresAt, now)));

  let expired = 0;
  for (const earn of expiredEarns) {
    const member = await getMemberById(earn.memberId);
    if (!member || (member.pointBalance ?? 0) <= 0) continue;
    const expireAmount = Math.min(earn.amount, member.pointBalance ?? 0);
    const newBalance = Math.max(0, (member.pointBalance ?? 0) - expireAmount);
    await db.insert(points).values({
      memberId: earn.memberId,
      type: "expire",
      amount: -expireAmount,
      balanceAfter: newBalance,
      note: "유효기간 만료",
    });
    await db.update(members).set({ pointBalance: newBalance }).where(eq(members.id, earn.memberId));
    expired++;
  }
  return { expired };
}

// ─── Inquiries (고객 문의) ─────────────────────────────────────────────────────
import { inquiries } from "../drizzle/schema";
import type { InsertInquiry } from "../drizzle/schema";

export async function createInquiry(data: InsertInquiry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(inquiries).values(data);
}

export async function listInquiries(opts?: {
  status?: "pending" | "answered" | "closed";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { and, eq, desc, sql } = await import("drizzle-orm");
  const conditions: ReturnType<typeof eq>[] = [];
  if (opts?.status) conditions.push(eq(inquiries.status, opts.status) as ReturnType<typeof eq>);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const [items, countResult] = await Promise.all([
    db.select().from(inquiries).where(where).orderBy(desc(inquiries.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(inquiries).where(where),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function replyInquiry(id: number, adminReply: string, status: "answered" | "closed" = "answered") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(inquiries).set({ adminReply, status, repliedAt: new Date() }).where(eq(inquiries.id, id));
}
