import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 1. 가설 A 정량화: 지연 141건에서 콜키지 즉시 발급 + 10% 할인 지연 패턴 비율
  const [r1] = await db.execute(sql`
    SELECT
      COUNT(*) as total_delayed,
      SUM(CASE 
        WHEN cork_delay <= 5 AND disc_delay > 5 THEN 1 ELSE 0 
      END) as hypothesis_a_pattern,
      SUM(CASE 
        WHEN cork_delay > 5 AND disc_delay > 5 THEN 1 ELSE 0 
      END) as both_delayed,
      SUM(CASE 
        WHEN cork_delay <= 5 AND disc_delay <= 5 THEN 1 ELSE 0 
      END) as both_immediate
    FROM (
      SELECT 
        m.id,
        MIN(CASE WHEN c.type = 'corkage_free' THEN TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) END) as cork_delay,
        MIN(CASE WHEN c.type = 'discount_percent' THEN TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) END) as disc_delay
      FROM members m
      JOIN coupons c ON c.memberId = m.id AND c.type IN ('corkage_free', 'discount_percent')
      WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
      GROUP BY m.id, m.joinedAt
      HAVING disc_delay > 5
    ) t
  `);
  
  const row = r1[0];
  const total = parseInt(row.total_delayed);
  const hypA = parseInt(row.hypothesis_a_pattern);
  const bothD = parseInt(row.both_delayed);
  const bothI = parseInt(row.both_immediate);
  
  console.log('\n=== 가설 A 정량화 (지연 발급 건 분석) ===');
  console.log(`지연 발급 전체: ${total}건`);
  console.log(`가설 A 패턴 (콜키지 즉시 + 10%할인 지연): ${hypA}건 (${Math.round(hypA/total*100)}%)`);
  console.log(`둘 다 지연: ${bothD}건 (${Math.round(bothD/total*100)}%)`);
  console.log(`둘 다 즉시 (disc_delay>5 조건 모순, 0이어야 함): ${bothI}건`);

  // 2. 58분대 12건 원인 분석
  const [r2] = await db.execute(sql`
    SELECT 
      m.id, m.name, m.email,
      m.joinedAt,
      c.issuedAt as couponIssuedAt,
      TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) as delay_min,
      c.description,
      MINUTE(c.issuedAt) as issue_minute,
      HOUR(c.issuedAt) as issue_hour
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
      AND c.description LIKE '%보정%'
      AND MINUTE(c.issuedAt) BETWEEN 53 AND 59
    ORDER BY c.issuedAt ASC
    LIMIT 20
  `);
  
  console.log('\n=== 58분대 발급 건 상세 (보정 쿠폰, 53~59분) ===');
  for (const row of r2) {
    const joinTime = new Date(row.joinedAt);
    const couponTime = new Date(row.couponIssuedAt);
    console.log(`  ${row.name} | 가입:${joinTime.toISOString().slice(0,19)} → 발급:${couponTime.toISOString().slice(0,19)} | ${row.delay_min}분 지연 | 발급시각 ${row.issue_hour}:${row.issue_minute}`);
  }
  
  // 3. 58분대 발급 시각 패턴 - 어떤 시간대에 몰려있나
  const [r3] = await db.execute(sql`
    SELECT 
      HOUR(c.issuedAt) as hour_utc,
      MINUTE(c.issuedAt) as minute,
      COUNT(*) as cnt
    FROM coupons c
    WHERE c.type = 'discount_percent'
      AND c.description LIKE '%보정%'
      AND c.issuedAt >= '2026-07-05'
      AND MINUTE(c.issuedAt) BETWEEN 53 AND 59
    GROUP BY HOUR(c.issuedAt), MINUTE(c.issuedAt)
    ORDER BY cnt DESC
  `);
  
  console.log('\n=== 58분대 발급 시각 분포 (UTC) ===');
  for (const row of r3) {
    const kstHour = (parseInt(row.hour_utc) + 9) % 24;
    console.log(`  UTC ${row.hour_utc}:${row.minute} (KST ${kstHour}:${row.minute}): ${row.cnt}건`);
  }
  
  // 4. 스케줄러 실행 주기 확인 - 0분대와 58분대가 같은 스케줄러인지
  // check-missing-coupons: 0 0 */2 * * * (매 짝수 시 정각)
  // 58분대는 이전 스케줄러 실행 시 지연된 것인가?
  const [r4] = await db.execute(sql`
    SELECT 
      HOUR(c.issuedAt) as hour_utc,
      COUNT(*) as cnt
    FROM coupons c
    WHERE c.type = 'discount_percent'
      AND c.description LIKE '%보정%'
      AND c.issuedAt >= '2026-07-05'
      AND MINUTE(c.issuedAt) BETWEEN 53 AND 59
    GROUP BY HOUR(c.issuedAt)
    ORDER BY hour_utc
  `);
  
  console.log('\n=== 58분대 발급 시각 - 시(hour) 분포 ===');
  for (const row of r4) {
    const kstHour = (parseInt(row.hour_utc) + 9) % 24;
    console.log(`  UTC ${row.hour_utc}시 (KST ${kstHour}시): ${row.cnt}건`);
  }
}

main().catch(console.error);
