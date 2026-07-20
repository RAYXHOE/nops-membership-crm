import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 1. 7/19 로그에서 콜키지만 성공하고 10% 할인 로그 없는 회원들 DB 확인
  const targetIds = [9300001, 9330001, 9330002, 9360001, 9390001, 9450001, 9480001, 9540001, 9570001, 9600001, 9630001, 9690001];
  
  const [members] = await db.execute(sql`
    SELECT id, name, email, marketingConsent, marketingConsentAt, joinedAt
    FROM members
    WHERE id IN (9300001, 9330001, 9330002, 9360001, 9390001, 9450001, 9480001, 9540001, 9570001, 9600001, 9630001, 9690001)
    ORDER BY joinedAt
  `);
  
  console.log('\n=== 7/19 콜키지만 로그된 회원 - DB 마케팅 동의 상태 ===');
  for (const m of members) {
    const joinedAt = new Date(m.joinedAt);
    const consentAt = m.marketingConsentAt ? new Date(m.marketingConsentAt) : null;
    const consentDelay = consentAt ? Math.round((consentAt - joinedAt) / 1000) : null;
    console.log(`  ${m.name} (${m.id}) | marketingConsent=${m.marketingConsent} | 가입:${joinedAt.toISOString().slice(11,19)} | 동의저장:${consentAt ? consentAt.toISOString().slice(11,19) : 'null'} | 동의지연:${consentDelay !== null ? consentDelay+'초' : 'N/A'}`);
  }
  
  // 2. 해당 회원들의 쿠폰 발급 현황
  const [coupons] = await db.execute(sql`
    SELECT memberId, type, code, issuedAt, description
    FROM coupons
    WHERE memberId IN (9300001, 9330001, 9330002, 9360001, 9390001, 9450001, 9480001, 9540001, 9570001, 9600001, 9630001, 9690001)
    ORDER BY memberId, issuedAt
  `);
  
  console.log('\n=== 해당 회원들 쿠폰 발급 현황 ===');
  let currentId = null;
  for (const c of coupons) {
    if (c.memberId !== currentId) {
      currentId = c.memberId;
      console.log(`\n  회원 ${c.memberId}:`);
    }
    console.log(`    [${c.type}] ${c.code} | ${new Date(c.issuedAt).toISOString().slice(11,19)} | ${c.description?.slice(0,40)}`);
  }
  
  // 3. 마케팅 동의 시각과 가입 시각 간격 분석 (전체 지연 건)
  const [delayAnalysis] = await db.execute(sql`
    SELECT 
      TIMESTAMPDIFF(SECOND, m.joinedAt, m.marketingConsentAt) as consent_delay_sec,
      TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) as coupon_delay_min,
      m.id, m.name
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
      AND TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) > 5
    ORDER BY coupon_delay_min DESC
    LIMIT 20
  `);
  
  console.log('\n=== 지연 건: 마케팅 동의 저장 시각 vs 쿠폰 발급 지연 ===');
  console.log('(동의 저장 지연이 크면 가입 시점에 marketingConsent=false였을 가능성)');
  for (const row of delayAnalysis) {
    const consentSec = row.consent_delay_sec;
    const couponMin = row.coupon_delay_min;
    const flag = consentSec !== null && consentSec > 5 ? '⚠️동의지연' : '동의즉시';
    console.log(`  ${row.name} (${row.id}) | 동의저장지연:${consentSec !== null ? consentSec+'초' : 'null'} | 쿠폰지연:${couponMin}분 | ${flag}`);
  }
  
  // 4. 동의 저장 지연 분포
  const [consentDist] = await db.execute(sql`
    SELECT 
      SUM(CASE WHEN TIMESTAMPDIFF(SECOND, m.joinedAt, m.marketingConsentAt) <= 5 THEN 1 ELSE 0 END) as consent_immediate,
      SUM(CASE WHEN TIMESTAMPDIFF(SECOND, m.joinedAt, m.marketingConsentAt) > 5 THEN 1 ELSE 0 END) as consent_delayed,
      SUM(CASE WHEN m.marketingConsentAt IS NULL THEN 1 ELSE 0 END) as consent_null,
      COUNT(*) as total
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
      AND TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) > 5
  `);
  
  const d = consentDist[0];
  console.log('\n=== 지연 발급 건의 마케팅 동의 저장 시각 분포 ===');
  console.log(`  동의 즉시 저장 (5초 이내): ${d.consent_immediate}건`);
  console.log(`  동의 지연 저장 (5초 초과): ${d.consent_delayed}건`);
  console.log(`  동의 저장 시각 null: ${d.consent_null}건`);
  console.log(`  전체: ${d.total}건`);
}

main().catch(console.error);
