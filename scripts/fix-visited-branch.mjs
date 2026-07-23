/**
 * fix-visited-branch.mjs
 *
 * visitedBranch가 NULL인 회원 목록을 조회하고,
 * 관리자가 각 회원에 대해 방문 매장을 수동으로 지정하는 인터랙티브 CLI 스크립트.
 *
 * 실행 방법:
 *   node scripts/fix-visited-branch.mjs
 *
 * 옵션:
 *   --dry-run    실제 DB 변경 없이 대상 목록만 출력
 *   --all        전체 회원 대상 (기본: 활성 회원만)
 *   --limit N    처리할 최대 회원 수 (기본: 100)
 *
 * 주의: 실제 운영 DB에 직접 반영됩니다. 반드시 확인 후 적용하세요.
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { sql, isNull, eq } from 'drizzle-orm';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const includeAll = args.includes('--all');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

const db = drizzle(process.env.DATABASE_URL);

// 지점 목록 조회
async function fetchBranches() {
  const result = await db.execute(sql`
    SELECT code, name FROM branches WHERE isActive = 1 ORDER BY name ASC
  `);
  return Array.isArray(result[0]) ? result[0] : [];
}

// visitedBranch NULL 회원 조회
async function fetchMissingMembers() {
  const statusFilter = includeAll ? '' : "AND status = 'active'";
  const result = await db.execute(sql.raw(`
    SELECT id, name, email, phone, joinedAt
    FROM members
    WHERE visitedBranch IS NULL
    ${statusFilter}
    ORDER BY joinedAt DESC
    LIMIT ${limit}
  `));
  return Array.isArray(result[0]) ? result[0] : [];
}

// DB 업데이트
async function updateVisitedBranch(memberId, branchName) {
  await db.execute(sql`
    UPDATE members SET visitedBranch = ${branchName} WHERE id = ${memberId}
  `);
}

function printBranches(branches) {
  console.log('\n사용 가능한 지점 목록:');
  branches.forEach((b, i) => {
    console.log(`  [${i + 1}] ${b.name} (${b.code})`);
  });
  console.log(`  [0] 건너뛰기`);
  console.log(`  [q] 종료`);
}

async function main() {
  console.log('\n========================================');
  console.log('  NOPS 방문 매장 미입력 회원 보정 도구');
  console.log('========================================');
  if (isDryRun) console.log('  ⚠️  DRY RUN 모드 (DB 변경 없음)');
  if (includeAll) console.log('  대상: 전체 회원 (탈퇴 포함)');
  else console.log('  대상: 활성 회원만');
  console.log(`  최대 처리: ${limit}명\n`);

  const branches = await fetchBranches();
  if (branches.length === 0) {
    console.error('❌ 지점 정보를 불러올 수 없습니다. branches 테이블을 확인하세요.');
    process.exit(1);
  }

  const members = await fetchMissingMembers();
  if (members.length === 0) {
    console.log('✅ 방문 매장 미입력 회원이 없습니다.');
    process.exit(0);
  }

  console.log(`방문 매장 미입력 회원: ${members.length}명`);
  console.log('─'.repeat(70));
  members.forEach((m, i) => {
    const joined = new Date(m.joinedAt).toLocaleDateString('ko-KR');
    console.log(`  [${String(i + 1).padStart(3)}] ${m.name.padEnd(10)} ${m.email.padEnd(30)} 가입: ${joined}`);
  });
  console.log('─'.repeat(70));

  if (isDryRun) {
    console.log('\n[DRY RUN] 위 목록이 처리 대상입니다. --dry-run 없이 실행하면 인터랙티브 모드로 진행됩니다.');
    process.exit(0);
  }

  const rl = readline.createInterface({ input, output });

  const confirm = await rl.question('\n위 회원들의 방문 매장을 지정하시겠습니까? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('취소되었습니다.');
    rl.close();
    process.exit(0);
  }

  printBranches(branches);

  let updated = 0;
  let skipped = 0;

  for (const member of members) {
    const joined = new Date(member.joinedAt).toLocaleDateString('ko-KR');
    console.log(`\n▶ [${member.id}] ${member.name} (${member.email}) — 가입: ${joined}`);

    let chosen = null;
    while (chosen === null) {
      const ans = await rl.question('  번호 입력 (0=건너뛰기, q=종료): ');
      if (ans.toLowerCase() === 'q') {
        console.log(`\n종료합니다. 처리: ${updated}명 업데이트, ${skipped}명 건너뜀`);
        rl.close();
        process.exit(0);
      }
      const num = parseInt(ans, 10);
      if (num === 0) {
        console.log('  → 건너뜀');
        skipped++;
        chosen = 'skip';
      } else if (num >= 1 && num <= branches.length) {
        chosen = branches[num - 1];
      } else {
        console.log(`  ⚠️  1~${branches.length} 또는 0, q 를 입력하세요.`);
      }
    }

    if (chosen !== 'skip') {
      await updateVisitedBranch(member.id, chosen.name);
      console.log(`  ✅ ${member.name} → ${chosen.name} 저장 완료`);
      updated++;
    }
  }

  rl.close();
  console.log(`\n========================================`);
  console.log(`  완료: ${updated}명 업데이트, ${skipped}명 건너뜀`);
  console.log(`========================================\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error('오류 발생:', e.message);
  process.exit(1);
});
