import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error("SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다.");
}

const client = new SolapiMessageService(apiKey, apiSecret);
const { templateList } = await client.getKakaoAlimtalkTemplates({ limit: 100 });

for (const template of templateList) {
  console.log(JSON.stringify({
    templateId: template.templateId,
    name: template.name,
    status: template.status,
    content: template.content,
  }, null, 2));
}
