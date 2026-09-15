import fs from "node:fs/promises";
import path from "node:path";
import { SolapiMessageService } from "solapi";
import { renderSeptemberComboMmsText, SEPTEMBER_COMBO_MMS_SUBJECT } from "./lib/september-combo-mms.mjs";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const ORIGINAL_GROUP_ID = "G4V20260914181238EBYTH8ERBLDIC0P";
const SCHEDULED_DATE = "2026-09-15T15:00:00+09:00";
const EXPECTED_SCHEDULED_UTC = "2026-09-15T06:00:00.000Z";
const EXPECTED_IMAGE_ID = "ST01FZ260914061400154st0leVn7jRm";
const EXPECTED_SENDER = "025974030";
const EXPECTED_RECIPIENTS = 1823;
const ESTIMATED_MMS_UNIT_PRICE = 110;
const CONFIRMED = process.argv.includes("--confirm-replacement");

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

function summarizeGroup(group) {
  return {
    groupId: group?.groupId ?? null,
    status: group?.status ?? null,
    scheduledDate: group?.scheduledDate ?? null,
    total: group?.count?.total ?? null,
    registeredSuccess: group?.count?.registeredSuccess ?? null,
    registeredFailed: group?.count?.registeredFailed ?? null,
  };
}

function isExpectedOriginalGroup(group) {
  return group?.status === "SCHEDULED"
    && group?.scheduledDate === EXPECTED_SCHEDULED_UTC
    && group?.count?.total === EXPECTED_RECIPIENTS
    && group?.count?.registeredSuccess === EXPECTED_RECIPIENTS
    && group?.count?.registeredFailed === 0;
}

if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
  throw new Error("SOLAPI API credentials are not configured.");
}
const sender = String(process.env.SOLAPI_SENDER_PHONE ?? "").replace(/\D/g, "");
if (sender !== EXPECTED_SENDER) throw new Error("Configured sender does not match 02-597-4030.");
if (new Date(SCHEDULED_DATE).getTime() <= Date.now()) throw new Error("Replacement reservation time must be in the future.");

const recipients = [...await readBatch(2, 900), ...await readBatch(3, 923)];
const uniquePhones = new Set(recipients.map((recipient) => recipient.to));
if (recipients.length !== EXPECTED_RECIPIENTS || uniquePhones.size !== EXPECTED_RECIPIENTS) {
  throw new Error("Combined recipient count or de-duplication check failed.");
}
const messages = recipients.map((recipient) => ({
  to: recipient.to,
  from: sender,
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  text: renderSeptemberComboMmsText(recipient.name),
  imageId: EXPECTED_IMAGE_ID,
  customFields: { campaignKey: "sep_combo_2026_v1", batch: "2+3-replacement" },
}));
const unresolvedVariableCount = messages.filter((message) => /#\{[^}]+}/.test(message.text)).length;
if (unresolvedVariableCount !== 0) throw new Error("Replacement text contains unresolved variables.");

const client = new SolapiMessageService(process.env.SOLAPI_API_KEY, process.env.SOLAPI_API_SECRET);
const [originalGroup, balance] = await Promise.all([client.getGroup(ORIGINAL_GROUP_ID), client.getBalance()]);
if (!isExpectedOriginalGroup(originalGroup)) {
  throw new Error("Original reservation no longer matches the expected SCHEDULED group; replacement stopped.");
}

const estimatedCost = EXPECTED_RECIPIENTS * ESTIMATED_MMS_UNIT_PRICE;
const preflight = {
  originalGroup: summarizeGroup(originalGroup),
  replacement: {
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
  },
  estimatedCost,
  availableBalance: balance?.balance ?? null,
  estimatedBalanceAfterReservation: Number(balance?.balance ?? 0) - estimatedCost,
  mode: CONFIRMED ? "replace-reservation" : "preflight-only",
};

if (!CONFIRMED) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}
if (Number(balance?.balance ?? 0) < estimatedCost) {
  throw new Error("SOLAPI balance is below the estimated reservation cost.");
}

let replacementGroupId;
try {
  replacementGroupId = await client.createGroup(false, undefined, {
    campaignKey: "sep_combo_2026_v1",
    operation: "scheduled-copy-replacement",
  });
  await client.addMessagesToGroup(replacementGroupId, messages);
  const stagedGroup = await client.getGroup(replacementGroupId);
  if (stagedGroup.status !== "PENDING" || stagedGroup.count?.total !== EXPECTED_RECIPIENTS) {
    throw new Error("Replacement group staging validation failed.");
  }

  await client.removeReservationToGroup(ORIGINAL_GROUP_ID);
  const cancelledOriginal = await client.getGroup(ORIGINAL_GROUP_ID);
  if (cancelledOriginal.status !== "PENDING") {
    throw new Error("Original group did not enter PENDING after reservation cancellation.");
  }

  await client.reserveGroup(replacementGroupId, SCHEDULED_DATE);
  const scheduledReplacement = await client.getGroup(replacementGroupId);
  if (
    scheduledReplacement.status !== "SCHEDULED"
    || scheduledReplacement.scheduledDate !== EXPECTED_SCHEDULED_UTC
    || scheduledReplacement.count?.total !== EXPECTED_RECIPIENTS
    || scheduledReplacement.count?.registeredSuccess !== EXPECTED_RECIPIENTS
    || scheduledReplacement.count?.registeredFailed !== 0
  ) {
    throw new Error("Replacement group scheduling validation failed.");
  }

  await client.removeGroup(ORIGINAL_GROUP_ID);
  console.log(JSON.stringify({
    ...preflight,
    originalReservationCancelled: true,
    originalGroupDeletedAfterReplacement: true,
    replacementGroup: summarizeGroup(scheduledReplacement),
  }, null, 2));
} catch (error) {
  if (replacementGroupId) {
    try {
      const originalNow = await client.getGroup(ORIGINAL_GROUP_ID);
      if (originalNow.status === "PENDING" && new Date(SCHEDULED_DATE).getTime() > Date.now()) {
        await client.reserveGroup(ORIGINAL_GROUP_ID, SCHEDULED_DATE);
      }
      const replacementNow = await client.getGroup(replacementGroupId);
      if (replacementNow.status === "PENDING") await client.removeGroup(replacementGroupId);
    } catch (rollbackError) {
      console.error("Replacement rollback could not complete:", rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
    }
  }
  throw error;
}
