import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 1. 44시간 지연 건 특정
  const [maxDelayResult] = await db.execute(sql`
    SELECT 
      m.id, m.name, m.email, m.phone,
      m.joinedAt,
      m.marketingConsent,
      c.id as couponId,
      c.code,
      c.type,
      c.description,
      c.issuedAt as couponIssuedAt,
      TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) as delay_minutes,
      TIMESTAMPDIFF(HOUR, m.joinedAt, c.issuedAt) as delay_hours
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
    ORDER BY delay_minutes DESC
    LIMIT 5
  `);
  
  console.log('\n=== 지연 상위 5건 ===');
  for (const row of maxDelayResult) {
    console.log(`\n회원: ${row.name} (${row.email})`);
    console.log(`  가입 시각: ${row.joinedAt}`);
    console.log(`  쿠폰 발급: ${row.couponIssuedAt}`);
    console.log(`  지연: ${row.delay_hours}시간 (${row.delay_minutes}분)`);
    console.log(`  쿠폰 코드: ${row.code}`);
    console.log(`  발급 설명: ${row.description}`);
  }

  // 2. 44시간 지연 건 - 해당 회원의 모든 쿠폰 이력 (타임스탬프 전체)
  const [topDelayMember] = await db.execute(sql`
    SELECT m.id, m.name, m.joinedAt
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
    ORDER BY TIMESTAMPDIFF(MINUTE, m.joinedAt, c.issuedAt) DESC
    LIMIT 1
  `);
  
  if (topDelayMember.length > 0) {
    const memberId = topDelayMember[0].id;
    const [allCoupons] = await db.execute(sql`
      SELECT id, code, type, status, description, issuedAt, expiresAt
      FROM coupons WHERE memberId = ${memberId}
      ORDER BY issuedAt ASC
    `);
    console.log(`\n=== ${topDelayMember[0].name} 전체 쿠폰 이력 ===`);
    console.log(`가입 시각: ${topDelayMember[0].joinedAt}`);
    for (const c of allCoupons) {
      console.log(`  [${c.type}] ${c.code} | ${c.issuedAt} | ${c.status} | ${c.description?.slice(0,40)}`);
    }
  }

  // 3. 지연 141건 각각의 가입 시각 vs 쿠폰 발급 시각 (5분~120분 사이)
  const [delayedList] = await db.execute(sql`
    SELECT 
      m.id, m.name, m.email,
      m.joinedAt,
      MIN(c.issuedAt) as couponIssuedAt,
      TIMESTAMPDIFF(MINUTE, m.joinedAt, MIN(c.issuedAt)) as delay_minutes,
      c.description
    FROM members m
    JOIN coupons c ON c.memberId = m.id AND c.type = 'discount_percent'
    WHERE m.status = 'active' AND m.marketingConsent = 1 AND m.joinedAt >= '2026-07-05'
    GROUP BY m.id, m.name, m.email, m.joinedAt
    HAVING delay_minutes > 5 AND delay_minutes <= 120
    ORDER BY delay_minutes DESC
    LIMIT 20
  `);
  
  console.log(`\n=== 지연 발급 건 (5분~2시간) 상위 20건 ===`);
  console.log(`총 ${delayedList.length}건 표시 (전체 중 상위 20건)`);
  for (const row of delayedList) {
    const joinTime = new Date(row.joinedAt);
    const couponTime = new Date(row.couponIssuedAt);
    const joinMin = joinTime.getMinutes();
    const couponMin = couponTime.getMinutes();
    // 쿠폰 발급 시각이 정각/30분에 가까우면 배치 스케줄러 가능성
    const isNearSchedule = couponMin <= 3 || couponMin >= 57 || (couponMin >= 28 && couponMin <= 32);
    console.log(`  ${row.name} | 가입:${joinTime.toISOString().slice(11,19)} → 발급:${couponTime.toISOString().slice(11,19)} | ${row.delay_minutes}분 | ${isNearSchedule ? '⚠️배치추정' : '즉시재시도'} | ${row.description?.slice(0,30)}`);
  }

  // 4. 배치 스케줄러 실행 시각 추정 (쿠폰 발급 시각 분포)
  const [schedulePattern] = await db.execute(sql`
    SELECT 
      MINUTE(c.issuedAt) as issue_minute,
      COUNT(*) as count
    FROM coupons c
    JOIN members m ON m.id = c.memberId
    WHERE c.type = 'discount_percent'
      AND c.description LIKE '%보정%'
      AND c.issuedAt >= '2026-07-05'
    GROUP BY MINUTE(c.issuedAt)
    ORDER BY count DESC
    LIMIT 10
  `);
  
  console.log('\n=== 배치 보정 쿠폰 발급 시각의 분(minute) 분포 ===');
  console.log('(특정 분에 집중되면 스케줄러 실행 시각 확인 가능)');
  for (const row of schedulePattern) {
    console.log(`  ${row.issue_minute}분: ${row.count}건`);
  }
}

main().catch(console.error);
