import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { SolapiMessageService } from "solapi";
import { renderSeptemberComboMmsText, SEPTEMBER_COMBO_MMS_SUBJECT } from "./lib/september-combo-mms.mjs";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const EXPECTED_IMAGE_ID = "ST01FZ260914061400154st0leVn7jRm";
const EXPECTED_SENDER = "025974030";
const memberName = process.argv.find((arg) => arg.startsWith("--member-name="))?.slice("--member-name=".length);
const confirmed = process.argv.includes("--confirm-send");

if (!memberName) throw new Error("Use --member-name=<exact name>.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function validPhone(phone) {
  return /^010\d{8}$/.test(phone);
}

async function isInScheduledRecipientFiles(phone) {
  const contents = await Promise.all([2, 3].map((batch) =>
    fs.readFile(path.join(OUTPUT_DIR, `nops_sep_combo_2026_batch_${batch}_${batch === 2 ? 900 : 923}recipients.txt`), "utf8"),
  ));
  return contents.some((content) => content.split(/\r?\n/).some((line) => line.startsWith(`${phone} `)));
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
let member;
try {
  const [rows] = await connection.execute(
    `SELECT m.id, m.name, m.phone, m.status, m.marketingConsent,
      c.id AS couponId, c.status AS couponStatus
    FROM members m
    INNER JOIN coupons c ON c.memberId = m.id
    WHERE m.name = ?
      AND m.status = 'active'
      AND m.marketingConsent = 1
      AND c.grantKey = 'sep_combo_2026_v1'
      AND c.status = 'active'
    LIMIT 2`,
    [memberName],
  );
  if (rows.length !== 1) throw new Error("Expected exactly one active, SMS-consented test recipient with an active event coupon.");
  member = rows[0];
} finally {
  await connection.end();
}

const phone = normalizePhone(member.phone);
if (!validPhone(phone)) throw new Error("Test recipient has no valid mobile phone number.");
const scheduledRecipientOverlap = await isInScheduledRecipientFiles(phone);
if (scheduledRecipientOverlap) throw new Error("Test recipient is already included in the 1,823-recipient scheduled group.");

const text = renderSeptemberComboMmsText(member.name);
if (/#[{][^}]+[}]/.test(text)) throw new Error("Personalized text still contains an unresolved variable.");

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = normalizePhone(process.env.SOLAPI_SENDER_PHONE);
if (!apiKey || !apiSecret) throw new Error("SOLAPI API credentials are not configured.");
if (sender !== EXPECTED_SENDER) throw new Error("Configured sender does not match 02-597-4030.");

const client = new SolapiMessageService(apiKey, apiSecret);
const balance = await client.getBalance();
const preflight = {
  testRecipientCount: 1,
  recipientEligible: true,
  scheduledRecipientOverlap,
  sender: "02-597-4030",
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  imageId: EXPECTED_IMAGE_ID,
  personalizationMode: "direct-text-rendering",
  unresolvedVariableCount: 0,
  hasManualOptOut: text.includes("080-500-4233"),
  availableBalance: balance?.balance ?? null,
  mode: confirmed ? "send" : "preflight-only",
};

if (!confirmed) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}

const response = await client.send({
  to: phone,
  from: sender,
  subject: SEPTEMBER_COMBO_MMS_SUBJECT,
  text,
  imageId: EXPECTED_IMAGE_ID,
  customFields: { campaignKey: "sep_combo_2026_v1", test: "personalization" },
}, { allowDuplicates: false, showMessageList: false });

console.log(JSON.stringify({
  ...preflight,
  groupId: response?.groupInfo?.groupId ?? null,
  status: response?.groupInfo?.status ?? null,
  registeredSuccess: response?.groupInfo?.count?.registeredSuccess ?? null,
  registeredFailed: response?.groupInfo?.count?.registeredFailed ?? null,
  failedMessageCount: Array.isArray(response?.failedMessageList) ? response.failedMessageList.length : 0,
}, null, 2));
