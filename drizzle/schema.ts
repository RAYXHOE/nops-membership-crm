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
  anniversaryDate: date("anniversaryDate"), // 결혼기념일 (선택)
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
  // 적립금
  pointBalance: int("pointBalance").notNull().default(0),
});

export type Member = typeof members.$inferSelect;
export type InsertMember = typeof members.$inferInsert;

// ─── Coupon Templates (쿠폰 템플릿) ──────────────────────────────────────────
export const couponTemplates = mysqlTable("coupon_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday", "anniversary", "employee"]).notNull(),
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
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday", "anniversary", "employee"]).notNull(),
  discountPercent: int("discountPercent"),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "used", "expired"]).default("active").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  usedByStaffId: int("usedByStaffId"), // 사용 처리한 운영자 user.id
  usedBranchCode: varchar("usedBranchCode", { length: 20 }), // 사용 지점 코드
  usedNote: text("usedNote"),
  // 생일/결혼기념일 쿠폰의 경우 해당 연도 기록
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

// ─── OTP (마이페이지 인증) ─────────────────────────────────────────────────────
export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Branches (지점 마스터) ────────────────────────────────────────────────────
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(), // 지점 코드 (예: SINCHON)
  name: varchar("name", { length: 100 }).notNull(),         // 지점명 (예: 신촌점)
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

// ─── Alimtalk Logs (알림톡 발송 로그) ────────────────────────────────────────
export const alimtalkLogs = mysqlTable("alimtalk_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // welcome, expiry, anniversary, birthday, corkage
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  recipientName: varchar("recipientName", { length: 100 }),
  memberId: int("memberId"),
  templateId: varchar("templateId", { length: 100 }),
  variables: text("variables"), // JSON string
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type AlimtalkLog = typeof alimtalkLogs.$inferSelect;
export type InsertAlimtalkLog = typeof alimtalkLogs.$inferInsert;

// ─── Points (적립금 이력) ──────────────────────────────────────────────────────
export const points = mysqlTable("points", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  type: mysqlEnum("type", ["earn", "use", "expire", "cancel"]).notNull(),
  // earn: 적립(+), use: 사용(-), expire: 만료(-), cancel: 구매취소로 회수(-)
  amount: int("amount").notNull(), // 양수=적립, 음수=차감
  balanceAfter: int("balanceAfter").notNull().default(0),
  purchaseId: int("purchaseId"), // 연관 구매 이력 ID
  note: text("note"),
  expiresAt: timestamp("expiresAt"), // earn 타입만 사용 (2년 후)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Point = typeof points.$inferSelect;
export type InsertPoint = typeof points.$inferInsert;

// ─── Inquiries (고객 문의) ────────────────────────────────────────────────────
export const inquiries = mysqlTable("inquiries", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId"),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  category: mysqlEnum("category", ["coupon", "membership", "points", "other"]).notNull().default("other"),
  subject: varchar("subject", { length: 200 }).notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["pending", "answered", "closed"]).notNull().default("pending"),
  adminReply: text("adminReply"),
  repliedAt: timestamp("repliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiry = typeof inquiries.$inferInsert;
