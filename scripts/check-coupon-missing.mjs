import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and, inArray } from 'drizzle-orm';
import { members, coupons } from '../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 활성 회원 전체 조회
  const allActive = await db.select({
    id: members.id,
    name: members.name,
    email: members.email,
    phone: members.phone,
    marketingConsent: members.marketingConsent,
    joinedAt: members.joinedAt,
  }).from(members).where(eq(members.status, 'active'));

  // 전체 쿠폰 조회
  const allCoupons = await db.select({
    memberId: coupons.memberId,
    type: coupons.type,
    status: coupons.status,
  }).from(coupons);

  // 회원별 쿠폰 맵
  const couponMap = {};
  for (const c of allCoupons) {
    if (!couponMap[c.memberId]) couponMap[c.memberId] = [];
    couponMap[c.memberId].push({ type: c.type, status: c.status });
  }

  // 마케팅 동의 회원 중 10% 할인 쿠폰 미발급
  const marketingConsented = allActive.filter(m => m.marketingConsent);
  const missingDiscount = marketingConsented.filter(m => {
    const mc = couponMap[m.id] || [];
    return !mc.some(c => c.type === 'discount_percent' && c.status !== 'expired');
  });

  // 전체 회원 중 콜키지 프리 쿠폰 미발급
  const missingCorkage = allActive.filter(m => {
    const mc = couponMap[m.id] || [];
    return !mc.some(c => c.type === 'corkage_free' && c.status !== 'expired');
  });

  console.log('=== 마케팅 동의 회원 현황 ===');
  console.log(`마케팅 동의 회원: ${marketingConsented.length}명`);
  console.log(`10% 할인 쿠폰 미발급: ${missingDiscount.length}명`);

  if (missingDiscount.length > 0) {
    console.log('\n[10% 할인 쿠폰 미발급 회원 목록]');
    missingDiscount.forEach(m => {
      const mc = couponMap[m.id] || [];
      const types = mc.map(c => `${c.type}(${c.status})`).join(', ');
      console.log(`  - ${m.name} (${m.email}) | 가입: ${new Date(m.joinedAt).toLocaleDateString('ko-KR')} | 보유쿠폰: ${types || '없음'}`);
    });
  } else {
    console.log('✅ 모든 마케팅 동의 회원에게 10% 할인 쿠폰 발급됨');
  }

  console.log('\n=== 콜키지 프리 쿠폰 미발급 회원 ===');
  if (missingCorkage.length > 0) {
    console.log(`콜키지 프리 쿠폰 미발급: ${missingCorkage.length}명`);
    missingCorkage.forEach(m => {
      console.log(`  - ${m.name} (${m.email}) | 마케팅동의: ${m.marketingConsent ? '예' : '아니오'}`);
    });
  } else {
    console.log('✅ 모든 활성 회원에게 콜키지 프리 쿠폰 발급됨');
  }

  // 쿠폰이 아예 없는 회원
  const noCoupons = allActive.filter(m => !couponMap[m.id] || couponMap[m.id].length === 0);
  console.log('\n=== 쿠폰 전혀 없는 회원 ===');
  if (noCoupons.length > 0) {
    noCoupons.forEach(m => {
      console.log(`  - ${m.name} (${m.email}) | 마케팅동의: ${m.marketingConsent ? '예' : '아니오'} | 가입: ${new Date(m.joinedAt).toLocaleDateString('ko-KR')}`);
    });
  } else {
    console.log('✅ 없음');
  }
}

main().catch(console.error);
