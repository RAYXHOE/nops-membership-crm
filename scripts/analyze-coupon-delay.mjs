import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 1. 발급 지연 분포
  const [distResult] = await db.execute(sql`
    SELECT 
      SUM(CASE WHEN delay_minutes IS NULL THEN 1 ELSE 0 END) as missing,
      SUM(CASE WHEN delay_minutes <= 5 THEN 1 ELSE 0 END) as immediate,
      SUM(CASE WHEN delay_minutes > 5 AND delay_minutes <= 120 THEN 1 ELSE 0 END) as delayed_2h,
      SUM(CASE WHEN delay_minutes > 120 THEN 1 ELSE 0 END) as batch_corrected,
      COUNT(*) as total,
      ROUND(AVG(delay_minutes),1) as avg_delay_min,
      MAX(delay_minutes) as max_delay_min
    FROM (
      SELECT m.id, TIMESTAMPDIFF(MINUTE, m.joinedAt, MIN(c.issuedAt)) as delay_minutes
      FROM members m
      LEFT JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
      WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
      GROUP BY m.id, m.joinedAt
    ) t
  `);
  
  const dist = distResult[0];
  console.log('\n=== 쿠폰 발급 지연 분포 (7/5 이후 마케팅 동의 회원) ===');
  console.log(`전체: ${dist.total}명`);
  console.log(`즉시 발급 (5분 이내): ${dist.immediate}명`);
  console.log(`지연 발급 (2시간 이내): ${dist.delayed_2h}명`);
  console.log(`배치 보정 (2시간 초과): ${dist.batch_corrected}명`);
  console.log(`현재 미발급: ${dist.missing}명`);
  console.log(`평균 지연: ${dist.avg_delay_min}분`);
  console.log(`최대 지연: ${dist.max_delay_min}분`);

  // 2. 배치 보정된 회원들의 가입 시간대 분석
  const [timeResult] = await db.execute(sql`
    SELECT 
      HOUR(m.joinedAt) as join_hour_utc,
      COUNT(*) as count
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 
      AND m.joinedAt >= '2026-07-05'
      AND TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) > 5
    GROUP BY HOUR(m.joinedAt)
    ORDER BY count DESC
    LIMIT 10
  `);
  
  console.log('\n=== 지연 발급 회원의 가입 시간대 (UTC 기준) ===');
  for (const row of timeResult) {
    const kstHour = (row.join_hour_utc + 9) % 24;
    console.log(`  UTC ${row.join_hour_utc}시 (KST ${kstHour}시): ${row.count}명`);
  }

  // 3. 최근 배치 보정 건수 추이 (일별)
  const [dailyResult] = await db.execute(sql`
    SELECT 
      DATE(c.issuedAt) as issue_date,
      COUNT(*) as count,
      GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') as names
    FROM coupons c
    JOIN members m ON m.id = c.memberId
    WHERE c.type = 'discount_percent'
      AND c.description LIKE '%보정%'
      AND c.issuedAt >= '2026-07-05'
    GROUP BY DATE(c.issuedAt)
    ORDER BY issue_date DESC
    LIMIT 15
  `);
  
  console.log('\n=== 일별 배치 보정 발급 건수 ===');
  for (const row of dailyResult) {
    console.log(`  ${row.issue_date}: ${row.count}건 (${row.names?.slice(0,60)}...)`);
  }
}

main().catch(console.error);
