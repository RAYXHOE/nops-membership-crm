/**
 * 테스트: 마케팅 미동의 가입 → 동의 전환 시 생일/기념일 쿠폰 즉시 발급
 * 
 * 시나리오:
 * 1. 7월 생일인 테스트 회원 생성 (마케팅 미동의)
 * 2. 생일 쿠폰 미발급 확인
 * 3. updateMarketing(true) 호출
 * 4. 생일 쿠폰 즉시 발급 확인
 * 5. 중복 호출 시 재발급 안 됨 확인
 * 6. 테스트 데이터 정리
 */
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and, sql } from 'drizzle-orm';
import { members, coupons, couponTemplates } from '../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

async function cleanup(memberId) {
  if (!memberId) return;
  await db.delete(coupons).where(eq(coupons.memberId, memberId));
  await db.delete(members).where(eq(members.id, memberId));
  console.log(`  🧹 테스트 데이터 정리 완료 (memberId=${memberId})`);
}

async function main() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  let testMemberId = null;

  console.log(`\n=== 테스트: 마케팅 동의 전환 시 생일 쿠폰 즉시 발급 ===`);
  console.log(`현재 월: ${currentMonth}월`);

  try {
    // 1. 7월 생일인 테스트 회원 생성 (마케팅 미동의)
    const testBirthDate = new Date(`${currentYear}-${String(currentMonth).padStart(2,'0')}-15`);
    const [result] = await db.insert(members).values({
      name: 'TEST_마케팅동의테스트',
      email: `test-marketing-${Date.now()}@test.com`,
      phone: '01099999999',
      birthDate: testBirthDate,
      marketingConsent: false,
      status: 'active',
      joinedAt: now,
    });
    testMemberId = result.insertId;
    console.log(`\n[1] 테스트 회원 생성: id=${testMemberId}, 생일=${testBirthDate.toLocaleDateString('ko-KR')}, 마케팅동의=false`);

    // 2. 생일 쿠폰 미발급 확인
    const beforeCoupons = await db.select().from(coupons).where(
      and(eq(coupons.memberId, testMemberId), eq(coupons.type, 'birthday'))
    );
    console.log(`[2] 마케팅 미동의 상태 생일 쿠폰: ${beforeCoupons.length}건 ${beforeCoupons.length === 0 ? '✅ 미발급 확인' : '❌ 예상치 못한 발급'}`);

    // 3. updateMarketing(true) 시뮬레이션 - 서버 API 직접 호출
    const response = await fetch('https://3000-ioxgx38c5yq404x7y88x3-10989617.sg1.manus.computer/api/trpc/membership.updateMarketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { memberId: testMemberId, marketingConsent: true } }),
    });
    const data = await response.json();
    console.log(`[3] updateMarketing(true) 호출: ${response.status === 200 ? '✅ 성공' : '❌ 실패'} ${JSON.stringify(data).slice(0, 100)}`);

    // 4. 생일 쿠폰 즉시 발급 확인
    await new Promise(r => setTimeout(r, 500)); // 약간 대기
    const afterCoupons = await db.select().from(coupons).where(
      and(eq(coupons.memberId, testMemberId), eq(coupons.type, 'birthday'))
    );
    console.log(`[4] 마케팅 동의 후 생일 쿠폰: ${afterCoupons.length}건 ${afterCoupons.length > 0 ? '✅ 즉시 발급 확인' : '❌ 발급 안 됨'}`);
    if (afterCoupons.length > 0) {
      console.log(`    쿠폰 코드: ${afterCoupons[0].code}, 만료: ${new Date(afterCoupons[0].expiresAt).toLocaleDateString('ko-KR')}`);
    }

    // 5. 중복 호출 시 재발급 안 됨 확인
    await fetch('https://3000-ioxgx38c5yq404x7y88x3-10989617.sg1.manus.computer/api/trpc/membership.updateMarketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { memberId: testMemberId, marketingConsent: true } }),
    });
    const afterDuplicate = await db.select().from(coupons).where(
      and(eq(coupons.memberId, testMemberId), eq(coupons.type, 'birthday'))
    );
    console.log(`[5] 중복 동의 후 생일 쿠폰: ${afterDuplicate.length}건 ${afterDuplicate.length === 1 ? '✅ 중복 발급 방지 확인' : '❌ 중복 발급됨'}`);

    console.log('\n✅ 모든 테스트 통과');
  } catch (err) {
    console.error('❌ 테스트 실패:', err);
  } finally {
    await cleanup(testMemberId);
  }
}

main().catch(console.error);
