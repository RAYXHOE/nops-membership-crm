import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const result = await client.send(new ListObjectsV2Command({
  Bucket: process.env.R2_BUCKET_NAME,
  Prefix: "backups/",
}));

const files = result.Contents ?? [];
console.log(`\n=== R2 백업 파일 목록 (총 ${files.length}개) ===`);
for (const f of files.sort((a, b) => (b.Key ?? "").localeCompare(a.Key ?? ""))) {
  const size = ((f.Size ?? 0) / 1024).toFixed(1);
  console.log(`  ${f.Key} | ${size}KB | ${f.LastModified?.toLocaleString("ko-KR")}`);
}

const has0721 = files.some(f => f.Key?.includes("2026-07-21"));
console.log(`\n2026-07-21 폴더 존재: ${has0721 ? "✅ 있음" : "❌ 없음"}`);
process.exit(0);
