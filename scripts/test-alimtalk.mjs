// 최채환 회원 테스트 알림톡 발송
import { drizzle } from "drizzle-orm/mysql2";
import { like, eq, and } from "drizzle-orm";
import { SolapiMessageService } from "solapi";
import { members, coupons } from "../drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

// 전화번호 정규화
function normalizePhone(phone) {
  let p = phone.replace(/-/g, "").replace(/\s/g, "");
  if (p.startsWith("+82")) p = "0" + p.slice(3);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

async function main() {

  // 최채환 회원 조회
  const result = await db.select().from(members)
    .where(and(like(members.name, "%최채환%"), eq(members.status, "active")))
    .limit(1);

  if (!result[0]) {
    console.error("최채환 회원을 찾을 수 없습니다.");
    process.exit(1);
  }

  const member = result[0];
  console.log("회원 정보:", { id: member.id, name: member.name, phone: member.phone });

  // 보유 쿠폰 조회
  const memberCoupons = await db.select().from(coupons)
    .where(and(eq(coupons.memberId, member.id), eq(coupons.status, "active")))
    .limit(3);

  console.log("보유 쿠폰:", memberCoupons.map(c => ({ name: c.name, code: c.code })));

  // 알림톡 발송
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_KAKAO_PFID;
  const templateId = process.env.SOLAPI_TEMPLATE_WELCOME;
  const sender = normalizePhone(process.env.SOLAPI_SENDER_PHONE || "");

  if (!apiKey || !apiSecret) {
    console.error("SOLAPI 환경변수 미설정");
    process.exit(1);
  }

  const client = new SolapiMessageService(apiKey, apiSecret);
  const couponList = memberCoupons.map(c => `• ${c.name}: ${c.code}`).join("\n") || "• 쿠폰 없음";
  const to = normalizePhone(member.phone);

  console.log(`발송 대상: ${member.name} (${to})`);
  console.log(`발송 번호: ${sender}`);
  console.log(`템플릿 ID: ${templateId}`);

  try {
    const res = await client.send({
      to,
      from: sender,
      kakaoOptions: {
        pfId,
        templateId,
        variables: {
          "#{이름}": member.name,
          "#{쿠폰목록}": couponList,
          "#{링크}": "https://membership.nops.kr/mypage",
        },
      },
    });
    console.log("✅ 알림톡 발송 성공:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("❌ 알림톡 발송 실패:", err.message || err);
  }
}

main().catch(console.error);
