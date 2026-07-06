import { drizzle } from 'drizzle-orm/mysql2';
import { like, or } from 'drizzle-orm';
import { members, coupons } from '../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  // 최기홍 검색
  const result = await db.select({
    id: members.id,
    name: members.name,
    email: members.email,
    phone: members.phone,
    status: members.status,
    joinedAt: members.joinedAt,
  }).from(members).where(
    or(like(members.name, '%최기홍%'), like(members.name, '%기홍%'))
  );
  console.log('=== 최기홍 검색 결과 ===');
  console.log(JSON.stringify(result, null, 2));

  // 전체 회원 현황
  const all = await db.select({
    id: members.id,
    name: members.name,
    status: members.status,
    joinedAt: members.joinedAt,
  }).from(members).orderBy(members.joinedAt);

  console.log('\n=== 전체 회원 현황 ===');
  console.log('전체:', all.length);
  console.log('활성:', all.filter(m => m.status === 'active').length);
  console.log('비활성:', all.filter(m => m.status === 'inactive').length);
  console.log('탈퇴:', all.filter(m => m.status === 'withdrawn').length);

  // 쿠폰 없는 활성 회원 (데이터 누락 의심)
  const allCoupons = await db.select({ memberId: coupons.memberId }).from(coupons);
  const memberIdsWithCoupons = new Set(allCoupons.map(c => c.memberId));
  const activeWithNoCoupons = all.filter(m => m.status === 'active' && !memberIdsWithCoupons.has(m.id));

  console.log('\n=== 쿠폰 미발급 활성 회원 (데이터 누락 의심) ===');
  if (activeWithNoCoupons.length === 0) {
    console.log('없음 - 모든 활성 회원에게 쿠폰 발급됨');
  } else {
    console.log(JSON.stringify(activeWithNoCoupons, null, 2));
  }

  // 최근 7일 가입자 목록
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = all.filter(m => new Date(m.joinedAt) >= sevenDaysAgo);
  console.log('\n=== 최근 7일 가입자 ===');
  console.log(JSON.stringify(recent.map(m => ({ id: m.id, name: m.name, status: m.status, joinedAt: m.joinedAt })), null, 2));
}

main().catch(console.error);
