import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error("SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다.");
}

const templates = [
  ["가입 완료", "KA01TP260825090221566j6JhiGwpOXe"],
  ["생일", "KA01TP260825090224708SxwklYNqZtx"],
  ["결혼기념일", "KA01TP260825090226041mnhFUOaAJe5"],
  ["콜키지 재발급", "KA01TP260825090226941JT4ubZqrcRx"],
  ["적립금 만료", "KA01TP260825090227818UvS6gnzuaLb"],
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
      variables: template.variables,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ purpose, templateId, error: String(error) }, null, 2));
  }
}
