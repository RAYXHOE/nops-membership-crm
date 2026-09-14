import fs from "node:fs/promises";
import path from "node:path";
import { SolapiMessageService } from "solapi";
import { renderSeptemberComboMmsText, SEPTEMBER_COMBO_MMS_SUBJECT } from "./lib/september-combo-mms.mjs";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const SCHEDULED_DATE = "2026-09-15T15:00:00+09:00";
const CONFIRMED = process.argv.includes("--confirm-reservation");
const EXPECTED_IMAGE_ID = "ST01FZ260914061400154st0leVn7jRm";
const EXPECTED_SENDER = "025974030";
const ESTIMATED_MMS_UNIT_PRICE = 110;

function parseRecipientLine(line) {
  const match = line.trim().match(/^(010\d{8})\s+(.+)$/);
  if (!match) throw new Error("Recipient text file contains an invalid row.");
  return { to: match[1], name: match[2].trim() };
}

async function readBatch(manifest, batch) {
  const plan = manifest.schedulingPlan.find((item) => item.batch === batch);
  if (!plan) throw new Error(`Batch ${batch} plan is missing from manifest.`);
  const filename = `nops_sep_combo_2026_batch_${batch}_${plan.recipients}recipients.txt`;
  const contents = await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8");
  return contents.split(/\r?\n/).filter(Boolean).map(parseRecipientLine);
}

const manifest = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "manifest.json"), "utf8"));
const recipients = [...await readBatch(manifest, 2), ...await readBatch(manifest, 3)];
const phoneNumbers = new Set(recipients.map((recipient) => recipient.to));
if (recipients.length !== 1823 || phoneNumbers.size !== recipients.length) {
  throw new Error("Combined recipient count or de-duplication check failed.");
}

const messages = recipients.map((recipient) => ({
  to: recipient.to,
  from: null,
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  text: renderSeptemberComboMmsText(recipient.name),
  imageId: EXPECTED_IMAGE_ID,
  customFields: { campaignKey: "sep_combo_2026_v1", batch: "2+3" },
}));
const unresolvedVariables = messages.filter((message) => /#\{[^}]+}/.test(message.text)).length;
if (unresolvedVariables !== 0) throw new Error("Personalization preflight found unresolved MMS variables.");

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = String(process.env.SOLAPI_SENDER_PHONE ?? "").replace(/\D/g, "");
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");
if (sender !== EXPECTED_SENDER) throw new Error("Configured SOLAPI sender does not match 02-597-4030.");

const scheduledAt = new Date(SCHEDULED_DATE);
if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
  throw new Error("The configured reservation time must be in the future.");
}

const client = new SolapiMessageService(apiKey, apiSecret);
const balance = await client.getBalance();
const estimatedCost = recipients.length * ESTIMATED_MMS_UNIT_PRICE;
const preflight = {
  recipients: recipients.length,
  uniquePhones: phoneNumbers.size,
  scheduledDate: SCHEDULED_DATE,
  sender: "02-597-4030",
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  imageId: EXPECTED_IMAGE_ID,
  personalizationMode: "direct-text-rendering",
  personalizedRecipientCount: messages.length,
  unresolvedVariableCount: unresolvedVariables,
  hasManualOptOut: messages.every((message) => message.text.includes("080-500-4233")),
  estimatedMmsUnitPrice: ESTIMATED_MMS_UNIT_PRICE,
  estimatedCost,
  availableBalance: balance?.balance ?? null,
  estimatedBalanceAfterReservation: Number(balance?.balance ?? 0) - estimatedCost,
  userReportedDailyLimit: 3000,
  withinUserReportedDailyLimit: recipients.length <= 3000,
  mode: CONFIRMED ? "reserve" : "preflight-only",
};

if (!CONFIRMED) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}

if (Number(balance?.balance ?? 0) < estimatedCost) {
  throw new Error("SOLAPI balance is below the estimated reservation cost.");
}

const readyMessages = messages.map((message) => ({ ...message, from: sender }));
const response = await client.send(readyMessages, {
  allowDuplicates: false,
  showMessageList: false,
  scheduledDate: SCHEDULED_DATE,
});

console.log(JSON.stringify({
  ...preflight,
  groupId: response?.groupInfo?.groupId ?? null,
  status: response?.groupInfo?.status ?? null,
  registeredSuccess: response?.groupInfo?.count?.registeredSuccess ?? null,
  registeredFailed: response?.groupInfo?.count?.registeredFailed ?? null,
  scheduledDateReturned: response?.groupInfo?.scheduledDate ?? null,
  failedMessageCount: Array.isArray(response?.failedMessageList) ? response.failedMessageList.length : 0,
}, null, 2));
