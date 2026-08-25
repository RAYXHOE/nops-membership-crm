import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const templateId = "KA01TP260825090227818UvS6gnzuaLb";

if (!apiKey || !apiSecret) {
  throw new Error("SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다.");
}

const corrected = {
  name: "NOPS 쿠폰 만료 알림",
  content: `안녕하세요, #{이름}님!

보유하신 NOP'S 쿠폰이 7일 후 만료됩니다.

📌 쿠폰명: #{쿠폰명}
⏰ 만료일: #{만료일}

멤버십 확인:
https://membership.nops.kr

Mr. 놉스 올림

※ 이 메시지는 고객님이 다운로드 받으신 쿠폰 안내 메시지입니다.
문의: 매장으로 직접 연락해 주세요.`,
  categoryCode: "999999",
  messageType: "BA",
  emphasizeType: "NONE",
};

if (process.argv[2] !== "--apply") {
  console.log(JSON.stringify({ templateId, corrected, dryRun: true }, null, 2));
  process.exit(0);
}

const client = new SolapiMessageService(apiKey, apiSecret);
const before = await client.getKakaoAlimtalkTemplate(templateId);

if (before.status === "INSPECTING") {
  await client.cancelInspectionKakaoAlimtalkTemplate(templateId);
}

const updated = await client.updateKakaoAlimtalkTemplate(templateId, corrected);
const after = await client.getKakaoAlimtalkTemplate(templateId);

console.log(JSON.stringify({
  templateId,
  previousStatus: before.status,
  updatedStatus: updated.status,
  confirmedStatus: after.status,
  name: after.name,
  content: after.content,
}, null, 2));
