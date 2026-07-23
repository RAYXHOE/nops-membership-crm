import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 1. 7/27 이후 즉시 발급률 (issueCouponWithRetry + tidb_replica_read=leader 적용 후)
  const [distAfter] = await db.execute(sql`
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
      WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-27'
      GROUP BY m.id, m.joinedAt
    ) t
  `);

  const after = distAfter[0];
  const immediateRate = after.total > 0 ? ((Number(after.immediate) / Number(after.total)) * 100).toFixed(1) : 'N/A';
  const batchRate = after.total > 0 ? ((Number(after.batch_corrected) / Number(after.total)) * 100).toFixed(1) : 'N/A';
  const missingRate = after.total > 0 ? ((Number(after.missing) / Number(after.total)) * 100).toFixed(1) : 'N/A';

  console.log('\n=== 7/27 이후 쿠폰 즉시 발급률 (issueCouponWithRetry + tidb_replica_read=leader 적용 후) ===');
  console.log(`분석 대상: 마케팅 동의 신규 가입자 ${after.total}명`);
  console.log(`즉시 발급 (5분 이내): ${after.immediate}명 → ${immediateRate}%`);
  console.log(`지연 발급 (5분~2시간): ${after.delayed_2h}명`);
  console.log(`배치 보정 (2시간 초과): ${after.batch_corrected}명 → ${batchRate}%`);
  console.log(`현재 미발급: ${after.missing}명 → ${missingRate}%`);
  if (after.total > 0) {
    console.log(`평균 지연: ${after.avg_delay_min}분`);
    console.log(`최대 지연: ${after.max_delay_min}분`);
  }

  // 2. 비교: 7/27 이전 (7/5~7/26)
  const [distBefore] = await db.execute(sql`
    SELECT 
      SUM(CASE WHEN delay_minutes IS NULL THEN 1 ELSE 0 END) as missing,
      SUM(CASE WHEN delay_minutes <= 5 THEN 1 ELSE 0 END) as immediate,
      SUM(CASE WHEN delay_minutes > 5 AND delay_minutes <= 120 THEN 1 ELSE 0 END) as delayed_2h,
      SUM(CASE WHEN delay_minutes > 120 THEN 1 ELSE 0 END) as batch_corrected,
      COUNT(*) as total,
      ROUND(AVG(delay_minutes),1) as avg_delay_min
    FROM (
      SELECT m.id, TIMESTAMPDIFF(MINUTE, m.joinedAt, MIN(c.issuedAt)) as delay_minutes
      FROM members m
      LEFT JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
      WHERE m.status = 'active' AND m.marketingConsent = 1
        AND m.joinedAt >= '2026-07-05' AND m.joinedAt < '2026-07-27'
      GROUP BY m.id, m.joinedAt
    ) t
  `);

  const before = distBefore[0];
  const beforeImmediateRate = before.total > 0 ? ((Number(before.immediate) / Number(before.total)) * 100).toFixed(1) : 'N/A';
  const beforeBatchRate = before.total > 0 ? ((Number(before.batch_corrected) / Number(before.total)) * 100).toFixed(1) : 'N/A';

  console.log('\n=== 비교: 7/5~7/26 (개선 전) ===');
  console.log(`분석 대상: ${before.total}명`);
  console.log(`즉시 발급 (5분 이내): ${before.immediate}명 → ${beforeImmediateRate}%`);
  console.log(`배치 보정 (2시간 초과): ${before.batch_corrected}명 → ${beforeBatchRate}%`);
  console.log(`평균 지연: ${before.avg_delay_min}분`);

  // 3. 7/27 이후 일별 상세
  const [dailyAfter] = await db.execute(sql`
    SELECT 
      DATE(m.joinedAt) as join_date,
      COUNT(*) as total,
      SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, m.joinedAt, MIN(c.issuedAt)) <= 5 THEN 1 ELSE 0 END) as immediate,
      SUM(CASE WHEN MIN(c.issuedAt) IS NULL THEN 1 ELSE 0 END) as missing
    FROM members m
    LEFT JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-27'
    GROUP BY DATE(m.joinedAt)
    ORDER BY join_date DESC
  `);

  if (dailyAfter[0]?.length > 0) {
    console.log('\n=== 7/27 이후 일별 즉시 발급률 ===');
    for (const row of dailyAfter[0]) {
      const rate = row.total > 0 ? ((Number(row.immediate) / Number(row.total)) * 100).toFixed(0) : 'N/A';
      const missingMark = Number(row.missing) > 0 ? ` ⚠️ 미발급 ${row.missing}명` : '';
      console.log(`  ${row.join_date}: ${row.total}명 중 즉시 ${row.immediate}명 (${rate}%)${missingMark}`);
    }
  } else {
    console.log('\n7/27 이후 가입자 없음 (아직 해당 날짜 미도래 또는 데이터 없음)');
  }

  // 4. 7/27 이후 배치 보정 건수
  const [batchAfter] = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM coupons c
    WHERE c.type = 'discount_percent'
      AND c.description LIKE '%보정%'
      AND c.issuedAt >= '2026-07-27'
  `);
  console.log(`\n7/27 이후 배치 보정 발급: ${batchAfter[0]?.count ?? 0}건`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
