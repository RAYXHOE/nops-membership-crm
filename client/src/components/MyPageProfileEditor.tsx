import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { formatKoreanMobilePhone, memberBirthDateSchema, memberEmailSchema, memberPhoneSchema } from "@shared/memberRegistration";
import { toast } from "sonner";
import { formatRemainingTime, useRemainingSeconds } from "./MyPageAuthentication";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function phoneDigits(value: string): string { return value.replace(/\D/g, ""); }
function dateInputValue(value: Date | string): string { return new Date(value).toISOString().slice(0, 10); }

export type ProfileEditorProps = {
  memberId: number;
  phone: string;
  birthDate: Date | string;
  currentEmail: string;
  profileToken: string | null;
  onUpdated: () => void;
  onProfileToken: (token: string) => void;
  onReauthenticate: () => void;
};

export function ProfileEditor(props: ProfileEditorProps) {
  const { memberId, profileToken, onReauthenticate } = props;
  const [editing, setEditing] = useState(false);
  const statusQuery = trpc.membership.getProfileEditStatus.useQuery(
    { memberId, profileToken: profileToken ?? "" },
    { enabled: !!profileToken, refetchOnWindowFocus: true, retry: false },
  );
  // URL의 memberId만으로는 연락처·이메일·생년월일을 표시하거나 수정하지 않습니다.
  const verified = !!profileToken && statusQuery.isSuccess && !statusQuery.error;
  const limited = statusQuery.data?.canEdit === false;
  const nextAllowed = statusQuery.data?.nextAllowedAt
    ? new Date(statusQuery.data.nextAllowedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : null;

  return (
    <div className="py-4 border-t border-border/30">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold">회원정보 수정</p>
        {!editing && <Button type="button" size="sm" variant="outline" disabled={!!profileToken && (!verified || limited)} onClick={() => {
          if (!profileToken) { onReauthenticate(); return; }
          if (verified && !limited) setEditing(true);
        }}><Pencil className="w-3.5 h-3.5 mr-1.5" />수정</Button>}
      </div>
      <p className="text-xs text-muted-foreground mb-3">이메일·연락처·생년월일 수정은 합산 월 1회입니다. 여러 항목을 한 번에 저장해도 1회이며, 매월 1일 00:00(한국시간)에 다시 가능합니다. 변경이 없으면 수정 횟수는 차감되지 않습니다.</p>
      {verified && limited && <p className="text-xs text-amber-700 mb-3">이번 달 수정이 완료되었습니다. 다음 수정 가능일: {nextAllowed}. 긴급 정정은 고객 문의를 이용해 주세요.</p>}
      {profileToken && statusQuery.error && <div className="mb-3 text-xs text-destructive">
        <p>{statusQuery.error.data?.code === "UNAUTHORIZED" ? "본인인증이 만료되었습니다. 다시 본인인증해 주세요." : statusQuery.error.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={statusQuery.error.data?.code === "UNAUTHORIZED" ? onReauthenticate : () => { void statusQuery.refetch(); }}>{statusQuery.error.data?.code === "UNAUTHORIZED" ? "다시 본인인증" : "다시 확인"}</Button>
      </div>}
      {!profileToken ? (
        <p className="text-xs text-muted-foreground">등록 이메일 또는 휴대폰으로 본인인증 후 회원정보를 확인하고 수정할 수 있습니다.</p>
      ) : !verified ? (
        !statusQuery.error && <p className="text-xs text-muted-foreground">본인인증 상태를 확인하는 중입니다.</p>
      ) : !editing ? (
        <div className="space-y-1 text-sm"><p>이메일: {props.currentEmail}</p><p>연락처: {props.phone}</p><p>생년월일: {dateInputValue(props.birthDate)}</p></div>
      ) : (
        <ProfileEditForm key={profileToken} {...props} profileToken={profileToken} limited={limited}
          onClose={() => setEditing(false)} onSaved={(newToken) => {
            setEditing(false);
            if (newToken && newToken !== profileToken) props.onProfileToken(newToken);
            else void statusQuery.refetch();
            props.onUpdated();
          }} onLimit={() => { void statusQuery.refetch(); }} />
      )}
    </div>
  );
}

type ContactChallenge = { contact: string; challengeId: string; sentAt: number };
type ContactProof = { contact: string; token: string; expiresAt: number };

function ProfileEditForm({ memberId, phone, birthDate, currentEmail, profileToken, limited, onClose, onSaved, onLimit, onReauthenticate }: ProfileEditorProps & {
  profileToken: string;
  limited: boolean;
  onClose: () => void;
  onSaved: (newToken?: string) => void;
  onLimit: () => void;
}) {
  const [newPhone, setNewPhone] = useState(phone);
  const [newBirthDate, setNewBirthDate] = useState(dateInputValue(birthDate));
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [emailCode, setEmailCode] = useState("");
  const [emailChallenge, setEmailChallenge] = useState<ContactChallenge | null>(null);
  const [emailProof, setEmailProof] = useState<ContactProof | null>(null);
  const [emailResendAllowedAt, setEmailResendAllowedAt] = useState<number | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneChallenge, setPhoneChallenge] = useState<ContactChallenge | null>(null);
  const [phoneProof, setPhoneProof] = useState<ContactProof | null>(null);
  const [phoneResendAllowedAt, setPhoneResendAllowedAt] = useState<number | null>(null);
  const emailRevision = useRef(0);
  const phoneRevision = useRef(0);
  const normalizedEmail = normalizeEmail(newEmail);
  const normalizedPhone = phoneDigits(newPhone);
  const emailChanged = normalizedEmail !== normalizeEmail(currentEmail);
  const phoneChanged = normalizedPhone !== phoneDigits(phone);
  const emailRemaining = useRemainingSeconds(emailChallenge ? emailChallenge.sentAt + OTP_LIFETIME_MS : null);
  const emailProofRemaining = useRemainingSeconds(emailProof?.expiresAt ?? null);
  const emailCooldown = useRemainingSeconds(emailResendAllowedAt);
  const phoneRemaining = useRemainingSeconds(phoneChallenge ? phoneChallenge.sentAt + OTP_LIFETIME_MS : null);
  const phoneProofRemaining = useRemainingSeconds(phoneProof?.expiresAt ?? null);
  const phoneCooldown = useRemainingSeconds(phoneResendAllowedAt);
  const emailVerified = !!emailProof && emailProof.contact === normalizedEmail && emailProofRemaining > 0;
  const phoneVerified = !!phoneProof && phoneProof.contact === normalizedPhone && phoneProofRemaining > 0;
  const mutationError = (error: { message: string; data?: { code: string } | null }) => {
    toast.error(error.data?.code === "UNAUTHORIZED" ? "본인인증이 만료되었거나 유효하지 않습니다. 다시 본인인증해 주세요." : error.message);
    if (error.data?.code === "TOO_MANY_REQUESTS") onLimit();
  };
  const sendEmailMutation = trpc.membership.sendProfileEmailOtp.useMutation({ onError: mutationError });
  const verifyEmailMutation = trpc.membership.verifyProfileEmailOtp.useMutation({ onError: mutationError });
  const sendPhoneMutation = trpc.membership.sendProfilePhoneOtp.useMutation({ onError: mutationError });
  const verifyPhoneMutation = trpc.membership.verifyProfilePhoneOtp.useMutation({ onError: mutationError });
  const saveMutation = trpc.membership.updateProfile.useMutation({
    onSuccess: (data) => {
      toast.success(data.changed ? "회원정보가 저장되었습니다. 이번 달 수정이 완료되었습니다." : "변경된 정보가 없습니다. 수정 횟수는 차감되지 않습니다.");
      onSaved(data.profileToken);
    },
    onError: mutationError,
  });
  const busy = sendEmailMutation.isPending || verifyEmailMutation.isPending || sendPhoneMutation.isPending || verifyPhoneMutation.isPending || saveMutation.isPending;
  const unauthorized = sendEmailMutation.error?.data?.code === "UNAUTHORIZED" || verifyEmailMutation.error?.data?.code === "UNAUTHORIZED" || sendPhoneMutation.error?.data?.code === "UNAUTHORIZED" || verifyPhoneMutation.error?.data?.code === "UNAUTHORIZED" || saveMutation.error?.data?.code === "UNAUTHORIZED";

  const requestEmailCode = () => {
    if (busy || limited || unauthorized || !emailChanged || (emailResendAllowedAt !== null && Date.now() < emailResendAllowedAt)) return;
    const parsed = memberEmailSchema.safeParse(newEmail);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "이메일을 확인해 주세요."); return; }
    const revision = emailRevision.current;
    setEmailChallenge(null); setEmailProof(null); setEmailCode("");
    sendEmailMutation.mutate({ memberId, profileToken, newEmail: parsed.data }, {
      onSuccess: (data, variables) => {
        const sentAt = Date.now();
        setEmailResendAllowedAt(sentAt + RESEND_COOLDOWN_MS);
        if (revision !== emailRevision.current) return;
        setEmailChallenge({ contact: variables.newEmail, challengeId: data.challengeId, sentAt });
        toast.success("새 이메일로 인증코드를 발송했습니다. 10분 이내에 인증해 주세요.");
      },
    });
  };
  const requestPhoneCode = () => {
    if (busy || limited || unauthorized || !phoneChanged || (phoneResendAllowedAt !== null && Date.now() < phoneResendAllowedAt)) return;
    const parsed = memberPhoneSchema.safeParse(newPhone);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "연락처를 확인해 주세요."); return; }
    const revision = phoneRevision.current;
    setPhoneChallenge(null); setPhoneProof(null); setPhoneCode("");
    sendPhoneMutation.mutate({ memberId, profileToken, newPhone: parsed.data }, {
      onSuccess: (data, variables) => {
        const sentAt = Date.now();
        setPhoneResendAllowedAt(sentAt + RESEND_COOLDOWN_MS);
        if (revision !== phoneRevision.current) return;
        setPhoneChallenge({ contact: phoneDigits(variables.newPhone), challengeId: data.challengeId, sentAt });
        toast.success("새 휴대폰으로 인증코드를 발송했습니다. 10분 이내에 인증해 주세요.");
      },
    });
  };

  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (busy || limited || unauthorized) return;
      const parsedPhone = memberPhoneSchema.safeParse(newPhone);
      if (!parsedPhone.success) { toast.error(parsedPhone.error.issues[0]?.message ?? "연락처를 확인해 주세요."); return; }
      const parsedBirthDate = memberBirthDateSchema.safeParse(newBirthDate);
      if (!parsedBirthDate.success) { toast.error(parsedBirthDate.error.issues[0]?.message ?? "생년월일을 확인해 주세요."); return; }
      if (phoneChanged && (!phoneProof || phoneProof.contact !== phoneDigits(parsedPhone.data) || Date.now() >= phoneProof.expiresAt)) {
        toast.error("새 휴대폰 인증을 완료한 뒤 모든 변경사항을 함께 저장해 주세요."); return;
      }
      if (emailChanged) {
        const parsedEmail = memberEmailSchema.safeParse(newEmail);
        if (!parsedEmail.success) { toast.error(parsedEmail.error.issues[0]?.message ?? "이메일을 확인해 주세요."); return; }
        if (!emailProof || emailProof.contact !== parsedEmail.data || Date.now() >= emailProof.expiresAt) { toast.error("새 이메일 인증을 완료한 뒤 모든 변경사항을 함께 저장해 주세요."); return; }
      }
      // 새 연락처 확인은 인증만 수행하며, 모든 변경사항은 이 요청 한 번으로 저장합니다.
      saveMutation.mutate({
        memberId, profileToken, phone: parsedPhone.data, birthDate: parsedBirthDate.data,
        ...(phoneChanged && phoneProof ? { phoneChangeToken: phoneProof.token } : {}),
        ...(emailChanged && emailProof ? { email: normalizedEmail, emailChangeToken: emailProof.token } : {}),
      });
    }}>
      <div>
        <Label htmlFor="profile-email">이메일</Label>
        <Input id="profile-email" type="email" value={newEmail} onChange={(event) => {
          emailRevision.current += 1;
          setNewEmail(event.target.value); setEmailProof(null); setEmailChallenge(null); setEmailCode("");
        }} disabled={saveMutation.isPending} autoComplete="email" required />
      </div>
      {emailChanged && <div className="space-y-2 rounded-lg border border-border/50 p-3">
        <p className="text-xs text-muted-foreground">새 이메일로 받은 인증코드를 확인해 주세요. 인증만으로는 회원정보가 바뀌지 않으며, 아래 ‘변경 저장’을 눌러야 반영됩니다.</p>
        <Button type="button" size="sm" variant="outline" onClick={requestEmailCode} disabled={busy || limited || unauthorized || emailCooldown > 0}>{sendEmailMutation.isPending ? "발송 중..." : emailCooldown > 0 ? `재발송 (${emailCooldown}초 후)` : emailChallenge ? "인증코드 재발송" : "새 이메일 인증코드 발송"}</Button>
        {emailChallenge && emailChallenge.contact === normalizedEmail && !emailVerified && <>
          <p className={`text-xs ${emailRemaining > 0 ? "text-muted-foreground" : "text-destructive"}`} role="status">{emailRemaining > 0 ? `인증코드 유효시간 10분 · 남은 시간 ${formatRemainingTime(emailRemaining)}` : "인증코드가 만료되었습니다. 재발송해 주세요."}</p>
          <Label htmlFor="profile-email-otp">이메일 인증코드</Label>
          <div className="flex gap-2">
            <Input id="profile-email-otp" placeholder="인증코드 6자리" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy || emailRemaining === 0} />
            <Button type="button" size="sm" variant="outline" disabled={busy || limited || unauthorized || emailCode.length !== 6 || emailRemaining === 0} onClick={() => {
              if (busy || limited || unauthorized || !emailChallenge || !/^\d{6}$/.test(emailCode) || Date.now() >= emailChallenge.sentAt + OTP_LIFETIME_MS) return;
              const revision = emailRevision.current;
              verifyEmailMutation.mutate({ memberId, profileToken, newEmail: emailChallenge.contact, challengeId: emailChallenge.challengeId, code: emailCode }, {
                onSuccess: (data, variables) => {
                  if (revision !== emailRevision.current) return;
                  setEmailProof({ contact: variables.newEmail, token: data.emailChangeToken, expiresAt: Date.now() + OTP_LIFETIME_MS });
                  setEmailCode("");
                  toast.success("새 이메일 인증이 완료되었습니다. 변경사항을 함께 저장해 주세요.");
                },
              });
            }}>{verifyEmailMutation.isPending ? "확인 중..." : "인증 확인"}</Button>
          </div>
        </>}
        {emailVerified && <p className="text-xs text-green-700" role="status">새 이메일 인증 완료 · {formatRemainingTime(emailProofRemaining)} 이내에 변경 저장을 눌러 주세요.</p>}
        {emailProof && !emailVerified && <p className="text-xs text-destructive">이메일 인증 유효시간이 지났습니다. 코드를 재발송하여 다시 인증해 주세요.</p>}
      </div>}
      <div>
        <Label htmlFor="profile-phone">연락처</Label>
        <Input id="profile-phone" type="tel" inputMode="numeric" value={newPhone} onChange={(event) => {
          phoneRevision.current += 1;
          setNewPhone(formatKoreanMobilePhone(event.target.value)); setPhoneProof(null); setPhoneChallenge(null); setPhoneCode("");
        }} disabled={saveMutation.isPending} autoComplete="tel" required />
      </div>
      {phoneChanged && <div className="space-y-2 rounded-lg border border-border/50 p-3">
        <p className="text-xs text-muted-foreground">새 휴대폰 번호로 받은 문자 인증코드를 확인해 주세요. 인증 후 이메일·생년월일 변경사항과 함께 저장됩니다.</p>
        <Button type="button" size="sm" variant="outline" onClick={requestPhoneCode} disabled={busy || limited || unauthorized || phoneCooldown > 0}>{sendPhoneMutation.isPending ? "발송 중..." : phoneCooldown > 0 ? `재발송 (${phoneCooldown}초 후)` : phoneChallenge ? "문자 인증코드 재발송" : "새 휴대폰 인증코드 발송"}</Button>
        {phoneChallenge && phoneChallenge.contact === normalizedPhone && !phoneVerified && <>
          <p className={`text-xs ${phoneRemaining > 0 ? "text-muted-foreground" : "text-destructive"}`} role="status">{phoneRemaining > 0 ? `인증코드 유효시간 10분 · 남은 시간 ${formatRemainingTime(phoneRemaining)}` : "인증코드가 만료되었습니다. 재발송해 주세요."}</p>
          <Label htmlFor="profile-phone-otp">휴대폰 인증코드</Label>
          <div className="flex gap-2">
            <Input id="profile-phone-otp" placeholder="인증코드 6자리" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy || phoneRemaining === 0} />
            <Button type="button" size="sm" variant="outline" disabled={busy || limited || unauthorized || phoneCode.length !== 6 || phoneRemaining === 0} onClick={() => {
              if (busy || limited || unauthorized || !phoneChallenge || !/^\d{6}$/.test(phoneCode) || Date.now() >= phoneChallenge.sentAt + OTP_LIFETIME_MS) return;
              const revision = phoneRevision.current;
              verifyPhoneMutation.mutate({ memberId, profileToken, newPhone: formatKoreanMobilePhone(phoneChallenge.contact), challengeId: phoneChallenge.challengeId, code: phoneCode }, {
                onSuccess: (data, variables) => {
                  if (revision !== phoneRevision.current) return;
                  setPhoneProof({ contact: phoneDigits(variables.newPhone), token: data.phoneChangeToken, expiresAt: Date.now() + OTP_LIFETIME_MS });
                  setPhoneCode("");
                  toast.success("새 휴대폰 인증이 완료되었습니다. 변경사항을 함께 저장해 주세요.");
                },
              });
            }}>{verifyPhoneMutation.isPending ? "확인 중..." : "인증 확인"}</Button>
          </div>
        </>}
        {phoneVerified && <p className="text-xs text-green-700" role="status">새 휴대폰 인증 완료 · {formatRemainingTime(phoneProofRemaining)} 이내에 변경 저장을 눌러 주세요.</p>}
        {phoneProof && !phoneVerified && <p className="text-xs text-destructive">휴대폰 인증 유효시간이 지났습니다. 코드를 재발송하여 다시 인증해 주세요.</p>}
      </div>}
      <div><Label htmlFor="profile-birth-date">생년월일</Label><Input id="profile-birth-date" type="date" value={newBirthDate} onChange={(event) => setNewBirthDate(event.target.value)} disabled={busy} required /></div>
      <p className="text-xs text-muted-foreground">실제 변경 저장이 성공한 경우만 1회로 계산됩니다. 이메일·연락처·생년월일을 한 번에 확인해 주세요. 기존 쿠폰·적립금·수신동의는 변경되지 않습니다.</p>
      {unauthorized && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onReauthenticate}>다시 본인인증</Button>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={saveMutation.isPending} onClick={onClose}>취소</Button>
        <Button type="submit" size="sm" disabled={busy || limited || unauthorized || (emailChanged && !emailVerified) || (phoneChanged && !phoneVerified)}>{saveMutation.isPending ? "저장 중..." : "변경 저장"}</Button>
      </div>
    </form>
  );
}
