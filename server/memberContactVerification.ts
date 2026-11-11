import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { SignJWT, jwtVerify } from "jose";
import { SolapiMessageService } from "solapi";
import { memberContactChallenges, members } from "../drizzle/schema";
import {
  memberEmailSchema,
  memberPhoneSchema,
} from "@shared/memberRegistration";
import { getMemberProfileEditAvailability } from "@shared/memberProfilePolicy";
import { getDb, getMemberByEmail } from "./db";
import { sendOtpEmail } from "./email";
import {
  createMemberProfileToken,
  verifyMemberProfileToken,
} from "./memberProfileAuth";

const TTL_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;
const PROOF_ISSUER = "nops-member-contact-proof";
const PROOF_AUDIENCE = "nops-member-email-change";
const PHONE_PROOF_AUDIENCE = "nops-member-phone-change";
const ZERO_HASH = "0".repeat(64);
const EPOCH = new Date("2000-01-01T00:00:00Z");
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Member = typeof members.$inferSelect;
type Challenge = typeof memberContactChallenges.$inferSelect;
type Purpose = Challenge["purpose"];

function unauthorized() {
  return new TRPCError({
    code: "UNAUTHORIZED",
    message: "본인인증에 실패했습니다. 인증을 다시 요청해 주세요.",
  });
}
function unavailable() {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "인증번호를 발송할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  });
}
function rateLimited() {
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: "인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  });
}
function requireMonthlyAvailability(member: Member) {
  if (!getMemberProfileEditAvailability(member.lastSelfProfileEditAt).canEdit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "회원정보는 월 1회 수정할 수 있습니다. 다음 달에 다시 시도해 주세요.",
    });
  }
}
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw unavailable();
  return value;
}
function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function codeHash(id: string, purpose: Purpose, code: string) {
  return createHmac("sha256", secret())
    .update(`${purpose}:${id}:${code}`)
    .digest("hex");
}
function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}
function parsePhone(value: string) {
  const result = memberPhoneSchema.safeParse(value);
  if (!result.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "휴대폰 번호를 정확히 입력해 주세요.",
    });
  return phoneDigits(result.data);
}
function parseEmail(value: string) {
  const result = memberEmailSchema.safeParse(value);
  if (!result.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        result.error.issues[0]?.message ?? "이메일 주소를 확인해 주세요.",
    });
  return result.data;
}
function requesterHash(requestKey: string) {
  if (
    typeof requestKey !== "string" ||
    !requestKey.trim() ||
    requestKey.length > 1024
  )
    throw unavailable();
  // Only the server-derived request key is accepted by the router; never a client IP field.
  return sha(requestKey);
}
async function database() {
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}

/**
 * Persistent, non-verifiable sentinel rows serialize target/requester rate checks,
 * including first-ever requests and unknown numbers. Their epoch createdAt excludes
 * them from rate windows; memberId=null excludes them from member/latest queries.
 * Using table row locks avoids process-local limits and pooled GET_LOCK leakage.
 */
async function lockRateKeys(tx: Tx, keys: string[]) {
  for (const key of Array.from(new Set(keys)).sort()) {
    const hash = sha(`member-contact-rate-lock:${key}`);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    await tx
      .insert(memberContactChallenges)
      .values({
        id,
        memberId: null,
        purpose: "phone_login",
        target: "",
        issuerHash: null,
        emailSnapshot: null,
        phoneSnapshot: null,
        codeHash: ZERO_HASH,
        attempts: 5,
        expiresAt: EPOCH,
        verifiedAt: null,
        usedAt: EPOCH,
        requesterHash: ZERO_HASH,
        createdAt: EPOCH,
      })
      .onDuplicateKeyUpdate({ set: { id } });
    await tx
      .select({ id: memberContactChallenges.id })
      .from(memberContactChallenges)
      .where(eq(memberContactChallenges.id, id))
      .limit(1)
      .for("update");
  }
}

