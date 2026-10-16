import { and, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { members } from "../drizzle/schema";
import { getDb } from "./db";
import { getChangedMemberProfileFields, getMemberProfileEditAvailability } from "@shared/memberProfilePolicy";

export async function updateSelfMemberProfile(input: {
  memberId: number; verifiedEmail: string; phone?: string; birthDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "저장할 수 없습니다. 잠시 후 다시 시도해 주세요." });
  return db.transaction(async (tx) => {
    // The same member's changes and monthly quota are protected by one row lock.
    const [member] = await tx.select().from(members).where(eq(members.id, input.memberId)).limit(1).for("update");
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
    if (member.email !== input.verifiedEmail) throw new TRPCError({ code: "UNAUTHORIZED", message: "이메일 본인인증이 필요합니다." });
    if (member.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "활성 회원만 수정할 수 있습니다." });
    const now = new Date();
    const availability = getMemberProfileEditAvailability(member.lastSelfProfileEditAt, now);
    const changes = getChangedMemberProfileFields(member, input);
    // Retry of an identical save does not spend quota or create another update.
    if (Object.keys(changes).length === 0) return { success: true, changed: false, ...availability };
    if (!availability.canEdit) {
      const next = availability.nextAllowedAt!.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `회원정보는 월 1회 수정할 수 있습니다. 다음 수정 가능일: ${next}. 긴급 정정은 고객 문의를 이용해 주세요.` });
    }
    if (changes.phone !== undefined) {
      const digits = changes.phone.replace(/\D/g, "");
      const [duplicate] = await tx.select({ id: members.id }).from(members).where(and(
        ne(members.id, member.id),
        sql`REGEXP_REPLACE(${members.phone}, '[^0-9]', '') = ${digits}`,
      )).limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "이미 등록된 연락처입니다. 고객 문의로 확인을 요청해 주세요." });
    }
    // Profile change and quota consumption commit together; failures roll back both.
    await tx.update(members).set({ ...changes, lastSelfProfileEditAt: now }).where(eq(members.id, member.id));
    return { success: true, changed: true, ...getMemberProfileEditAvailability(now, now) };
  });
}
