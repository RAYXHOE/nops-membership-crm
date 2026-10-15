import { SignJWT, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("회원정보 인증 설정이 누락되었습니다.");
  return new TextEncoder().encode(secret);
}

// Only minted after successful email OTP verification. Not accepted as staff auth.
export async function createMemberProfileToken(memberId: number, email: string) {
  return new SignJWT({ memberId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("nops-member-profile")
    .setAudience("nops-member-profile-edit")
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(signingKey());
}

export async function verifyMemberProfileToken(token: string, memberId: number, email: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"], issuer: "nops-member-profile", audience: "nops-member-profile-edit",
    });
    if (payload.memberId !== memberId || payload.email !== email) throw new Error("mismatch");
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "이메일 본인인증이 필요합니다. 다시 인증해 주세요." });
  }
}
