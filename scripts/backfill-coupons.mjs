/**
 * 마케팅 동의 회원 중 10% 할인 쿠폰 미발급 회원에게 일괄 발급
 * 실행: cd /home/ubuntu/nobs-membership-crm && node scripts/backfill-coupons.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq, not, exists } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다.");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

// 테이블 정의 (간략)
const { mysqlTable, int, varchar, text, timestamp, mysqlEnum, boolean } = await import("drizzle-orm/mysql-core");

const members = mysqlTable("members", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["active", "inactive", "withdrawn"]).notNull().default("active"),
  marketingConsent: boolean("marketingConsent").notNull().default(false),
});

const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  memberId: int("memberId").notNull(),
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday", "anniversary", "employee"]).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  discountPercent: int("discountPercent"),
  description: text("description"),
  status: mysqlEnum("status", ["active", "used", "expired"]).notNull().default("active"),
  expiresAt: timestamp("expiresAt").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  templateId: int("templateId"),
});

const couponTemplates = mysqlTable("coupon_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["discount_percent", "corkage_free", "birthday", "anniversary", "employee"]).notNull(),
  discountPercent: int("discountPercent"),
  description: text("description"),
  validDays: int("validDays").notNull().default(365),
  isActive: boolean("isActive").notNull().default(true),
});

// 1. discount_percent 템플릿 조회
const [template] = await db
  .select()
  .from(couponTemplates)
  .where(eq(couponTemplates.type, "discount_percent"))
  .limit(1);

if (!template) {
  console.error("discount_percent 템플릿을 찾을 수 없습니다.");
  process.exit(1);
}

console.log(`템플릿 확인: ${template.name} (${template.discountPercent}% 할인, ${template.validDays}일)`);

// 2. 마케팅 동의 + 10% 쿠폰 미발급 회원 조회
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

console.log(`\n보정 대상 회원: ${missingMembers.length}명`);

if (missingMembers.length === 0) {
  console.log("보정할 회원이 없습니다.");
  process.exit(0);
}

// 3. 쿠폰 코드 생성 함수
function generateCode(prefix) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix + "-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 4. 일괄 발급
let issued = 0;
for (const member of missingMembers) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + template.validDays);

  const code = generateCode("NOPS");
  await db.insert(coupons).values({
    memberId: member.id,
    templateId: template.id,
    code,
    type: "discount_percent",
    name: template.name,
    discountPercent: template.discountPercent,
    description: "마케팅 동의 혜택 보정 발급 · " + (template.description ?? ""),
    status: "active",
    expiresAt,
  });

  console.log(`  ✅ ${member.name} (${member.email}) → ${code}`);
  issued++;
}

console.log(`\n완료: ${issued}명에게 10% 할인 쿠폰 발급`);
await connection.end();
