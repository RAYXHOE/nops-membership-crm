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

export async function getCouponTemplateByType(type: "discount_percent" | "corkage_free" | "birthday") {
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
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(coupons)
    .set({ status: "used", usedAt: new Date(), usedByStaffId: staffId, usedNote: note ?? null })
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

// 생일 쿠폰 발급 대상 조회 (오늘 생일인 회원 중 올해 쿠폰 미발급자)
export async function getMembersWithBirthdayToday() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();

  const result = await db
    .select({ member: members })
    .from(members)
    .where(
      and(
        eq(members.status, "active"),
        sql`MONTH(birthDate) = ${month}`,
        sql`DAY(birthDate) = ${day}`
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
