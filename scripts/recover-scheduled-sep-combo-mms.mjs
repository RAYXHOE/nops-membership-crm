import fs from "node:fs/promises";
import path from "node:path";
import { SolapiMessageService } from "solapi";
import { renderSeptemberComboMmsText, SEPTEMBER_COMBO_MMS_SUBJECT } from "./lib/september-combo-mms.mjs";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const SCHEDULED_DATE = "2026-09-15T15:00:00+09:00";
const EXPECTED_SCHEDULED_UTC = "2026-09-15T06:00:00.000Z";
const EXPECTED_IMAGE_ID = "ST01FZ260914061400154st0leVn7jRm";
const EXPECTED_SENDER = "025974030";
const EXPECTED_RECIPIENTS = 1823;
const ESTIMATED_MMS_UNIT_PRICE = 110;
const CONFIRMED = process.argv.includes("--confirm-recovery");

function parseRecipientLine(line) {
  const match = line.trim().match(/^(010\d{8})\s+(.+)$/);
  if (!match) throw new Error("Recipient text file contains an invalid row.");
  return { to: match[1], name: match[2].trim() };
}

async function readBatch(batch, count) {
  const contents = await fs.readFile(
    path.join(OUTPUT_DIR, `nops_sep_combo_2026_batch_${batch}_${count}recipients.txt`),
    "utf8",
  );
  return contents.split(/\r?\n/).filter(Boolean).map(parseRecipientLine);
}

function asArray(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

function isDuplicateScheduledGroup(group) {
  return group?.status === "SCHEDULED"
    && group?.scheduledDate === EXPECTED_SCHEDULED_UTC
    && group?.count?.total === EXPECTED_RECIPIENTS
    && group?.customFields?.campaignKey === "sep_combo_2026_v1";
}

if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
  throw new Error("SOLAPI API credentials are not configured.");
}
const sender = String(process.env.SOLAPI_SENDER_PHONE ?? "").replace(/\D/g, "");
if (sender !== EXPECTED_SENDER) throw new Error("Configured sender does not match 02-597-4030.");
if (new Date(SCHEDULED_DATE).getTime() <= Date.now()) throw new Error("Recovery reservation time must be in the future.");

const recipients = [...await readBatch(2, 900), ...await readBatch(3, 923)];
const uniquePhones = new Set(recipients.map((recipient) => recipient.to));
if (recipients.length !== EXPECTED_RECIPIENTS || uniquePhones.size !== EXPECTED_RECIPIENTS) {
  throw new Error("Recipient count or de-duplication check failed.");
}

const messages = recipients.map((recipient) => ({
  to: recipient.to,
  from: sender,
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  text: renderSeptemberComboMmsText(recipient.name),
  imageId: EXPECTED_IMAGE_ID,
  customFields: { campaignKey: "sep_combo_2026_v1", batch: "2+3-recovery" },
}));
const unresolvedVariableCount = messages.filter((message) => /#\{[^}]+}/.test(message.text)).length;
if (unresolvedVariableCount !== 0) throw new Error("Recovery text contains unresolved variables.");
if (!messages.every((message) => message.text.startsWith("[멤버쉽 특전] 스테이크하우스 NOPS\n"))) {
  throw new Error("Recovery title is missing from the first line.");
}

const client = new SolapiMessageService(process.env.SOLAPI_API_KEY, process.env.SOLAPI_API_SECRET);
const [balance, groupsResponse] = await Promise.all([client.getBalance(), client.getGroups({ limit: 100 })]);
const duplicateScheduledGroups = asArray(groupsResponse.groupList).filter(isDuplicateScheduledGroup);
if (duplicateScheduledGroups.length > 0) throw new Error("A matching scheduled campaign group already exists; recovery stopped to avoid a duplicate send.");

const estimatedCost = EXPECTED_RECIPIENTS * ESTIMATED_MMS_UNIT_PRICE;
const preflight = {
  recipients: recipients.length,
  uniquePhones: uniquePhones.size,
  scheduledDate: SCHEDULED_DATE,
  sender: "02-597-4030",
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  imageId: EXPECTED_IMAGE_ID,
  firstLine: "[멤버쉽 특전] 스테이크하우스 NOPS",
  nameOnSecondLine: true,
  unresolvedVariableCount,
  hasManualOptOut: messages.every((message) => message.text.includes("080-500-4233")),
  duplicateScheduledGroupCount: duplicateScheduledGroups.length,
  availableBalance: balance?.balance ?? null,
  estimatedCost,
  estimatedBalanceAfterReservation: Number(balance?.balance ?? 0) - estimatedCost,
  mode: CONFIRMED ? "recover-reservation" : "preflight-only",
};

if (!CONFIRMED) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}
if (Number(balance?.balance ?? 0) < estimatedCost) {
  throw new Error("SOLAPI balance is below the estimated recovery reservation cost.");
}

let recoveryGroupId;
try {
  recoveryGroupId = await client.createGroup(false, undefined, {
    campaignKey: "sep_combo_2026_v1",
    operation: "scheduled-copy-recovery",
  });
  await client.addMessagesToGroup(recoveryGroupId, messages);
  const staged = await client.getGroup(recoveryGroupId);
  if (staged.status !== "PENDING" || staged.count?.total !== EXPECTED_RECIPIENTS || staged.count?.registeredSuccess !== EXPECTED_RECIPIENTS) {
    throw new Error("Recovery group staging validation failed.");
  }
  await client.reserveGroup(recoveryGroupId, SCHEDULED_DATE);
  const scheduled = await client.getGroup(recoveryGroupId);
  if (
    scheduled.status !== "SCHEDULED"
    || scheduled.scheduledDate !== EXPECTED_SCHEDULED_UTC
    || scheduled.count?.total !== EXPECTED_RECIPIENTS
    || scheduled.count?.registeredSuccess !== EXPECTED_RECIPIENTS
    || scheduled.count?.registeredFailed !== 0
  ) {
    throw new Error("Recovery group scheduling validation failed.");
  }
  console.log(JSON.stringify({
    ...preflight,
    groupId: scheduled.groupId,
    status: scheduled.status,
    scheduledDateReturned: scheduled.scheduledDate,
    registeredSuccess: scheduled.count?.registeredSuccess ?? null,
    registeredFailed: scheduled.count?.registeredFailed ?? null,
  }, null, 2));
} catch (error) {
  if (recoveryGroupId) {
    try {
      const group = await client.getGroup(recoveryGroupId);
      if (group.status === "PENDING") await client.removeGroup(recoveryGroupId);
    } catch (cleanupError) {
      console.error("Recovery group cleanup could not complete:", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
  }
  throw error;
}
