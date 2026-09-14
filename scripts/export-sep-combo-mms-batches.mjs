import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import XLSX from "xlsx";

const CAMPAIGN_KEY = "sep_combo_2026_v1";
const OUTPUT_DIR = "/home/ubuntu/Downloads/nops-sep-combo-mms-batches-2026-09-14";
const BATCH_SIZE = 900;
const TEST_RECIPIENT_PHONES = new Set([
  "01097324030", // 최채환
  "01092588606", // 김서완
  "01097302422", // 고지원
]);

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function digest(rows) {
  return crypto
    .createHash("sha256")
    .update(rows.map((row) => `${row.memberId}|${row.name}|${row.phone}`).join("\n"))
    .digest("hex");
}

function writeXlsx(filePath, rows) {
  const data = rows.map((row) => ({
    "수신자명": row.name,
    "수신번호": row.phone,
  }));
  const sheet = XLSX.utils.json_to_sheet(data, { header: ["수신자명", "수신번호"] });
  sheet["!cols"] = [{ wch: 18 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "수신자목록");
  XLSX.writeFile(workbook, filePath, { bookType: "xlsx" });
}

function writeSolapiText(filePath, rows) {
  const content = rows.map((row) => `${row.phone} ${row.name}`).join("\n");
  return fs.writeFile(filePath, `${content}\n`, "utf8");
}

function writeExceptionsXlsx(filePath, rows) {
  const data = rows.map((row) => ({
    "제외 사유": row.reason,
    "회원 ID": row.memberId,
    "이름": row.name,
    "수신번호": row.phone || "미입력",
  }));
  const sheet = XLSX.utils.json_to_sheet(data, {
    header: ["제외 사유", "회원 ID", "이름", "수신번호"],
  });
  sheet["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "수동검토대상");
  XLSX.writeFile(workbook, filePath, { bookType: "xlsx" });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [rows] = await connection.execute(
    `SELECT DISTINCT
      m.id AS memberId,
      m.name,
      m.phone,
      m.status,
      m.marketingConsent,
      c.status AS couponStatus,
      c.expiresAt
    FROM coupons c
    INNER JOIN members m ON m.id = c.memberId
    WHERE c.grantKey = ?
    ORDER BY m.id ASC`,
    [CAMPAIGN_KEY],
  );

  const allCampaignMembers = rows.map((row) => ({
    memberId: Number(row.memberId),
    name: row.name,
    phone: normalizePhone(row.phone),
    status: row.status,
    marketingConsent: Boolean(row.marketingConsent),
    couponStatus: row.couponStatus,
  }));

  const invalidPhone = [];
  const testRecipients = [];
  const baseEligible = [];
  const exceptions = [];

  for (const row of allCampaignMembers) {
    if (row.couponStatus !== "active") {
      exceptions.push({ ...row, reason: "쿠폰 사용 완료 또는 비활성" });
      continue;
    }
    if (row.status !== "active") {
      exceptions.push({ ...row, reason: "회원 비활성 또는 탈퇴" });
      continue;
    }
    if (!row.marketingConsent) {
      exceptions.push({ ...row, reason: "SMS 마케팅 미동의" });
      continue;
    }
    if (!/^010\d{8}$/.test(row.phone)) {
      invalidPhone.push(row);
      exceptions.push({ ...row, reason: "SMS 발송 불가 전화번호" });
      continue;
    }
    if (TEST_RECIPIENT_PHONES.has(row.phone)) {
      testRecipients.push(row);
      exceptions.push({ ...row, reason: "이미 테스트 MMS 수신" });
      continue;
    }
    baseEligible.push(row);
  }

  const byPhone = new Map();
  for (const row of baseEligible) {
    const members = byPhone.get(row.phone) ?? [];
    members.push(row);
    byPhone.set(row.phone, members);
  }

  const duplicatePhoneMembers = [];
  const finalRecipients = [];
  for (const rowsForPhone of byPhone.values()) {
    if (rowsForPhone.length > 1) {
      duplicatePhoneMembers.push(...rowsForPhone);
      exceptions.push(...rowsForPhone.map((row) => ({ ...row, reason: "동일 전화번호 중복 회원" })));
    } else {
      finalRecipients.push(rowsForPhone[0]);
    }
  }

  const uniqueMemberIds = new Set(finalRecipients.map((row) => row.memberId));
  const uniquePhones = new Set(finalRecipients.map((row) => row.phone));
  if (uniqueMemberIds.size !== finalRecipients.length || uniquePhones.size !== finalRecipients.length) {
    throw new Error("Recipient deduplication invariant failed");
  }

  const batches = [
    finalRecipients.slice(0, BATCH_SIZE),
    finalRecipients.slice(BATCH_SIZE, BATCH_SIZE * 2),
    finalRecipients.slice(BATCH_SIZE * 2),
  ];
  const batchDates = ["2026-09-14 15:00 KST", "2026-09-15 15:00 KST", "2026-09-16 15:00 KST"];

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const [index, batch] of batches.entries()) {
    const filename = `nops_sep_combo_2026_batch_${index + 1}_${batch.length}recipients.xlsx`;
    writeXlsx(path.join(OUTPUT_DIR, filename), batch);
    await writeSolapiText(
      path.join(OUTPUT_DIR, `nops_sep_combo_2026_batch_${index + 1}_${batch.length}recipients.txt`),
      batch,
    );
  }
  writeExceptionsXlsx(path.join(OUTPUT_DIR, "nops_sep_combo_2026_manual_review_exclusions.xlsx"), exceptions);

  const manifest = {
    campaignKey: CAMPAIGN_KEY,
    generatedAt: new Date().toISOString(),
    schedulingPlan: batchDates.map((scheduledAt, index) => ({
      batch: index + 1,
      scheduledAt,
      recipients: batches[index].length,
      checksum: digest(batches[index]),
    })),
    checks: {
      campaignMembers: allCampaignMembers.length,
      activeMarketingWithActiveCoupon: allCampaignMembers.filter(
        (row) => row.status === "active" && row.marketingConsent && row.couponStatus === "active",
      ).length,
      invalidPhone: invalidPhone.length,
      priorTestRecipientsExcluded: testRecipients.length,
      duplicatePhoneMembersExcluded: duplicatePhoneMembers.length,
      manualReviewExclusions: exceptions.length,
      scheduledRecipients: finalRecipients.length,
      scheduledRecipientsUniqueByMember: uniqueMemberIds.size === finalRecipients.length,
      scheduledRecipientsUniqueByPhone: uniquePhones.size === finalRecipients.length,
      scheduledBatchTotal: batches.reduce((total, batch) => total + batch.length, 0),
    },
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await connection.end();
}
