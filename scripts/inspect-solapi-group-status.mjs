import { SolapiMessageService } from "solapi";

const groupId = process.argv.find((arg) => arg.startsWith("--group="))?.split("=")[1];
if (!groupId) throw new Error("Use --group=<SOLAPI_GROUP_ID>.");
const groupOnly = process.argv.includes("--group-only");

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");

const client = new SolapiMessageService(apiKey, apiSecret);
async function withRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

const group = await withRetry(() => client.getGroup(groupId));
const outcomeSummary = groupOnly
  ? null
  : Object.values((await withRetry(() => client.getGroupMessages(groupId, { limit: 1000 }))).messageList).reduce((summary, message) => {
      const key = `${message.statusCode ?? "unknown"}|${message.statusMessage ?? ""}`;
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {});

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  groupId: group.groupId,
  status: group.status,
  scheduledDate: group.scheduledDate ?? null,
  dateCreated: group.dateCreated ?? null,
  dateSent: group.dateSent ?? null,
  dateCompleted: group.dateCompleted ?? null,
  count: group.count,
  countForCharge: group.countForCharge,
  balance: group.balance?.balance ?? null,
  price: group.price ?? null,
  outcomeSummary,
}, null, 2));
