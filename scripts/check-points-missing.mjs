import { getDb } from '../server/db.ts';
import { sql } from 'drizzle-orm';

const db = await getDb();
if (!db) { console.error('DB not available'); process.exit(1); }

await db.execute(sql`SET SESSION tidb_replica_read = 'leader'`);

const rows = await db.execute(sql`
  SELECT p.id as purchaseId, p.memberId, p.finalAmount, p.purchasedAt,
         m.name as memberName, m.email
  FROM purchases p
  LEFT JOIN points pt ON pt.purchaseId = p.id AND pt.type = 'earn'
  LEFT JOIN members m ON m.id = p.memberId
  WHERE p.finalAmount > 0 AND pt.id IS NULL
  ORDER BY p.purchasedAt DESC LIMIT 30
`);

const data = Array.isArray(rows[0]) ? rows[0] : [];
console.log(`\n=== 적립 누락 구매 목록 (${data.length}건) ===`);
for (const r of data) {
  const row = r;
  console.log(`  purchaseId=${row.purchaseId} | memberId=${row.memberId} | ${row.memberName}(${row.email}) | ${row.finalAmount}원 | ${row.purchasedAt}`);
}

process.exit(0);
