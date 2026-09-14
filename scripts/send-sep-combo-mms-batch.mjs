import fs from "node:fs/promises";
import path from "node:path";
import { SolapiMessageService } from "solapi";
import { renderSeptemberComboMmsText, SEPTEMBER_COMBO_MMS_SUBJECT } from "./lib/september-combo-mms.mjs";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const BATCH_NUMBER = Number(process.argv.find((arg) => arg.startsWith("--batch="))?.split("=")[1] ?? 1);
const CONFIRMED = process.argv.includes("--confirm-send");
const EXPECTED_IMAGE_ID = "ST01FZ260914061400154st0leVn7jRm";
const EXPECTED_SENDER = "025974030";
const SUBJECT = SEPTEMBER_COMBO_MMS_SUBJECT;

function parseRecipientLine(line) {
  const match = line.trim().match(/^(010\d{8})\s+(.+)$/);
  if (!match) throw new Error("Recipient text file contains an invalid row.");
  return { to: match[1], name: match[2].trim() };
}

function summarizeResponse(response) {
  return {
    groupId: response?.groupInfo?.groupId ?? null,
    status: response?.groupInfo?.status ?? null,
    total: response?.groupInfo?.count?.total ?? null,
    registeredSuccess: response?.groupInfo?.count?.registeredSuccess ?? null,
    registeredFailed: response?.groupInfo?.count?.registeredFailed ?? null,
    failedMessageCount: Array.isArray(response?.failedMessageList) ? response.failedMessageList.length : 0,
    chargedMms: response?.groupInfo?.countForCharge?.mms ?? null,
    balance: response?.groupInfo?.balance?.balance ?? null,
  };
}

if (!Number.isInteger(BATCH_NUMBER) || BATCH_NUMBER < 1 || BATCH_NUMBER > 3) {
  throw new Error("Use --batch=1, --batch=2, or --batch=3.");
}

const manifest = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "manifest.json"), "utf8"));
const batchPlan = manifest.schedulingPlan.find((item) => item.batch === BATCH_NUMBER);
if (!batchPlan) throw new Error("Batch plan is missing from manifest.");

const filePath = path.join(OUTPUT_DIR, `nops_sep_combo_2026_batch_${BATCH_NUMBER}_${batchPlan.recipients}recipients.txt`);
const recipients = (await fs.readFile(filePath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(parseRecipientLine);

const uniquePhones = new Set(recipients.map((item) => item.to));
if (recipients.length !== batchPlan.recipients || uniquePhones.size !== recipients.length) {
  throw new Error("Recipient count or de-duplication check failed.");
}
const messages = recipients.map((recipient) => ({
  to: recipient.to,
  from: null,
  subject: SUBJECT,
  text: renderSeptemberComboMmsText(recipient.name),
  imageId: EXPECTED_IMAGE_ID,
  customFields: { campaignKey: "sep_combo_2026_v1", batch: String(BATCH_NUMBER) },
}));
if (messages.some((message) => /#\{[^}]+}/.test(message.text))) {
  throw new Error("Personalization preflight found unresolved MMS variables.");
}

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = String(process.env.SOLAPI_SENDER_PHONE ?? "").replace(/\D/g, "");
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");
if (sender !== EXPECTED_SENDER) throw new Error("Configured SOLAPI sender does not match 02-597-4030.");

const client = new SolapiMessageService(apiKey, apiSecret);
const balance = await client.getBalance();
const preflight = {
  batch: BATCH_NUMBER,
  recipients: recipients.length,
  uniquePhones: uniquePhones.size,
  sender: "02-597-4030",
  subject: SUBJECT,
  imageId: EXPECTED_IMAGE_ID,
  imageVerifiedFromSuccessfulTest: true,
  hasManualOptOut: messages.every((message) => message.text.includes("080-500-4233")),
  personalizationMode: "direct-text-rendering",
  personalizedRecipientCount: messages.length,
  unresolvedVariableCount: messages.filter((message) => /#\{[^}]+}/.test(message.text)).length,
  availableBalance: balance?.balance ?? null,
  mode: CONFIRMED ? "send" : "preflight-only",
};

if (!CONFIRMED) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}

const readyMessages = messages.map((message) => ({ ...message, from: sender }));

const response = await client.send(readyMessages, { allowDuplicates: false, showMessageList: false });
console.log(JSON.stringify({ ...preflight, result: summarizeResponse(response) }, null, 2));
