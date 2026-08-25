import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error("SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다.");
}

const templates = [
  ["환영(기존 설정)", process.env.SOLAPI_TEMPLATE_WELCOME ?? ""],
  ["환영(사용자 제공)", "KA01PF2606130432073595wo9wgbNi93"],
  ["콜키지 재발급(사용자 제공)", "KA01BP260618044632885CzSAp3UbbYl"],
  ["결혼기념일(사용자 제공)", "KA01BP260618043755237MERehwteXrR"],
  ["적립금 적립(사용자 제공)", "KA01TP260628095157812VA8ZwRjg0US"],
  ["쿠폰 만료 D-7(사용자 제공)", "KA01TP260613045247807Pwd7BtwUHcZ"],
];

const client = new SolapiMessageService(apiKey, apiSecret);

for (const [purpose, templateId] of templates) {
  try {
    const template = await client.getKakaoAlimtalkTemplate(templateId);
    console.log(JSON.stringify({
      purpose,
      templateId,
      name: template.name,
      status: template.status,
      content: template.content,
      buttons: template.buttons,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      purpose,
      templateId,
      error: String(error),
    }, null, 2));
  }
}
