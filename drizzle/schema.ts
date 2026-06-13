import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  date,
} from "drizzle-orm/mysql-core";

// ─── Core Auth User (OAuth) ───────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "branch_admin", "staff", "admin"]).default("user").notNull(),
  // branch_admin: 지점 관리자 (회원/쿠폰 관리만)
  // staff: 본사 스태프 (마케팅/운영/지원팀 - 대시보드+데이터 분석 포함)
  // admin: 슬루퍼 어드민 (전체 + 권한 관리)
  branchCode: varchar("branchCode", { length: 20 }), // 지점 코드 (branch_admin 전용, 예: BRANCH_01, SINCHON)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Members (멤버십 회원) ─────────────────────────────────────────────────────
export const members = mysqlTable("members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }).notNull(),
  birthDate: date("birthDate").notNull(),
  // 개인정보 수집 동의
  privacyConsent: boolean("privacyConsent").notNull().default(false),
  privacyConsentAt: timestamp("privacyConsentAt"),
  privacyConsentContent: text("privacyConsentContent"),
  // 마케팅 수신 동의
  marketingConsent: boolean("marketingConsent").notNull().default(false),
  marketingConsentAt: timestamp("marketingConsentAt"),
  marketingConsentContent: text("marketingConsentContent"),
  // 상태
  status: mysqlEnum("status", ["active", "inactive", "withdrawn"]).default("active").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // 메모
  notes: text("notes"),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

// ─── Coupon Templates (쿠폰 템플릿) ──────────────────────────────────────────
export const couponTemplates = mysqlTable("coupon_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday"]).notNull(),
  discountPercent: int("discountPercent"),
  description: text("description"),
  validDays: int("validDays").notNull().default(365), // 발급 후 유효 기간(일)
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CouponTemplate = typeof couponTemplates.$inferSelect;
export type InsertCouponTemplate = typeof couponTemplates.$inferInsert;

// ─── Coupons (발급된 쿠폰) ─────────────────────────────────────────────────────
export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  templateId: int("templateId").notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday"]).notNull(),
  discountPercent: int("discountPercent"),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "used", "expired"]).default("active").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  usedByStaffId: int("usedByStaffId"), // 사용 처리한 운영자 user.id
  usedNote: text("usedNote"),
  // 생일 쿠폰의 경우 해당 연도 기록
  birthdayYear: int("birthdayYear"),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;

// ─── Visits (방문 기록) ────────────────────────────────────────────────────────
export const visits = mysqlTable("visits", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  visitedAt: timestamp("visitedAt").notNull(),
  partySize: int("partySize"),
  notes: text("notes"),
  recordedByStaffId: int("recordedByStaffId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Visit = typeof visits.$inferSelect;
export type InsertVisit = typeof visits.$inferInsert;

// ─── Purchases (구매 이력) ─────────────────────────────────────────────────────
export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  visitId: int("visitId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).default("0"),
  finalAmount: decimal("finalAmount", { precision: 10, scale: 2 }).notNull(),
  couponId: int("couponId"),
  memo: text("memo"),
  purchasedAt: timestamp("purchasedAt").notNull(),
  recordedByStaffId: int("recordedByStaffId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = typeof purchases.$inferInsert;

// ─── Consent Logs (동의 이력 - 법적 요건) ─────────────────────────────────────
export const consentLogs = mysqlTable("consent_logs", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  consentType: mysqlEnum("consentType", ["privacy", "marketing", "marketing_withdraw"]).notNull(),
  agreed: boolean("agreed").notNull(),
  consentContent: text("consentContent").notNull(), // 동의 당시 약관 전문
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConsentLog = typeof consentLogs.$inferSelect;
export type InsertConsentLog = typeof consentLogs.$inferInsert;
