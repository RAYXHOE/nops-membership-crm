import {
  getOrCreateSepCombo2026Template,
  getSepCombo2026EligibleMemberCount,
  getSepCombo2026EligibleMembers,
  issueCoupon,
} from "../server/db.ts";
import { getSepCombo2026ExpiryAt, SEP_COMBO_2026 } from "../shared/septemberComboCampaign.ts";

function generateCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SEP-";
  for (let index = 0; index < 8; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

if (!process.argv.includes("--confirm")) {
  console.error("실발급을 실행하려면 --confirm 인자가 필요합니다.");
  process.exitCode = 1;
} else {
  const beforeCount = await getSepCombo2026EligibleMemberCount();
  const targets = await getSepCombo2026EligibleMembers(10_000);

  if (targets.length !== beforeCount) {
    throw new Error(`대상 조회 불일치: 집계 ${beforeCount}명, 조회 ${targets.length}명`);
  }

  const template = await getOrCreateSepCombo2026Template();
  let issued = 0;
  let skipped = 0;
  const failures = [];
  let completed = 0;
  let nextIndex = 0;
  const concurrency = 10;

  async function worker() {
    while (nextIndex < targets.length) {
      const member = targets[nextIndex++];
      try {
        const result = await issueCoupon({
          memberId: member.id,
          templateId: template.id,
          code: generateCouponCode(),
          type: "discount_percent",
          discountPercent: SEP_COMBO_2026.discountPercent,
          name: SEP_COMBO_2026.couponName,
          description: SEP_COMBO_2026.description,
          expiresAt: getSepCombo2026ExpiryAt(),
          grantKey: SEP_COMBO_2026.grantKey,
        });

        if (result.issued) issued += 1;
        else skipped += 1;
      } catch (error) {
        failures.push({ memberId: member.id, message: error instanceof Error ? error.message : String(error) });
      }

      completed += 1;
      if (completed % 100 === 0 || completed === targets.length) {
        console.log(`[SepCombo2026] ${completed}/${targets.length} 처리 · 발급 ${issued} · 중복 제외 ${skipped} · 실패 ${failures.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

  const remaining = await getSepCombo2026EligibleMemberCount();
  console.log(JSON.stringify({
    campaign: SEP_COMBO_2026.code,
    targetCount: beforeCount,
    issued,
    skipped,
    failed: failures.length,
    remaining,
    failures,
  }, null, 2));

  if (failures.length > 0 || remaining > 0) process.exitCode = 2;
}
