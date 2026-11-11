import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, Mail, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { formatKoreanMobilePhone, memberPhoneSchema } from "@shared/memberRegistration";
import { toast } from "sonner";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export type LoginChallenge =
  | { method: "email"; email: string; sentAt: number }
  | { method: "phone"; phone: string; challengeId: string; sentAt: number };

export function useRemainingSeconds(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatRemainingTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LoginStep({ onNext }: { onNext: (challenge: LoginChallenge) => void }) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const sendEmailMutation = trpc.membership.sendOtp.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("인증코드가 이메일로 발송되었습니다.");
      onNext({ method: "email", email: variables.email, sentAt: Date.now() });
    },
    onError: (error) => toast.error(error.message),
  });
  const sendPhoneMutation = trpc.membership.sendPhoneLoginOtp.useMutation({
    onSuccess: (data, variables) => {
      // 등록 여부와 무관한 안내는 API 응답을 받은 뒤에만 표시합니다.
      toast.success("등록된 휴대폰 번호인 경우 인증코드를 발송했습니다.");
      onNext({ method: "phone", phone: variables.phone, challengeId: data.challengeId, sentAt: Date.now() });
    },
    onError: (error) => toast.error(error.message),
  });
  const busy = sendEmailMutation.isPending || sendPhoneMutation.isPending;

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-8 mb-8">
      <div className="flex items-center gap-2 mb-2"><Mail className="w-4 h-4 text-primary" /><p className="text-sm font-semibold text-foreground">본인인증</p></div>
      <div className="flex gap-2 mt-4 mb-4" role="group" aria-label="본인인증 방법">
        <Button type="button" size="sm" variant={method === "email" ? "default" : "outline"} aria-pressed={method === "email"} disabled={busy} onClick={() => setMethod("email")}>이메일</Button>
        <Button type="button" size="sm" variant={method === "phone" ? "default" : "outline"} aria-pressed={method === "phone"} disabled={busy} onClick={() => setMethod("phone")}>휴대폰</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">가입 시 등록한 {method === "email" ? "이메일" : "휴대폰 번호"}로 인증코드를 요청합니다.</p>
      <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (method === "phone") {
          const parsed = memberPhoneSchema.safeParse(phone);
          if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "휴대폰 번호를 확인해 주세요."); return; }
          sendPhoneMutation.mutate({ phone: parsed.data });
        } else {
          const normalized = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { toast.error("올바른 이메일을 입력해 주세요."); return; }
          sendEmailMutation.mutate({ email: normalized });
        }
      }}>
        <Label htmlFor="login-contact">{method === "email" ? "이메일" : "휴대폰 번호"}</Label>
        <div className="flex gap-3">
          {method === "email" ? (
            <Input id="login-contact" type="email" placeholder="이메일 입력" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} className="h-11 flex-1" autoComplete="email" required />
          ) : (
            <Input id="login-contact" type="tel" inputMode="tel" placeholder="010-1234-5678" value={phone} onChange={(event) => setPhone(formatKoreanMobilePhone(event.target.value))} disabled={busy} className="h-11 flex-1" autoComplete="tel" required />
          )}
          <Button type="submit" className="h-11 px-6 gap-2" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}발송</Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground mt-4 leading-relaxed">이메일에 오타가 있으면 등록된 휴대폰으로, 휴대폰에 오타가 있으면 등록된 이메일로 인증해 주세요. 둘 다 잘못 등록되어 있으면 고객 문의 또는 <a href="mailto:contact@nops.kr" className="text-primary underline underline-offset-2">contact@nops.kr</a>로 문의해 주세요.</p>
      <div className="mt-6 pt-6 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground mb-3">아직 회원이 아니신가요?</p>
        <Link href="/register"><Button variant="outline" size="sm">무료 가입</Button></Link>
      </div>
    </div>
  );
}

