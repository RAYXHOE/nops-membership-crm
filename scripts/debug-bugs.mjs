import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and, sql, like } from 'drizzle-orm';
import { members, coupons, couponTemplates } from '../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  console.log('='.repeat(60));
  console.log('버그 1 — 가입 쿠폰 미발급 점검');
  console.log('='.repeat(60));

  // 1-1. coupon_templates 테이블 전체 조회
  const allTemplates = await db.select().from(couponTemplates);
  console.log('\n[1-1] coupon_templates 전체 목록:');
  allTemplates.forEach(t => {
    console.log(`  id=${t.id} type=${t.type} name=${t.name} isActive=${t.isActive} discountPercent=${t.discountPercent} validDays=${t.validDays}`);
  });

  // 1-2. getCouponTemplateByType 시뮬레이션 (현재 코드 방식)
  console.log('\n[1-2] getCouponTemplateByType 시뮬레이션:');
  for (const type of ['discount_percent', 'corkage_free', 'birthday', 'anniversary', 'employee']) {
    // 현재 코드: sql`isActive = 1`
    const result = await db.select().from(couponTemplates).where(
      and(eq(couponTemplates.type, type), sql`${couponTemplates.isActive} = 1`)
    ).limit(1);
    console.log(`  type=${type}: ${result[0] ? `✅ 찾음 (id=${result[0].id}, name=${result[0].name})` : '❌ 찾지 못함'}`);
  }

  // 1-3. isActive 원시값 확인
  console.log('\n[1-3] isActive 원시값 직접 확인:');
  const rawCheck = await db.execute(sql`SELECT id, type, name, isActive, isActive+0 as isActiveInt FROM coupon_templates`);
  const rows = rawCheck[0];
  if (Array.isArray(rows)) {
    rows.forEach(r => console.log(`  id=${r.id} type=${r.type} isActive=${r.isActive} (int=${r.isActiveInt})`));
  }

  // 1-4. 최근 가입자 쿠폰 발급 현황 (오늘 가입)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMembers = await db.select({ id: members.id, name: members.name, marketingConsent: members.marketingConsent })
    .from(members).where(sql`joinedAt >= ${today}`);
  console.log(`\n[1-4] 오늘 가입자 ${todayMembers.length}명 쿠폰 현황:`);
  for (const m of todayMembers) {
    const mc = await db.select({ type: coupons.type, status: coupons.status }).from(coupons).where(eq(coupons.memberId, m.id));
    const types = mc.map(c => c.type).join(', ') || '없음';
    const hasCorkage = mc.some(c => c.type === 'corkage_free');
    const hasDiscount = mc.some(c => c.type === 'discount_percent');
    const marketingOk = !m.marketingConsent || hasDiscount;
    console.log(`  ${m.name}: 쿠폰=[${types}] 콜키지=${hasCorkage ? '✅' : '❌'} 10%=${hasDiscount ? '✅' : (m.marketingConsent ? '❌' : 'N/A')} ${marketingOk ? '' : '⚠️ 마케팅동의인데 10% 없음'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('버그 2 — 생일 쿠폰 미발급 점검');
  console.log('='.repeat(60));

  // 2-1. 이번 달 생일자 조회
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  console.log(`\n[2-1] 이번 달(${currentMonth}월) 생일자 조회:`);
  const birthdayMembers = await db.execute(
    sql`SELECT id, name, birthDate, marketingConsent FROM members WHERE MONTH(birthDate) = ${currentMonth} AND status = 'active' AND marketingConsent = 1`
  );
  const bRows = birthdayMembers[0];
  if (Array.isArray(bRows) && bRows.length > 0) {
    for (const m of bRows) {
      // 올해 생일 쿠폰 발급 여부 확인
      const existing = await db.execute(
        sql`SELECT id, code, status FROM coupons WHERE memberId = ${m.id} AND type = 'birthday' AND YEAR(issuedAt) = ${currentYear}`
      );
      const eRows = existing[0];
      const hasBirthday = Array.isArray(eRows) && eRows.length > 0;
      console.log(`  ${m.name}: 생일=${new Date(m.birthDate).toLocaleDateString('ko-KR')} 올해발급=${hasBirthday ? `✅ (${eRows[0].code})` : '❌ 미발급'}`);
    }
  } else {
    console.log(`  이번 달(${currentMonth}월) 생일자 없음`);
  }

  // 2-2. heartbeat 스케줄러 확인 (birthday-coupons-monthly)
  console.log('\n[2-2] heartbeat 스케줄러 확인:');
  console.log('  → 터미널에서 manus-heartbeat list 로 확인 필요');

  // 2-3. birthday 템플릿 확인
  console.log('\n[2-3] birthday 쿠폰 템플릿:');
  const birthdayTemplate = await db.select().from(couponTemplates).where(
    and(eq(couponTemplates.type, 'birthday'), sql`${couponTemplates.isActive} = 1`)
  ).limit(1);
  if (birthdayTemplate[0]) {
    console.log(`  ✅ 찾음: id=${birthdayTemplate[0].id} name=${birthdayTemplate[0].name} discountPercent=${birthdayTemplate[0].discountPercent}% validDays=${birthdayTemplate[0].validDays}`);
  } else {
    console.log('  ❌ birthday 템플릿 없음 또는 isActive=0');
  }

  // 2-4. birthdayYear 중복 체크 로직 확인 - 올해 발급된 birthday 쿠폰
  console.log(`\n[2-4] 올해(${currentYear}) 발급된 birthday 쿠폰 수:`);
  const birthdayCount = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM coupons WHERE type = 'birthday' AND YEAR(issuedAt) = ${currentYear}`
  );
  const bcRows = birthdayCount[0];
  console.log(`  올해 생일 쿠폰 발급 건수: ${Array.isArray(bcRows) ? bcRows[0].cnt : 'N/A'}건`);
}

main().catch(console.error);
