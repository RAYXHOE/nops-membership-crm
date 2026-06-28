import { useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Crown, ArrowLeft, Search, Gift, CheckCircle2, Clock,
  XCircle, QrCode, Copy, Heart, Pencil, Check, X,
  Mail, ShieldCheck, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { CouponData as Coupon } from "@shared/types";

function QRCodeImage({ value, size = 200 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=1a1a1a&margin=10`;
  return <img src={url} alt={`QR Code: ${value}`} width={size} height={size} className="rounded-lg" />;
}

function CouponStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">사용 가능</Badge>;
  if (status === "used") return <Badge variant="secondary">사용 완료</Badge>;
  return <Badge variant="destructive">만료</Badge>;
}

function CouponTypeLabel({ type }: { type: string }) {
  if (type === "discount_percent") return "할인 쿠폰";
  if (type === "corkage_free") return "콜키지 프리";
  return "생일 쿠폰";
}

function parseAnniversaryInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function AnniversarySection({ memberId, current, onUpdated }: { memberId: number; current: string | null; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(current ?? "");

  const updateMutation = trpc.membership.updateAnniversary.useMutation({
    onSuccess: () => {
      toast.success("결혼기념일이 저장되었습니다. 매년 15% 할인 쿠폰이 발급됩니다.");
      setEditing(false);
      onUpdated();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!input.trim()) { updateMutation.mutate({ memberId, anniversaryDate: null }); return; }
    const parsed = parseAnniversaryInput(input);
    if (!parsed) { toast.error("날짜 형식을 확인해주세요. 예: 20150520"); return; }
    updateMutation.mutate({ memberId, anniversaryDate: parsed });
  };

  const displayDate = current ? new Date(current).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : null;

  return (
    <div className="flex items-center justify-between py-3 border-t border-border/30">
      <div className="flex items-center gap-2">
        <Heart className="w-4 h-4 text-pink-400" />
        <div>
          <p className="text-xs text-muted-foreground">결혼기념일</p>
          {editing ? (
            <Input className="h-7 text-sm w-40 mt-0.5" placeholder="예: 20150520" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          ) : (
            <p className="text-sm font-medium text-foreground">{displayDate ?? <span className="text-muted-foreground text-xs">미등록</span>}</p>
          )}
          {!editing && !current && <p className="text-xs text-muted-foreground mt-0.5">등록 시 매년 15% 할인 쿠폰 발급</p>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <button onClick={handleSave} disabled={updateMutation.isPending} className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"><Check className="w-4 h-4 text-primary" /></button>
            <button onClick={() => { setInput(current ?? ""); setEditing(false); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
        )}
      </div>
    </div>
  );
}

function EmailStep({ onNext }: { onNext: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const sendOtpMutation = trpc.membership.sendOtp.useMutation({
    onSuccess: () => { toast.success("인증코드가 이메일로 발송되었습니다."); onNext(email); },
    onError: (err) => toast.error(err.message),
  });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!email) return; sendOtpMutation.mutate({ email }); };
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-8 mb-8">
      <div className="flex items-center gap-2 mb-2"><Mail className="w-4 h-4 text-primary" /><p className="text-sm font-semibold text-foreground">이메일 인증</p></div>
      <p className="text-sm text-muted-foreground mb-6">가입 시 등록한 이메일로 인증코드를 발송합니다</p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <Input type="email" placeholder="이메일 입력" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 flex-1" required />
        <Button type="submit" className="h-11 px-6 gap-2" disabled={sendOtpMutation.isPending}>
          {sendOtpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}발송
        </Button>
      </form>
      <div className="mt-6 pt-6 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground mb-3">아직 회원이 아니신가요?</p>
        <Link href="/register"><Button variant="outline" size="sm">무료 가입</Button></Link>
      </div>
    </div>
  );
}

function OtpStep({ email, onSuccess, onBack }: { email: string; onSuccess: (memberId: number) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const verifyMutation = trpc.membership.verifyOtp.useMutation({
    onSuccess: (data) => { toast.success("인증되었습니다."); onSuccess(data.memberId); },
    onError: (err) => toast.error(err.message),
  });
  const resendMutation = trpc.membership.sendOtp.useMutation({
    onSuccess: () => toast.success("인증코드를 재발송했습니다."),
    onError: (err) => toast.error(err.message),
  });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (code.length !== 6) { toast.error("6자리 코드를 입력해주세요."); return; } verifyMutation.mutate({ email, code }); };
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-8 mb-8">
      <div className="flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-primary" /><p className="text-sm font-semibold text-foreground">인증코드 입력</p></div>
      <p className="text-sm text-muted-foreground mb-1"><span className="font-medium text-foreground">{email}</span> 로 발송된</p>
      <p className="text-sm text-muted-foreground mb-6">6자리 코드를 입력해주세요 (10분 이내)</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input placeholder="인증코드 6자리" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 text-center text-xl font-mono tracking-widest" inputMode="numeric" maxLength={6} autoFocus />
        <Button type="submit" className="w-full h-11" disabled={verifyMutation.isPending}>
          {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}확인
        </Button>
      </form>
      <div className="flex items-center justify-between mt-4">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← 이메일 다시 입력</button>
        <button onClick={() => resendMutation.mutate({ email })} disabled={resendMutation.isPending} className="text-xs text-primary hover:opacity-70 transition-opacity">
          {resendMutation.isPending ? "발송 중..." : "코드 재발송"}
        </button>
      </div>
    </div>
  );
}

function CouponView({ memberId }: { memberId: number }) {
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const couponsQuery = trpc.membership.getMyCoupons.useQuery({ memberId });
  const memberInfoQuery = trpc.membership.getMemberInfo.useQuery({ memberId });
  const member = memberInfoQuery.data;
  const coupons = couponsQuery.data ?? [];
  const activeCoupons = coupons.filter((c) => c.status === "active");
  const usedCoupons = coupons.filter((c) => c.status !== "active");
  const copyCode = (code: string) => { navigator.clipboard.writeText(code); toast.success("쿠폰 코드가 복사되었습니다."); };

  const updateMarketingMutation = trpc.membership.updateMarketing.useMutation({
    onSuccess: (_, variables) => {
      if (variables.marketingConsent) {
        toast.success("마케팅 동의가 완료되었습니다. 쿠폰이 발급되었습니다!");
      } else {
        toast.success("마케팅 수신이 철회되었습니다.");
      }
      memberInfoQuery.refetch();
      couponsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      {member && (
        <div className="bg-card rounded-2xl border border-primary/20 p-6 mb-8">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-xs text-muted-foreground mb-1">회원</p>
              <p className="font-semibold text-foreground">{member.name}</p>
              <p className="text-sm text-muted-foreground">{member.email}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">사용 가능 쿠폰</p>
              <p className="text-2xl font-bold text-primary">{activeCoupons.length}</p>
              <p className="text-xs text-muted-foreground">장</p>
            </div>
          </div>
          {((member as typeof member & { pointBalance?: number }).pointBalance ?? 0) > 0 && (
            <div className="flex items-center justify-between py-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">적립금 잔액</span>
              </div>
              <span className="text-sm font-bold text-primary">{((member as typeof member & { pointBalance?: number }).pointBalance ?? 0).toLocaleString()}원</span>
            </div>
          )}
          {member.marketingConsent ? (
            <div className="flex items-center justify-between py-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">마케팅 정보 수신 중</span>
              </div>
              <button
                onClick={() => {
                  if (confirm("마케팅 정보 수신을 철회하시겠습니까?")) {
                    updateMarketingMutation.mutate({ memberId, marketingConsent: false });
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                수신 철회
              </button>
            </div>
          ) : (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Gift className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 mb-1">마케팅 동의 시 쿠폰 추가 발급!</p>
                  <p className="text-xs text-amber-700 leading-relaxed mb-3">
                    마케팅 정보 수신에 동의하시면 <strong>10% 할인 쿠폰</strong>과 <strong>생일 15% 쿠폰</strong>을 즉시 발급해 드립니다.
                  </p>
                  <button
                    onClick={() => {
                      if (confirm("마케팅 정보 수신에 동의하시겠습니까?\n\n• 10% 할인 쿠폰 즉시 발급\n• 생일 15% 쿠폰 즉시 발급\n• 신메뉴 안내 및 이벤트 정보 수신")) {
                        updateMarketingMutation.mutate({ memberId, marketingConsent: true });
                      }
                    }}
                    disabled={updateMarketingMutation.isPending}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updateMarketingMutation.isPending ? "저리 중..." : "동의하고 쿠폰 받기"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <AnniversarySection memberId={memberId} current={(member as typeof member & { anniversaryDate?: string | null }).anniversaryDate ?? null} onUpdated={() => memberInfoQuery.refetch()} />
        </div>
      )}
      {couponsQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground"><Gift className="w-8 h-8 mx-auto mb-3 animate-pulse" /><p className="text-sm">쿠폰을 불러오는 중...</p></div>
      ) : (
        <>
          {activeCoupons.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" />사용 가능한 쿠폰 ({activeCoupons.length})</h2>
              <div className="space-y-3">{activeCoupons.map((c) => <CouponCard key={c.id} coupon={c} onSelect={() => setSelectedCoupon(c)} onCopy={() => copyCode(c.code)} />)}</div>
            </div>
          )}
          {usedCoupons.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2"><Clock className="w-4 h-4" />사용 완료 / 만료 ({usedCoupons.length})</h2>
              <div className="space-y-3 opacity-60">{usedCoupons.map((c) => <CouponCard key={c.id} coupon={c} onSelect={() => setSelectedCoupon(c)} onCopy={() => copyCode(c.code)} disabled />)}</div>
            </div>
          )}
          {coupons.length === 0 && <div className="text-center py-16 text-muted-foreground"><Gift className="w-10 h-10 mx-auto mb-4 opacity-30" /><p className="text-sm">보유한 쿠폰이 없습니다.</p></div>}
        </>
      )}
      <Dialog open={!!selectedCoupon} onOpenChange={() => setSelectedCoupon(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-center">{selectedCoupon?.name}</DialogTitle></DialogHeader>
          {selectedCoupon && (
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="p-4 bg-white rounded-2xl border border-border"><QRCodeImage value={selectedCoupon.code} size={180} /></div>
              <div className="w-full">
                <p className="text-xs text-muted-foreground text-center mb-2">쿠폰 코드</p>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-4 py-3">
                  <code className="flex-1 text-center text-lg font-mono font-bold text-foreground tracking-widest">{selectedCoupon.code}</code>
                  <button onClick={() => { navigator.clipboard.writeText(selectedCoupon.code); toast.success("복사되었습니다."); }} className="text-muted-foreground hover:text-foreground transition-colors"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">종류</span><span className="font-medium"><CouponTypeLabel type={selectedCoupon.type} /></span></div>
                {selectedCoupon.discountPercent && <div className="flex justify-between"><span className="text-muted-foreground">할인율</span><span className="font-bold text-primary">{selectedCoupon.discountPercent}%</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">상태</span><CouponStatusBadge status={selectedCoupon.status} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">유효기간</span><span className="font-medium">{new Date(selectedCoupon.expiresAt).toLocaleDateString("ko-KR")}까지</span></div>
              </div>
              {selectedCoupon.description && <p className="text-xs text-muted-foreground text-center border-t border-border pt-4 w-full">{selectedCoupon.description}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Step = "email" | "otp" | "coupons";

export default function MyPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);

  // 가입 완료 후 자동 진입: memberId가 URL에 있으면 OTP 건너뜀
  const urlMemberId = params.get("memberId") ? Number(params.get("memberId")) : null;

  const [step, setStep] = useState<Step>(urlMemberId ? "coupons" : "email");
  const [email, setEmail] = useState("");
  const [memberId, setMemberId] = useState<number | null>(urlMemberId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center h-16">
          <Link href="/">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />홈
            </button>
          </Link>
          <div className="flex items-center gap-2 mx-auto">
            <Crown className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-widest text-sm uppercase">NOPS</span>
          </div>
        </div>
      </header>
      <div className="container py-12 max-w-2xl">
        <div className="text-center mb-10">
          <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3">My Page</p>
          <h1 className="text-3xl font-bold text-foreground">내 쿠폰</h1>
        </div>
        {step === "email" && <EmailStep onNext={(e) => { setEmail(e); setStep("otp"); }} />}
        {step === "otp" && <OtpStep email={email} onSuccess={(id) => { setMemberId(id); setStep("coupons"); }} onBack={() => setStep("email")} />}
        {step === "coupons" && memberId && <CouponView memberId={memberId} />}
      </div>
    </div>
  );
}

function CouponCard({ coupon, onSelect, onCopy, disabled = false }: { coupon: Coupon; onSelect: () => void; onCopy: () => void; disabled?: boolean }) {
  return (
    <div className={`bg-card rounded-xl border p-5 flex items-center gap-4 transition-all duration-200 ${disabled ? "border-border/30 cursor-default" : "border-primary/20 hover:border-primary/40 hover:shadow-md cursor-pointer"}`} onClick={disabled ? undefined : onSelect}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${disabled ? "bg-muted" : "bg-primary/10"}`}>
        {coupon.status === "used" ? <CheckCircle2 className="w-6 h-6 text-muted-foreground" /> : coupon.status === "expired" ? <XCircle className="w-6 h-6 text-muted-foreground" /> : <Gift className="w-6 h-6 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-sm text-foreground truncate">{coupon.name}</p>
          {coupon.discountPercent && <span className="text-primary font-bold text-sm shrink-0">{coupon.discountPercent}%</span>}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{coupon.code}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}까지</p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <CouponStatusBadge status={coupon.status} />
        {!disabled && (
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onCopy(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><Copy className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><QrCode className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
