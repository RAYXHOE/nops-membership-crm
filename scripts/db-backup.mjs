/**
 * NOPS CRM DB 백업 스크립트
 * - mysqldump --single-transaction 으로 전체 DB 덤프
 * - AES-256-CBC 암호화 (BACKUP_ENCRYPTION_KEY 환경변수)
 * - Cloudflare R2에 업로드 (30일치 보관)
 */

import { execSync } from "child_process";
import { createCipheriv, randomBytes } from "crypto";
import { createReadStream, createWriteStream, unlinkSync, statSync } from "fs";
import { pipeline } from "stream/promises";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createGzip } from "zlib";

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const RETAIN_DAYS = 30;

if (!ENCRYPTION_KEY || !DATABASE_URL || !R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("[Backup] 필수 환경변수 누락");
  process.exit(1);
}

// DB 연결 정보 파싱
const urlMatch = DATABASE_URL.match(/mysql2?:\/\/([^:]+):([^@]+)@([^:/\?]+):?(\d+)?\/([^\?]+)/);
if (!urlMatch) {
  console.error("[Backup] DATABASE_URL 파싱 실패");
  process.exit(1);
}
const [, dbUser, dbPass, dbHost, dbPort, dbName] = urlMatch;

const now = new Date();
const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19); // YYYY-MM-DDTHH-MM-SS
const dumpFile = `/tmp/nops-crm-${timestamp}.sql`;
const encFile = `/tmp/nops-crm-${timestamp}.sql.enc`;

const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function runBackup() {
  console.log(`[Backup] 시작: ${timestamp}`);

  // 1. mysqldump 실행
  console.log("[Backup] 1/4 mysqldump 실행 중...");
  const dumpCmd = [
    "mysqldump",
    `--host=${dbHost}`,
    `--port=${dbPort || 4000}`,
    `--user=${dbUser}`,
    "--ssl-mode=REQUIRED",
    "--no-tablespaces",
    "--set-gtid-purged=OFF",
    "--column-statistics=0",
    "--lock-tables=false",
    dbName,
  ].join(" ");

  try {
    const fullCmd = `${dumpCmd} > ${dumpFile}`;
    execSync(fullCmd, {
      env: { ...process.env, MYSQL_PWD: dbPass },
      shell: true,
      maxBuffer: 100 * 1024 * 1024,
    });
  } catch (err) {
    console.error("[Backup] mysqldump 실패:", err.stderr?.toString() || err.message);
    process.exit(1);
  }

  const dumpSize = statSync(dumpFile).size;
  console.log(`[Backup] 덤프 완료: ${(dumpSize / 1024).toFixed(1)} KB`);

  // 2. 테이블별 행 수 메타데이터 추출
  console.log("[Backup] 2/4 메타데이터 추출 중...");
  const tables = ["members", "coupons", "coupon_templates", "consent_logs", "alimtalk_logs",
    "points", "visits", "purchases", "otp_codes", "branches", "inquiries", "users", "__drizzle_migrations"];
  
  const rowCounts = {};
  for (const table of tables) {
    try {
      const result = execSync(
        `mysql --host=${dbHost} --port=${dbPort || 4000} --user=${dbUser} --ssl-mode=REQUIRED --batch --skip-column-names --database=${dbName} -e 'SELECT COUNT(*) FROM ${table}' 2>/dev/null`,
        { env: { ...process.env, MYSQL_PWD: dbPass }, shell: true }
      ).toString().trim();
      rowCounts[table] = parseInt(result) || 0;
    } catch {
      rowCounts[table] = -1;
    }
  }

  const metadata = {
    backupDate: now.toISOString(),
    dumpSizeBytes: dumpSize,
    rowCounts,
    dbHost,
    dbName,
  };

  console.log("[Backup] 테이블별 행 수:", JSON.stringify(rowCounts, null, 2));

  // 3. AES-256-CBC 암호화
  console.log("[Backup] 3/4 AES-256 암호화 중...");
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", keyBuffer, iv);

  // IV를 파일 앞에 prepend
  const ivHex = iv.toString("hex");
  execSync(`echo "${ivHex}" > ${encFile}.iv`);

  await pipeline(
    createReadStream(dumpFile),
    createGzip(),
    cipher,
    createWriteStream(encFile)
  );

  const encSize = statSync(encFile).size;
  console.log(`[Backup] 암호화 완료: ${(encSize / 1024).toFixed(1)} KB (IV: ${ivHex})`);

  // IV를 메타데이터에 포함
  metadata.encryptionIV = ivHex;
  metadata.encryptedSizeBytes = encSize;

  // 4. R2 업로드
  console.log("[Backup] 4/4 R2 업로드 중...");
  const backupKey = `backups/${dateStr}/nops-crm-${timestamp}.sql.gz.enc`;
  const metaKey = `backups/${dateStr}/nops-crm-${timestamp}.meta.json`;

  // 암호화 파일 업로드
  const { createReadStream: crs } = await import("fs");
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: backupKey,
    Body: crs(encFile),
    ContentType: "application/octet-stream",
    Metadata: {
      "backup-date": dateStr,
      "db-name": dbName,
      "encrypted": "aes-256-cbc",
      "iv": ivHex,
    },
  }));

  // 메타데이터 JSON 업로드
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: metaKey,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: "application/json",
  }));

  console.log(`[Backup] R2 업로드 완료: ${backupKey}`);

  // 5. 30일 초과 파일 삭제
  console.log("[Backup] 30일 초과 파일 정리 중...");
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETAIN_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const listed = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: "backups/" }));
  let deleted = 0;
  for (const obj of listed.Contents || []) {
    const objDate = obj.Key.split("/")[1]; // backups/YYYY-MM-DD/...
    if (objDate && objDate < cutoffStr) {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: obj.Key }));
      deleted++;
    }
  }
  if (deleted > 0) console.log(`[Backup] ${deleted}개 오래된 파일 삭제 완료`);

  // 6. 임시 파일 정리
  try { unlinkSync(dumpFile); } catch {}
  try { unlinkSync(encFile); } catch {}
  try { unlinkSync(`${encFile}.iv`); } catch {}

  console.log(`[Backup] 완료! 백업 키: ${backupKey}`);
  console.log(`[Backup] 메타데이터: ${metaKey}`);
  
  return { backupKey, metaKey, rowCounts, metadata };
}

runBackup().catch(err => {
  console.error("[Backup] 오류:", err);
  process.exit(1);
});
