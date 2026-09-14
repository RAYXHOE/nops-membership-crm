import { SolapiMessageService } from "solapi";

const groupId = process.argv.find((arg) => arg.startsWith("--group="))?.split("=")[1];
if (!groupId) throw new Error("Use --group=<SOLAPI_GROUP_ID>.");

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");

const client = new SolapiMessageService(apiKey, apiSecret);
const messages = [];
let startKey;
do {
  const response = await client.getMessages({ groupId, limit: 500, startKey });
  messages.push(...Object.values(response.messageList));
  startKey = response.nextKey ?? undefined;
} while (startKey);
const statusSummary = messages.reduce((summary, message) => {
  const key = `${message.statusCode ?? "unknown"}|${message.statusMessage ?? ""}`;
  summary[key] = (summary[key] ?? 0) + 1;
  return summary;
}, {});
const containsUnreplacedNameVariable = messages.filter((message) => String(message.text ?? "").includes("#{이름}")).length;
const containsAnyBracedVariable = messages.filter((message) => /#\{[^}]+}/.test(String(message.text ?? ""))).length;

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  groupId,
  messageCount: messages.length,
  containsUnreplacedNameVariable,
  containsAnyBracedVariable,
  statusSummary,
}, null, 2));