async function withinRate(
  tx: Tx,
  input: {
    target: string;
    purpose: Purpose;
    memberId: number | null;
    requesterHash: string;
  },
  now: Date
) {
  const scope = [
    eq(memberContactChallenges.target, input.target),
    eq(memberContactChallenges.requesterHash, input.requesterHash),
  ];
  if (input.memberId !== null)
    scope.push(
      and(
        eq(memberContactChallenges.memberId, input.memberId),
        eq(memberContactChallenges.purpose, input.purpose)
      )!
    );
  // The target/requester sentinel and member row are already locked. This is the
  // first consistent read in the transaction, after all lock waits have completed.
  const recent = await tx
    .select()
    .from(memberContactChallenges)
    .where(
      and(
        gte(
          memberContactChallenges.createdAt,
          new Date(now.getTime() - HOUR_MS)
        ),
        or(...scope)
      )
    );
  const target = recent.filter(row => row.target === input.target);
  const member = recent.filter(
    row =>
      input.memberId !== null &&
      row.memberId === input.memberId &&
      row.purpose === input.purpose
  );
  const requester = recent.filter(
    row => row.requesterHash === input.requesterHash
  );
  return (
    requester.length < 30 &&
    [target, member].every(
      rows =>
        rows.length < 5 &&
        rows.every(row => now.getTime() - row.createdAt.getTime() >= 60_000)
    )
  );
}
async function lockMember(tx: Tx, memberId: number) {
  const [member] = await tx
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)
    .for("update");
  return member;
}
async function phoneMatches(tx: Tx, phone: string) {
  // Do NOT filter status: active + inactive legacy duplicates also require manual help.
  return tx
    .select()
    .from(members)
    .where(sql`REGEXP_REPLACE(${members.phone}, '[^0-9]', '') = ${phone}`)
    .orderBy(asc(members.id))
    .limit(2)
    .for("update");
}
async function latestChallenge(tx: Tx, memberId: number, purpose: Purpose) {
  const [latest] = await tx
    .select()
    .from(memberContactChallenges)
    .where(
      and(
        eq(memberContactChallenges.memberId, memberId),
        eq(memberContactChallenges.purpose, purpose)
      )
    )
    .orderBy(
      desc(memberContactChallenges.createdAt),
      desc(memberContactChallenges.id)
    )
    .limit(1)
    .for("update");
  return latest;
}
function snapshotsMatch(row: Challenge, member: Member) {
  return (
    member.status === "active" &&
    row.memberId === member.id &&
    row.emailSnapshot === member.email &&
    row.phoneSnapshot === phoneDigits(member.phone)
  );
}
async function insertChallenge(
  tx: Tx,
  member: Member | undefined,
  input: {
    id: string;
    purpose: Purpose;
    target: string;
    issuerHash?: string;
    requesterHash: string;
    code: string;
  },
  now: Date
) {
  if (member) {
    // A replacement invalidates earlier OTPs AND outstanding email-change proofs.
    await tx
      .update(memberContactChallenges)
      .set({ usedAt: now })
      .where(
        and(
          eq(memberContactChallenges.memberId, member.id),
          eq(memberContactChallenges.purpose, input.purpose),
          isNull(memberContactChallenges.usedAt)
        )
      );
  }
  await tx.insert(memberContactChallenges).values({
    id: input.id,
    memberId: member?.id ?? null,
    purpose: input.purpose,
    target: input.target,
    issuerHash: input.issuerHash ?? null,
    emailSnapshot: member?.email ?? null,
    phoneSnapshot: member ? phoneDigits(member.phone) : null,
    codeHash: codeHash(input.id, input.purpose, input.code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + TTL_MS),
    verifiedAt: null,
    // Pending provider acceptance is deliberately not verifiable.
    usedAt: now,
    requesterHash: input.requesterHash,
    createdAt: now,
  });
}
async function finishDelivery(
  db: Db,
  memberId: number,
  purpose: Purpose,
  id: string,
  accepted: boolean
) {
  await db.transaction(async tx => {
    const member = await lockMember(tx, memberId);
    const latest = await latestChallenge(tx, memberId, purpose);
    if (!latest || latest.id !== id) return;
    const now = new Date();
    const usable =
      accepted &&
      member &&
      snapshotsMatch(latest, member) &&
      latest.expiresAt > now;
    await tx
      .update(memberContactChallenges)
      .set({ usedAt: usable ? null : now })
      .where(eq(memberContactChallenges.id, id));
  });
}

