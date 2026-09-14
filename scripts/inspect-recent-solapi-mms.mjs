import { SolapiMessageService } from "solapi";

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error("SOLAPI API credentials are not configured.");
}

const client = new SolapiMessageService(apiKey, apiSecret);
const response = await client.getMessages({ limit: 100 });

const items = Object.values(response.messageList)
  .filter((message) => message.type === "MMS" || message.imageId)
  .sort((left, right) => String(right.dateCreated ?? "").localeCompare(String(left.dateCreated ?? "")))
  .slice(0, 10)
  .map((message) => ({
    type: message.type ?? null,
    imageId: message.imageId ?? null,
    subject: message.subject ?? null,
    textPreview: String(message.text ?? "").replace(/\s+/g, " ").slice(0, 160),
    dateCreated: message.dateCreated ?? null,
    statusCode: message.statusCode ?? null,
    statusMessage: message.statusMessage ?? null,
  }));

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), itemCount: items.length, items }, null, 2));
