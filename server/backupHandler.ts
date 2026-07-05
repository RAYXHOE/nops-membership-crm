/**
 * DB 백업 Heartbeat 핸들러
 * POST /api/scheduled/db-backup
 * - mysqldump --lock-tables=false 전체 덤프
 * - AES-256-CBC 암호화
 * - Cloudflare R2 업로드
 * - 30일 초과 파일 자동 삭제
 */

import type { Request, Response } from "express";
import { execSync } from "child_process";
import { createCipheriv, randomBytes } from "crypto";
import { createReadStream, createWriteStream, unlinkSync, statSync, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import { sendBackupNotificationEmail } from "./email";

export async function dbBackupHandler(req: Request, res: Response) {
  try {
    const { sdk } = await import("./_core/sdk");
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
  } catch {
    return res.status(403).json({ error: "authentication failed" });
  }

  const DATABASE_URL = process.env.DATABASE_URL || "";
  const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || "";
  const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

  if (!ENCRYPTION_KEY || !DATABASE_URL || !R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return res.status(500).json({ error: "필수 환경변수 누락" });
  }

  const urlMatch = DATABASE_URL.match(/mysql2?:\/\/([^:]+):([^@]+)@([^:/\?]+):?(\d+)?\/([^\?]+)/);
  if (!urlMatch) {
    return res.status(500).json({ error: "DATABASE_URL 파싱 실패" });
  }
  const [, dbUser, dbPass, dbHost, dbPort, dbName] = urlMatch;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dumpFile = `/tmp/nops-backup-${timestamp}.sql`;
  const encFile = `/tmp/nops-backup-${timestamp}.sql.gz.enc`;

  try {
    // 1. mysqldump
    console.log(`[DB Backup] 시작: ${timestamp}`);
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
      `> ${dumpFile}`,
    ].join(" ");

    execSync(dumpCmd, {
      env: { ...process.env, MYSQL_PWD: dbPass },
      shell: "/bin/sh",
      maxBuffer: 100 * 1024 * 1024,
    });

    const dumpSize = statSync(dumpFile).size;
    console.log(`[DB Backup] 덤프 완료: ${(dumpSize / 1024).toFixed(1)} KB`);

    // 2. 테이블별 행 수 수집
    const tables = ["members", "coupons", "coupon_templates", "consent_logs",
      "alimtalk_logs", "points", "visits", "purchases", "otp_codes",
      "branches", "inquiries", "users"];
    const rowCounts: Record<string, number> = {};
    for (const table of tables) {
      try {
        const result = execSync(
          `mysql --host=${dbHost} --port=${dbPort || 4000} --user=${dbUser} --ssl-mode=REQUIRED --batch --skip-column-names --database=${dbName} -e 'SELECT COUNT(*) FROM ${table}' 2>/dev/null`,
          { env: { ...process.env, MYSQL_PWD: dbPass }, shell: "/bin/sh" }
        ).toString().trim();
        rowCounts[table] = parseInt(result) || 0;
      } catch {
        rowCounts[table] = -1;
      }
    }

    // 3. AES-256 암호화
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
    const iv = randomBytes(16);
    const ivHex = iv.toString("hex");
    const cipher = createCipheriv("aes-256-cbc", keyBuffer, iv);

    await pipeline(
      createReadStream(dumpFile),
      createGzip(),
      cipher,
      createWriteStream(encFile)
    );

    const encSize = statSync(encFile).size;
    console.log(`[DB Backup] 암호화 완료: ${(encSize / 1024).toFixed(1)} KB`);

    // 4. R2 업로드
    const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const r2 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });

    const backupKey = `backups/${dateStr}/nops-crm-${timestamp}.sql.gz.enc`;
    const metaKey = `backups/${dateStr}/nops-crm-${timestamp}.meta.json`;

    const metadata = {
      backupDate: now.toISOString(),
      dumpSizeBytes: dumpSize,
      encryptedSizeBytes: encSize,
      encryptionIV: ivHex,
      rowCounts,
      dbHost,
      dbName,
    };

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backupKey,
      Body: createReadStream(encFile),
      ContentType: "application/octet-stream",
      Metadata: { "backup-date": dateStr, "iv": ivHex },
    }));

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: metaKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    }));

    // 5. 30일 초과 파일 삭제
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: "backups/" }));
    let deleted = 0;
    for (const obj of listed.Contents || []) {
      const objDate = (obj.Key || "").split("/")[1];
      if (objDate && objDate < cutoffStr) {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: obj.Key! }));
        deleted++;
      }
    }

    // 6. 임시 파일 정리
    try { unlinkSync(dumpFile); } catch {}
    try { unlinkSync(encFile); } catch {}

    console.log(`[DB Backup] 완료: ${backupKey}`);

    // 성공 이메일 알림 (비동기)
    sendBackupNotificationEmail({
      success: true,
      backupKey,
      rowCounts,
      dumpSizeKB: Math.round(dumpSize / 1024),
      encryptedSizeKB: Math.round(encSize / 1024),
      timestamp: now.toISOString(),
    }).catch((e) => console.error("[DB Backup] 알림 이메일 실패:", e));

    return res.json({
      ok: true,
      backupKey,
      metaKey,
      dumpSizeKB: Math.round(dumpSize / 1024),
      encryptedSizeKB: Math.round(encSize / 1024),
      rowCounts,
      deletedOldFiles: deleted,
      timestamp: now.toISOString(),
    });

  } catch (err) {
    // 임시 파일 정리
    try { if (existsSync(dumpFile)) unlinkSync(dumpFile); } catch {}
    try { if (existsSync(encFile)) unlinkSync(encFile); } catch {}
    console.error("[DB Backup] 오류:", err);

    // 실패 이메일 알림 (비동기)
    sendBackupNotificationEmail({
      success: false,
      error: String(err),
      timestamp: new Date().toISOString(),
    }).catch((e) => console.error("[DB Backup] 실패 알림 이메일 오류:", e));

    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}