export function LoginOtpStep({ challenge: initialChallenge, onSuccess, onBack }: {
  challenge: LoginChallenge;
  onSuccess: (memberId: number, profileToken: string) => void;
  onBack: () => void;
}) {
  const [challenge, setChallenge] = useState(initialChallenge);
  const [code, setCode] = useState("");
  const remaining = useRemainingSeconds(challenge.sentAt + OTP_LIFETIME_MS);
  const cooldown = useRemainingSeconds(challenge.sentAt + RESEND_COOLDOWN_MS);
  const verified = (data: { memberId: number; profileToken: string }) => {
    toast.success("인증되었습니다.");
    onSuccess(data.memberId, data.profileToken);
  };
  const verificationError = (error: { message: string; data?: { code: string } | null }) => {
    toast.error(error.data?.code === "UNAUTHORIZED" ? "인증코드가 올바르지 않거나 만료되었습니다. 다시 본인인증해 주세요." : error.message);
  };
  const verifyEmailMutation = trpc.membership.verifyOtp.useMutation({ onSuccess: verified, onError: verificationError });
  const verifyPhoneMutation = trpc.membership.verifyPhoneLoginOtp.useMutation({ onSuccess: verified, onError: verificationError });
  const resendEmailMutation = trpc.membership.sendOtp.useMutation({
    onSuccess: (_data, variables) => {
      setChallenge({ method: "email", email: variables.email, sentAt: Date.now() });
      setCode("");
      toast.success("인증코드를 재발송했습니다.");
    },
    onError: (error) => toast.error(error.message),
  });
  const resendPhoneMutation = trpc.membership.sendPhoneLoginOtp.useMutation({
    onSuccess: (data, variables) => {
      setChallenge({ method: "phone", phone: variables.phone, challengeId: data.challengeId, sentAt: Date.now() });
      setCode("");
      toast.success("등록된 휴대폰 번호인 경우 인증코드를 발송했습니다.");
    },
    onError: (error) => toast.error(error.message),
  });
  const busy = verifyEmailMutation.isPending || verifyPhoneMutation.isPending || resendEmailMutation.isPending || resendPhoneMutation.isPending;
  const destination = challenge.method === "email" ? challenge.email : challenge.phone;

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-8 mb-8">
      <div className="flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-primary" /><p className="text-sm font-semibold text-foreground">인증코드 입력</p></div>
      <p className="text-sm text-muted-foreground mb-1"><span className="font-medium text-foreground">{destination}</span>{challenge.method === "email" ? "로 발송된" : "가 등록된 번호인 경우 발송된"}</p>
      <p className="text-sm text-muted-foreground mb-4">6자리 코드를 입력해 주세요 (유효시간 10분).</p>
      <p className={`text-xs mb-4 ${remaining === 0 ? "text-destructive" : "text-muted-foreground"}`} role="status">{remaining > 0 ? `남은 시간 ${formatRemainingTime(remaining)}` : "인증코드가 만료되었습니다. 코드를 재발송해 주세요."}</p>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (remaining === 0) { toast.error("인증코드가 만료되었습니다. 재발송해 주세요."); return; }
        if (!/^\d{6}$/.test(code)) { toast.error("6자리 코드를 입력해 주세요."); return; }
        if (challenge.method === "email") verifyEmailMutation.mutate({ email: challenge.email, code });
        else verifyPhoneMutation.mutate({ phone: challenge.phone, challengeId: challenge.challengeId, code });
      }}>
        <Label htmlFor="login-otp" className="sr-only">인증코드 6자리</Label>
        <Input id="login-otp" placeholder="인증코드 6자리" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 text-center text-xl font-mono tracking-widest" inputMode="numeric" maxLength={6} autoComplete="one-time-code" disabled={busy} autoFocus />
        <Button type="submit" className="w-full h-11" disabled={busy || code.length !== 6 || remaining === 0}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}확인</Button>
      </form>
      <div className="flex items-center justify-between mt-4 gap-3">
        <button type="button" onClick={onBack} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">← 인증 방법 다시 선택</button>
        <button type="button" onClick={() => {
          if (busy || Date.now() < challenge.sentAt + RESEND_COOLDOWN_MS) return;
          if (challenge.method === "email") resendEmailMutation.mutate({ email: challenge.email });
          else resendPhoneMutation.mutate({ phone: challenge.phone });
        }} disabled={busy || cooldown > 0} className="text-xs text-primary hover:opacity-70 transition-opacity disabled:opacity-50">{resendEmailMutation.isPending || resendPhoneMutation.isPending ? "발송 중..." : cooldown > 0 ? `재발송 (${cooldown}초 후)` : "코드 재발송"}</button>
      </div>
    </div>
  );
}
