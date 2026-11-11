import { SignJWT, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("회원정보 인증 설정이 누락되었습니다.");
  return new TextEncoder().encode(secret);
}

// Minted only after successful login OTP. Never accepted as staff authentication.
export async function createMemberProfileToken(memberId: number, email: string, phone?: string, authMethod: "email" | "phone" = "email") {
  return new SignJWT({ memberId, email, ...(phone ? { phone: phone.replace(/\D/g, "") } : {}), authMethod })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("nops-member-profile")
    .setAudience("nops-member-profile-edit")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(signingKey());
}

export async function verifyMemberProfileToken(token: string, memberId: number, email: string, phone?: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"], issuer: "nops-member-profile", audience: "nops-member-profile-edit",
    });
    if (payload.memberId !== memberId || payload.email !== email) throw new Error("mismatch");
    // Legacy email-only tokens remain valid until their original 30-minute expiry.
    if (payload.phone !== undefined && (phone === undefined || payload.phone !== phone.replace(/\D/g, ""))) throw new Error("mismatch");
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "본인인증이 필요합니다. 다시 인증해 주세요." });
  }
}
