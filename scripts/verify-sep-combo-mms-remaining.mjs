import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const CAMPAIGN_KEY = "sep_combo_2026_v1";

function parsePhones(content) {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^(010\d{8})\s+.+$/);
      if (!match) throw new Error("Invalid recipient file row.");
      return match[1];
    });
}

async function readBatch(batch, count) {
  const filename = `nops_sep_combo_2026_batch_${batch}_${count}recipients.txt`;
  return parsePhones(await fs.readFile(path.join(OUTPUT_DIR, filename), "utf8"));
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const [sentBatch, batch2, batch3] = await Promise.all([
  readBatch(1, 900),
  readBatch(2, 900),
  readBatch(3, 923),
]);
const remaining = [...batch2, ...batch3];
const all = [...sentBatch, ...remaining];
const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [rows] = await connection.execute(
    `SELECT
      REPLACE(REPLACE(m.phone, '-', ''), ' ', '') AS normalizedPhone,
      m.id AS memberId,
      m.status AS memberStatus,
      m.marketingConsent,
      c.status AS couponStatus
    FROM members m
    INNER JOIN coupons c ON c.memberId = m.id AND c.grantKey = ?
    WHERE REPLACE(REPLACE(m.phone, '-', ''), ' ', '') IN (${remaining.map(() => "?").join(",")})`,
    [CAMPAIGN_KEY, ...remaining],
  );

  const byPhone = new Map(rows.map((row) => [String(row.normalizedPhone), row]));
  const invalid = remaining.filter((phone) => {
    const row = byPhone.get(phone);
    return !row || row.memberStatus !== "active" || !Boolean(row.marketingConsent) || row.couponStatus !== "active";
  });

  const report = {
    checkedAt: new Date().toISOString(),
    sentBatch: { recipients: sentBatch.length, uniquePhones: new Set(sentBatch).size },
    batch2: { recipients: batch2.length, uniquePhones: new Set(batch2).size },
    batch3: { recipients: batch3.length, uniquePhones: new Set(batch3).size },
    allBatchesUniqueByPhone: new Set(all).size === all.length,
    remainingExpected: remaining.length,
    remainingRowsMatched: byPhone.size,
    currentlyEligibleRemaining: remaining.length - invalid.length,
    currentlyIneligibleOrMissingRemaining: invalid.length,
    readyToScheduleWithoutRegeneration: invalid.length === 0 && byPhone.size === remaining.length && new Set(all).size === all.length,
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await connection.end();
}
