/**
 * DB 백업 Heartbeat 핸들러
 * POST /api/scheduled/db-backup
 * - Node.js(drizzle)로 전체 테이블 JSON 덤프 (mysqldump 불필요)
 * - AES-256-CBC 암호화
 * - Cloudflare R2 업로드
 * - 30일 초과 파일 자동 삭제
 */

import type { Request, Response } from "express";
import { createCipheriv, randomBytes } from "crypto";
import { gzip } from "zlib";
import { promisify } from "util";
import { sendBackupNotificationEmail } from "./email";

const gzipAsync = promisify(gzip);

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

  const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || "";
  const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

  if (!ENCRYPTION_KEY || !R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return res.status(500).json({ error: "필수 환경변수 누락" });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);

  try {
    console.log(`[DB Backup] 시작: ${timestamp}`);

    // 1. drizzle로 전체 테이블 JSON 덤프
    const { getDb } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB not available" });

    // 리더 노드에서 읽기 강제 (복제 지연 방지)
    await db.execute(sql`SET SESSION tidb_replica_read = 'leader'`);

    const tableNames = [
      "members", "coupons", "coupon_templates", "consent_logs",
      "alimtalk_logs", "points", "visits", "purchases", "otp_codes",
      "branches", "inquiries", "users", "__drizzle_migrations"
    ];

    const dump: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};

    for (const table of tableNames) {
      try {
        const result = await db.execute(sql.raw(`SELECT * FROM \`${table}\``));
        const rows = Array.isArray(result[0]) ? result[0] as unknown[] : [];
        dump[table] = rows;
        rowCounts[table] = rows.length;
      } catch (e) {
        console.warn(`[DB Backup] 테이블 ${table} 덤프 실패:`, e);
        dump[table] = [];
        rowCounts[table] = -1;
      }
    }

    const dumpJson = JSON.stringify({ backupDate: now.toISOString(), tables: dump }, null, 0);
    const dumpBuffer = Buffer.from(dumpJson, "utf-8");
    const dumpSizeKB = Math.round(dumpBuffer.length / 1024);
    console.log(`[DB Backup] 덤프 완료: ${dumpSizeKB} KB, 테이블 ${tableNames.length}개`);

    // 2. gzip 압축 + AES-256 암호화
    const compressed = await gzipAsync(dumpBuffer);
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
    const iv = randomBytes(16);
    const ivHex = iv.toString("hex");
    const { createCipheriv: _createCipheriv } = await import("crypto");
    const cipher = _createCipheriv("aes-256-cbc", keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const encSizeKB = Math.round(encrypted.length / 1024);
    console.log(`[DB Backup] 암호화 완료: ${encSizeKB} KB`);

    // 3. R2 업로드
    const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const r2 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });

    const backupKey = `backups/${dateStr}/nops-crm-${timestamp}.json.gz.enc`;
    const metaKey = `backups/${dateStr}/nops-crm-${timestamp}.meta.json`;

    const metadata = {
      backupDate: now.toISOString(),
      format: "json",
      dumpSizeKB,
      encryptedSizeKB: encSizeKB,
      encryptionIV: ivHex,
      rowCounts,
    };

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backupKey,
      Body: encrypted,
      ContentType: "application/octet-stream",
      Metadata: { "backup-date": dateStr, "iv": ivHex },
    }));

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: metaKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    }));

    // 4. 30일 초과 파일 삭제
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

    console.log(`[DB Backup] 완료: ${backupKey} | 삭제된 오래된 파일: ${deleted}개`);

    // 5. 성공 이메일 알림
    sendBackupNotificationEmail({
      success: true,
      backupKey,
      rowCounts,
      dumpSizeKB,
      encryptedSizeKB: encSizeKB,
      timestamp: now.toISOString(),
    }).catch((e) => console.error("[DB Backup] 알림 이메일 실패:", e));

    return res.json({
      ok: true,
      backupKey,
      metaKey,
      rowCounts,
      dumpSizeKB,
      encryptedSizeKB: encSizeKB,
      deletedOldFiles: deleted,
    });

  } catch (err) {
    console.error("[DB Backup] 오류:", err);

    sendBackupNotificationEmail({
      success: false,
      backupKey: "",
      rowCounts: {},
      dumpSizeKB: 0,
      encryptedSizeKB: 0,
      timestamp: now.toISOString(),
      error: String(err),
    }).catch(() => {});

    return res.status(500).json({ error: String(err), timestamp: now.toISOString() });
  }
}
