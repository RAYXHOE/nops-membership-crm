import { and, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { members, memberContactChallenges } from "../drizzle/schema";
import { getDb } from "./db";
import { getChangedMemberProfileFields, getMemberProfileEditAvailability } from "@shared/memberProfilePolicy";

type ContactProof = { challengeId: string; issuerHash: string };
export async function updateSelfMemberProfile(input: {
  memberId: number; verifiedEmail: string; verifiedPhone?: string;
  phone?: string; birthDate?: string; email?: string;
  emailProof?: ContactProof; phoneProof?: ContactProof;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "저장할 수 없습니다. 잠시 후 다시 시도해 주세요." });
  try {
    return await db.transaction(async (tx) => {
      const [member] = await tx.select().from(members).where(eq(members.id, input.memberId)).limit(1).for("update");
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "회원을 찾을 수 없습니다." });
      if (member.email !== input.verifiedEmail || (input.verifiedPhone !== undefined && member.phone.replace(/\D/g, "") !== input.verifiedPhone.replace(/\D/g, ""))) throw new TRPCError({ code: "UNAUTHORIZED", message: "본인인증이 필요합니다." });
      if (member.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "활성 회원만 수정할 수 있습니다." });
      const now = new Date();
      const availability = getMemberProfileEditAvailability(member.lastSelfProfileEditAt, now);
      const changes = getChangedMemberProfileFields(member, input);
      const auth = { email: member.email, phone: member.phone };
      if (Object.keys(changes).length === 0) return { success: true, changed: false, ...availability, auth };
      if (!availability.canEdit) {
        const next = availability.nextAllowedAt!.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `회원정보는 월 1회 수정할 수 있습니다. 다음 수정 가능일: ${next}. 긴급 정정은 고객 문의를 이용해 주세요.` });
      }
      async function consumeProof(purpose: "email_change" | "phone_change", target: string, inputProof?: ContactProof) {
        const label = purpose === "email_change" ? "이메일 주소" : "전화번호";
        if (!inputProof) throw new TRPCError({ code: "UNAUTHORIZED", message: `새 ${label} 인증을 먼저 완료해 주세요.` });
        const [proof] = await tx.select().from(memberContactChallenges).where(eq(memberContactChallenges.id, inputProof.challengeId)).limit(1).for("update");
        if (!proof || proof.purpose !== purpose || proof.memberId !== member.id || proof.target !== target || proof.issuerHash !== inputProof.issuerHash || !proof.verifiedAt || proof.usedAt || new Date(proof.expiresAt).getTime() <= now.getTime() || proof.emailSnapshot !== member.email || proof.phoneSnapshot !== member.phone.replace(/\D/g, "")) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: `새 ${label} 인증이 만료되었거나 변경되었습니다. 다시 인증해 주세요.` });
        }
        await tx.update(memberContactChallenges).set({ usedAt: now }).where(eq(memberContactChallenges.id, proof.id));
      }
      if (changes.phone !== undefined) {
        const digits = changes.phone.replace(/\D/g, "");
        const [duplicate] = await tx.select({ id: members.id }).from(members).where(and(
          ne(members.id, member.id), sql`REGEXP_REPLACE(${members.phone}, '[^0-9]', '') = ${digits}`,
        )).limit(1);
        if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "이미 등록된 연락처입니다. 고객 문의로 확인을 요청해 주세요." });
        await consumeProof("phone_change", digits, input.phoneProof);
      }
      if (changes.email !== undefined) {
        const [duplicate] = await tx.select({ id: members.id }).from(members).where(and(ne(members.id, member.id), eq(members.email, changes.email))).limit(1);
        if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "이미 등록된 이메일입니다. 다른 이메일을 입력하거나 고객 문의로 확인해 주세요." });
        await consumeProof("email_change", changes.email, input.emailProof);
      }
      // Quota, both proof uses and profile write commit or roll back together. No coupon/consent/point changes.
      await tx.update(members).set({ ...changes, lastSelfProfileEditAt: now }).where(eq(members.id, member.id));
      return { success: true, changed: true, ...getMemberProfileEditAvailability(now, now), auth: { email: changes.email ?? member.email, phone: changes.phone ?? member.phone } };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if ((error as { code?: string; cause?: { code?: string } }).code === "ER_DUP_ENTRY" || (error as { cause?: { code?: string } }).cause?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "이미 등록된 이메일입니다. 고객 문의로 확인해 주세요." });
    throw error;
  }
}