type SmsRequest = { to: string; from: string; type: "SMS"; text: string };
type SmsCompatibilityClient = {
  sendOne?: (message: SmsRequest) => Promise<unknown>;
  send?: (message: SmsRequest) => Promise<unknown>;
};
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function smsAccepted(value: unknown) {
  const response = record(value);
  // v6 send returns {groupInfo,failedMessageList}; older sendOne returns group info.
  const group = response.groupInfo ? record(response.groupInfo) : response;
  const count = record(group.count);
  const failedList = response.failedMessageList;
  if (
    failedList !== undefined &&
    (!Array.isArray(failedList) || failedList.length !== 0)
  )
    return false;
  if (response.failedCount !== undefined && response.failedCount !== 0)
    return false;
  return (
    typeof group.groupId === "string" &&
    group.groupId.length > 0 &&
    typeof group.status === "string" &&
    ["SENDING", "COMPLETE"].includes(group.status) &&
    count.total === 1 &&
    count.registeredSuccess === 1 &&
    count.registeredFailed === 0 &&
    typeof count.sentFailed === "number" &&
    count.sentFailed === 0
  );
}
async function sendPhoneCode(phone: string, code: string) {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = phoneDigits(process.env.SOLAPI_SENDER_PHONE ?? "");
  if (!apiKey || !apiSecret || !/^\d{8,15}$/.test(from)) return false;
  try {
    const client = new SolapiMessageService(apiKey, apiSecret);
    const balance = await client.getBalance();
    // Reserve >=100 KRW cash conservatively; never trigger recharge/top-ups.
    if (!Number.isFinite(balance.balance) || balance.balance < 100)
      return false;
    const message: SmsRequest = {
      to: phone,
      from,
      type: "SMS",
      // 81 EUC-KR bytes: comfortably within one Korean SMS, not promotional.
      text: `[NOPS] 본인인증 코드 ${code}. 유효 10분. 본인이 요청하지 않았다면 입력하지 마세요.`,
    };
    const compat = client as unknown as SmsCompatibilityClient;
    // solapi@6.0.1 removed sendOne; its send accepts a SINGLE message object.
    // Exactly one submission, with no fallback after an attempted/uncertain send.
    const result =
      typeof compat.sendOne === "function"
        ? await compat.sendOne(message)
        : typeof compat.send === "function"
          ? await compat.send(message)
          : undefined;
    return smsAccepted(result);
  } catch {
    // Provider exceptions may include phone, code or credentials: never log/rethrow.
    return false;
  }
}

export async function requestMemberPhoneLogin(input: {
  phone: string;
  requestKey: string;
}): Promise<{ success: true; challengeId: string }> {
  const phone = parsePhone(input.phone);
  const requester = requesterHash(input.requestKey);
  const db = await database();
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const member = await db.transaction(async tx => {
    await lockRateKeys(tx, [`requester:${requester}`, `target:${phone}`]);
    const matches = await phoneMatches(tx, phone);
    const match =
      matches.length === 1 && matches[0].status === "active"
        ? matches[0]
        : undefined;
    const now = new Date();
    if (
      !(await withinRate(
        tx,
        {
          target: phone,
          purpose: "phone_login",
          memberId: match?.id ?? null,
          requesterHash: requester,
        },
        now
      ))
    )
      return undefined;
    await insertChallenge(
      tx,
      match,
      {
        id,
        purpose: "phone_login",
        target: phone,
        requesterHash: requester,
        code,
      },
      now
    );
    return match;
  });
  // Same shape for unknown, ambiguous, inactive and throttled requests; no member creation.
  if (!member) return { success: true, challengeId: id };
  const accepted = await sendPhoneCode(phone, code);
  await finishDelivery(db, member.id, "phone_login", id, accepted);
  if (!accepted) throw unavailable();
  return { success: true, challengeId: id };
}

function validOtp(
  row: Challenge | undefined,
  member: Member | undefined,
  input: { id: string; purpose: Purpose; target: string; issuerHash?: string },
  now: Date
): row is Challenge {
  return (
    !!row &&
    !!member &&
    row.id === input.id &&
    row.purpose === input.purpose &&
    row.target === input.target &&
    snapshotsMatch(row, member) &&
    (input.issuerHash === undefined || row.issuerHash === input.issuerHash) &&
    row.usedAt === null &&
    row.verifiedAt === null &&
    row.expiresAt > now &&
    row.attempts < 5
  );
}
async function correctCode(tx: Tx, row: Challenge, code: string, now: Date) {
  const supplied = codeHash(
    row.id,
    row.purpose,
    typeof code === "string" ? code : ""
  );
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(supplied, "hex");
  if (
    /^\d{6}$/.test(code) &&
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  )
    return true;
  const attempts = row.attempts + 1;
  await tx
    .update(memberContactChallenges)
    .set({ attempts, ...(attempts >= 5 ? { usedAt: now } : {}) })
    .where(eq(memberContactChallenges.id, row.id));
  return false;
}

