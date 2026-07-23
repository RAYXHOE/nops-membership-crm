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
 *   --dry-run              실제 DB 변경 없이 대상 목록만 출력
 *   --all                  전체 회원 대상 (기본: 활성 회원만)
 *   --limit N              처리할 최대 회원 수 (기본: 100)
 *   --auto-from-visits     쿠폰 사용 지점(usedBranchCode) 기반 자동 추론 모드
 *                          각 회원이 쿠폰을 가장 많이 사용한 지점을 visitedBranch로 설정
 *                          --dry-run과 함께 사용하면 변경 내용만 미리 확인
 *
 * 주의: 실제 운영 DB에 직접 반영됩니다. 반드시 확인 후 적용하세요.
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const includeAll = args.includes('--all');
const autoMode = args.includes('--auto-from-visits');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

const db = drizzle(process.env.DATABASE_URL);

// 지점 목록 조회 (code → name 매핑)
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

// 쿠폰 사용 지점 기반 자동 추론: 각 회원의 최다 사용 지점 반환
async function fetchAutoInferData(statusFilter) {
  const result = await db.execute(sql.raw(`
    SELECT
      m.id,
      m.name,
      m.email,
      m.joinedAt,
      c.usedBranchCode AS topBranchCode,
      COUNT(*) AS usageCount
    FROM members m
    JOIN coupons c ON c.memberId = m.id
      AND c.status = 'used'
      AND c.usedBranchCode IS NOT NULL
    WHERE m.visitedBranch IS NULL
      ${statusFilter}
    GROUP BY m.id, m.name, m.email, m.joinedAt, c.usedBranchCode
    HAVING usageCount = (
      SELECT MAX(cnt) FROM (
        SELECT COUNT(*) AS cnt
        FROM coupons c2
        WHERE c2.memberId = m.id
          AND c2.status = 'used'
          AND c2.usedBranchCode IS NOT NULL
        GROUP BY c2.usedBranchCode
      ) sub
    )
    ORDER BY m.joinedAt DESC
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
    console.log(`  [${String(i + 1).padStart(2)}] ${b.name.padEnd(16)} (${b.code})`);
  });
  console.log(`  [ 0] 건너뛰기`);
  console.log(`  [ q] 종료`);
}

// ─── 자동 추론 모드 ──────────────────────────────────────────────────────────
async function runAutoMode(branches) {
  const statusFilter = includeAll ? '' : "AND m.status = 'active'";
  console.log('\n[자동 추론] 쿠폰 사용 지점(usedBranchCode) 기반으로 visitedBranch 추론 중...');

  const rows = await fetchAutoInferData(statusFilter);
  if (rows.length === 0) {
    console.log('✅ 자동 추론 가능한 회원이 없습니다.');
    console.log('   (쿠폰 사용 이력이 없거나 이미 모두 visitedBranch가 설정된 상태)');
    process.exit(0);
  }

  // branchCode → branchName 매핑
  const codeToName = {};
  for (const b of branches) codeToName[b.code] = b.name;

  // 추론 결과 목록 출력
  const inferList = rows
    .map(r => ({ ...r, branchName: codeToName[r.topBranchCode] }))
    .filter(r => r.branchName); // 비활성 지점 코드는 제외

  if (inferList.length === 0) {
    console.log('✅ 매핑 가능한 활성 지점이 없습니다.');
    process.exit(0);
  }

  console.log(`\n자동 추론 대상: ${inferList.length}명`);
  console.log('─'.repeat(80));
  inferList.forEach((r, i) => {
    const joined = new Date(r.joinedAt).toLocaleDateString('ko-KR');
    console.log(
      `  [${String(i + 1).padStart(3)}] ${String(r.name).padEnd(10)} ${String(r.email).padEnd(32)} → ${String(r.branchName).padEnd(14)} (${r.topBranchCode}, ${r.usageCount}회)`
    );
  });
  console.log('─'.repeat(80));

  if (isDryRun) {
    console.log('\n[DRY RUN] 위 내용이 적용될 예정입니다. --dry-run 없이 실행하면 실제 반영됩니다.');
    process.exit(0);
  }

  const rl = readline.createInterface({ input, output });
  const confirm = await rl.question(`\n위 ${inferList.length}명에 대해 자동 추론 결과를 적용하시겠습니까? (y/n): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('취소되었습니다.');
    rl.close();
    process.exit(0);
  }

  let updated = 0;
  let failed = 0;
  for (const r of inferList) {
    try {
      await updateVisitedBranch(r.id, r.branchName);
      console.log(`  ✅ [${r.id}] ${r.name} → ${r.branchName}`);
      updated++;
    } catch (e) {
      console.error(`  ❌ [${r.id}] ${r.name} 실패: ${e.message}`);
      failed++;
    }
  }

  rl.close();
  console.log(`\n========================================`);
  console.log(`  완료: ${updated}명 업데이트, ${failed}명 실패`);
  console.log(`========================================\n`);
  process.exit(0);
}

// ─── 인터랙티브 수동 모드 ────────────────────────────────────────────────────
async function runManualMode(branches) {
  const members = await fetchMissingMembers();
  if (members.length === 0) {
    console.log('✅ 방문 매장 미입력 회원이 없습니다.');
    process.exit(0);
  }

  console.log(`방문 매장 미입력 회원: ${members.length}명`);
  console.log('─'.repeat(70));
  members.forEach((m, i) => {
    const joined = new Date(m.joinedAt).toLocaleDateString('ko-KR');
    console.log(`  [${String(i + 1).padStart(3)}] ${String(m.name).padEnd(10)} ${String(m.email).padEnd(30)} 가입: ${joined}`);
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

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  NOPS 방문 매장 미입력 회원 보정 도구');
  console.log('========================================');
  if (isDryRun) console.log('  ⚠️  DRY RUN 모드 (DB 변경 없음)');
  if (autoMode) console.log('  모드: 자동 추론 (쿠폰 사용 지점 기반)');
  else console.log('  모드: 수동 인터랙티브');
  if (includeAll) console.log('  대상: 전체 회원 (탈퇴 포함)');
  else console.log('  대상: 활성 회원만');
  console.log(`  최대 처리: ${limit}명\n`);

  const branches = await fetchBranches();
  if (branches.length === 0) {
    console.error('❌ 지점 정보를 불러올 수 없습니다. branches 테이블을 확인하세요.');
    process.exit(1);
  }

  if (autoMode) {
    await runAutoMode(branches);
  } else {
    await runManualMode(branches);
  }
}

main().catch((e) => {
  console.error('오류 발생:', e.message);
  process.exit(1);
});