export async function verifyMemberPhoneLogin(input: {
  challengeId: string;
  phone: string;
  code: string;
}): Promise<{ success: true; memberId: number; profileToken: string }> {
  const parsed = memberPhoneSchema.safeParse(input.phone);
  if (!parsed.success) throw unauthorized();
  const phone = phoneDigits(parsed.data);
  const db = await database();
  const result = await db.transaction(async tx => {
    const matches = await phoneMatches(tx, phone);
    if (matches.length !== 1 || matches[0].status !== "active") return null;
    const member = matches[0];
    const row = await latestChallenge(tx, member.id, "phone_login");
    const now = new Date();
    if (
      !validOtp(
        row,
        member,
        { id: input.challengeId, purpose: "phone_login", target: phone },
        now
      )
    )
      return null;
    if (!(await correctCode(tx, row, input.code, now))) return null;
    const profileToken = await createMemberProfileToken(
      member.id,
      member.email,
      member.phone,
      "phone"
    );
    await tx
      .update(memberContactChallenges)
      .set({ verifiedAt: now, usedAt: now })
      .where(eq(memberContactChallenges.id, row.id));
    return { success: true as const, memberId: member.id, profileToken };
  });
  // Wrong attempts MUST commit before throwing; throwing inside would roll them back.
  if (!result) throw unauthorized();
  return result;
}

async function ensureEmailAvailable(email: string, memberId: number) {
  const existing = await getMemberByEmail(email);
  if (existing && existing.id !== memberId)
    throw new TRPCError({
      code: "CONFLICT",
      message: "이미 등록된 이메일입니다. 다른 이메일을 입력해 주세요.",
    });
}

type ChangePurpose = "email_change" | "phone_change";
type ChangeSession = { memberId: number; profileToken: string };
function proofAudience(purpose: ChangePurpose) {
  return purpose === "email_change" ? PROOF_AUDIENCE : PHONE_PROOF_AUDIENCE;
}
async function ensureTargetAvailable(
  tx: Tx,
  member: Member,
  target: string,
  purpose: ChangePurpose
) {
  if (purpose === "email_change")
    return ensureEmailAvailable(target, member.id);
  const matches = await tx
    .select({ id: members.id })
    .from(members)
    .where(sql`REGEXP_REPLACE(${members.phone}, '[^0-9]', '') = ${target}`)
    .limit(2);
  if (matches.some(row => row.id !== member.id)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "이미 등록된 연락처입니다. 고객 문의로 확인을 요청해 주세요.",
    });
  }
}

async function requestContactChange(
  input: ChangeSession & { requestKey: string },
  target: string,
  purpose: ChangePurpose
): Promise<{ success: true; challengeId: string }> {
  const requester = requesterHash(input.requestKey);
  const db = await database();
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const member = await db.transaction(async tx => {
    await lockRateKeys(tx, [`requester:${requester}`, `target:${target}`]);
    const current = await lockMember(tx, input.memberId);
    if (!current || current.status !== "active") throw unauthorized();
    await verifyMemberProfileToken(
      input.profileToken,
      current.id,
      current.email,
      current.phone
    );
    requireMonthlyAvailability(current);
    const currentTarget =
      purpose === "email_change"
        ? current.email.trim().toLowerCase()
        : phoneDigits(current.phone);
    if (target === currentTarget)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "현재 정보와 다른 연락처를 입력해 주세요.",
      });
    await ensureTargetAvailable(tx, current, target, purpose);
    const now = new Date();
    if (
      !(await withinRate(
        tx,
        { target, purpose, memberId: current.id, requesterHash: requester },
        now
      ))
    )
      throw rateLimited();
    await insertChallenge(
      tx,
      current,
      {
        id,
        purpose,
        target,
        issuerHash: sha(input.profileToken),
        requesterHash: requester,
        code,
      },
      now
    );
    return current;
  });
  let accepted = false;
  try {
    if (purpose === "phone_change")
      accepted = await sendPhoneCode(target, code);
    else {
      const result = await sendOtpEmail({
        to: target,
        name: member.name ?? "회원",
        code,
        purpose: "email_change",
      });
      accepted = result?.success === true;
    }
  } catch {
    /* Fail closed; never print provider exceptions or the plaintext code. */
  }
  await finishDelivery(db, member.id, purpose, id, accepted);
  if (!accepted) throw unavailable();
  return { success: true, challengeId: id };
}

export async function requestMemberEmailChange(input: {
  memberId: number;
  profileToken: string;
  newEmail: string;
  requestKey: string;
}): Promise<{ success: true; challengeId: string }> {
  return requestContactChange(
    input,
    parseEmail(input.newEmail),
    "email_change"
  );
}
export async function requestMemberPhoneChange(input: {
  memberId: number;
  profileToken: string;
  newPhone: string;
  requestKey: string;
}): Promise<{ success: true; challengeId: string }> {
  return requestContactChange(
    input,
    parsePhone(input.newPhone),
    "phone_change"
  );
}

async function verifyContactChange(
  input: ChangeSession & { challengeId: string; code: string },
  target: string,
  purpose: ChangePurpose
) {
  const db = await database();
  const result = await db.transaction(async tx => {
    const member = await lockMember(tx, input.memberId);
    if (!member || member.status !== "active") return null;
    await verifyMemberProfileToken(
      input.profileToken,
      member.id,
      member.email,
      member.phone
    );
    const row = await latestChallenge(tx, member.id, purpose);
    const now = new Date();
    const issuerHash = sha(input.profileToken);
    if (
      !validOtp(
        row,
        member,
        { id: input.challengeId, purpose, target, issuerHash },
        now
      )
    )
      return null;
    if (!(await correctCode(tx, row, input.code, now))) return null;
    await ensureTargetAvailable(tx, member, target, purpose);
    const expiresAt = new Date(now.getTime() + TTL_MS);
    const token = await new SignJWT({
      memberId: member.id,
      ...(purpose === "email_change"
        ? { newEmail: target }
        : { newPhone: target }),
      challengeId: row.id,
      issuerHash,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(PROOF_ISSUER)
      .setAudience(proofAudience(purpose))
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(new TextEncoder().encode(secret()));
    // Extend the verified row for the proof's own 10-minute life, NOT OTP reuse.
    await tx
      .update(memberContactChallenges)
      .set({ verifiedAt: now, expiresAt })
      .where(eq(memberContactChallenges.id, row.id));
    return token;
  });
  if (!result) throw unauthorized();
  return result;
}

export async function verifyMemberEmailChange(input: {
  memberId: number;
  profileToken: string;
  newEmail: string;
  challengeId: string;
  code: string;
}): Promise<{ success: true; emailChangeToken: string }> {
  return {
    success: true,
    emailChangeToken: await verifyContactChange(
      input,
      parseEmail(input.newEmail),
      "email_change"
    ),
  };
}
export async function verifyMemberPhoneChange(input: {
  memberId: number;
  profileToken: string;
  newPhone: string;
  challengeId: string;
  code: string;
}): Promise<{ success: true; phoneChangeToken: string }> {
  return {
    success: true,
    phoneChangeToken: await verifyContactChange(
      input,
      parsePhone(input.newPhone),
      "phone_change"
    ),
  };
}

async function verifyContactChangeProof(
  input: ChangeSession,
  target: string,
  token: string,
  purpose: ChangePurpose
): Promise<{ challengeId: string; issuerHash: string }> {
  const issuerHash = sha(input.profileToken);
  let challengeId: string;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret()),
      {
        algorithms: ["HS256"],
        issuer: PROOF_ISSUER,
        audience: proofAudience(purpose),
      }
    );
    const payloadTarget =
      purpose === "email_change" ? payload.newEmail : payload.newPhone;
    if (
      payload.memberId !== input.memberId ||
      payloadTarget !== target ||
      payload.issuerHash !== issuerHash ||
      typeof payload.challengeId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.challengeId)
    )
      throw unauthorized();
    challengeId = payload.challengeId;
  } catch {
    throw unauthorized();
  }
  const db = await database();
  const valid = await db.transaction(async tx => {
    const member = await lockMember(tx, input.memberId);
    if (!member || member.status !== "active") return false;
    await verifyMemberProfileToken(
      input.profileToken,
      member.id,
      member.email,
      member.phone
    );
    const row = await latestChallenge(tx, member.id, purpose);
    return (
      !!row &&
      row.id === challengeId &&
      row.target === target &&
      row.issuerHash === issuerHash &&
      snapshotsMatch(row, member) &&
      row.verifiedAt !== null &&
      row.usedAt === null &&
      row.expiresAt > new Date()
    );
  });
  if (!valid) throw unauthorized();
  // Deliberately read-only. The parent profile DB transaction locks/rechecks this
  // row and consumes usedAt atomically with contact change and the monthly quota.
  return { challengeId, issuerHash };
}

export async function verifyMemberEmailChangeProof(input: {
  memberId: number;
  profileToken: string;
  newEmail: string;
  emailChangeToken: string;
}): Promise<{ challengeId: string; issuerHash: string }> {
  return verifyContactChangeProof(
    input,
    parseEmail(input.newEmail),
    input.emailChangeToken,
    "email_change"
  );
}
export async function verifyMemberPhoneChangeProof(input: {
  memberId: number;
  profileToken: string;
  newPhone: string;
  phoneChangeToken: string;
}): Promise<{ challengeId: string; issuerHash: string }> {
  return verifyContactChangeProof(
    input,
    parsePhone(input.newPhone),
    input.phoneChangeToken,
    "phone_change"
  );
}
