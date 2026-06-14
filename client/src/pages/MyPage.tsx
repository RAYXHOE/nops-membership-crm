import { useState, useEffect } from "react";
import { useSearch, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Crown, ArrowLeft, Search, Gift, CheckCircle2, Clock, XCircle, QrCode, Copy, UserPlus, Bell, BellOff, Loader2, Heart, Edit3, Check, X } from "lucide-react";
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
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">사용 가능</Badge>;
  if (status === "used") return <Badge variant="secondary" className="text-xs">사용 완료</Badge>;
  return <Badge variant="destructive" className="text-xs">만료</Badge>;
}

function CouponTypeLabel({ type }: { type: string }) {
  if (type === "discount_percent") return "할인 쿠폰";
  if (type === "corkage_free") return "콜키지 프리";
  return "생일 쿠폰";
}

export default function MyPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const [email, setEmail] = useState("");
  const [searchEmail, setSearchEmail] = useState(params.get("email") ?? "");
  const [memberId, setMemberId] = useState<number | null>(
    params.get("memberId") ? Number(params.get("memberId")) : null
  );
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [consentConfirmOpen, setConsentConfirmOpen] = useState(false);
  const utils = trpc.useUtils();

  const memberQuery = trpc.membership.getByEmail.useQuery(
    { email: searchEmail },
    { enabled: !!searchEmail && !memberId }
  );

  const couponsQuery = trpc.membership.getMyCoupons.useQuery(
    { memberId: memberId ?? memberQuery.data?.id ?? 0 },
    { enabled: !!(memberId || memberQuery.data?.id) }
  );

  useEffect(() => {
    if (memberQuery.data?.id) setMemberId(memberQuery.data.id);
  }, [memberQuery.data]);

  const member = memberQuery.data;
  const coupons = couponsQuery.data ?? [];
  const activeCoupons = coupons.filter((c) => c.status === "active");
  const usedCoupons = coupons.filter((c) => c.status !== "active");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberId(null);
    setSearchEmail(email);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("쿠폰 코드가 복사되었습니다.");
  };

  const [anniversaryEditing, setAnniversaryEditing] = useState(false);
  const [anniversaryInput, setAnniversaryInput] = useState("");

  const updateAnniversaryMutation = trpc.membership.updateAnniversary.useMutation({
    onSuccess: () => {
      utils.membership.getByEmail.invalidate();
      setAnniversaryEditing(false);
      toast.success("결혼기념일이 저장되었습니다. 매년 기념일에 15% 할인 쿠폰이 자동 발급됩니다!");
    },
    onError: (e) => toast.error(e.message),
  });

  const marketingConsentMutation = trpc.membership.updateMarketingConsent.useMutation({
    onSuccess: (data) => {
      utils.membership.getByEmail.invalidate();
      utils.membership.getMyCoupons.invalidate();
      setConsentConfirmOpen(false);
      if (data.alreadySame) {
        toast.info("이미 동일한 상태입니다.");
      } else if (data.couponsIssued > 0) {
        toast.success(`마케팅 동의가 완료되었습니다. 쿠폰 ${data.couponsIssued}장이 발급되었습니다! 구쿠폰 목록에서 확인하세요.`);
      } else {
        toast.success("마케팅 수신 설정이 변경되었습니다.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center h-16">
          <Link href="/">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              홈
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
          <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3 font-semibold">My Page</p>
          <h1 className="text-3xl font-extrabold text-foreground">내 쿠폰</h1>
        </div>

        {/* Email Search */}
        {!member && (
          <div className="space-y-4 mb-8">
            <div className="bg-card rounded-2xl border border-border/50 p-8">
              <p className="text-sm font-semibold text-foreground mb-1">회원이신가요?</p>
              <p className="text-sm text-muted-foreground mb-5">가입 시 등록한 이메일로 쿠폰을 조회하세요</p>
              <form onSubmit={handleSearch} className="flex gap-3">
                <Input
                  type="email"
                  placeholder="가입한 이메일 입력"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 flex-1 text-base"
                  inputMode="email"
                  autoComplete="email"
                />
                <Button type="submit" className="h-12 px-6 gap-2 shrink-0">
                  <Search className="w-4 h-4" />
                  조회
                </Button>
              </form>
              {memberQuery.isError && (
                <p className="text-destructive text-sm mt-3 text-center">
                  {memberQuery.error.message}
                </p>
              )}
            </div>

            {/* 비회원 가입 유도 */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-foreground mb-1">아직 회원이 아니신가요?</p>
                <p className="text-xs text-muted-foreground">가입 즉시 10% 할인 + 콜키지 프리 쿠폰 증정</p>
              </div>
              <Link href="/register">
                <Button size="sm" className="gap-1.5 shrink-0">
                  <UserPlus className="w-3.5 h-3.5" />
                  무료 가입
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Member Info */}
        {member && (
          <div className="bg-card rounded-2xl border border-primary/20 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">회원</p>
                <p className="font-bold text-foreground text-lg">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">사용 가능 쿠폰</p>
                <p className="text-3xl font-extrabold text-primary">{activeCoupons.length}</p>
                <p className="text-xs text-muted-foreground">장</p>
              </div>
            </div>

            {/* 결혼기념일 */}
            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 border-border/50 mb-3">
              <div className="flex items-center gap-2.5">
                <Heart className="w-4 h-4 text-rose-400" />
                <div>
                  <p className="text-xs font-semibold text-foreground">결혼기념일</p>
                  {anniversaryEditing ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Input
                        value={anniversaryInput}
                        onChange={(e) => setAnniversaryInput(e.target.value)}
                        placeholder="예: 2015-05-20"
                        className="h-7 text-xs w-32 font-mono"
                        maxLength={10}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && anniversaryInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            updateAnniversaryMutation.mutate({ memberId: member.id, anniversaryDate: anniversaryInput });
                          }
                          if (e.key === "Escape") setAnniversaryEditing(false);
                        }}
                      />
                      <button
                        onClick={() => {
                          if (anniversaryInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            updateAnniversaryMutation.mutate({ memberId: member.id, anniversaryDate: anniversaryInput });
                          } else {
                            toast.error("날짜 형식을 확인해주세요 (YYYY-MM-DD)");
                          }
                        }}
                        disabled={updateAnniversaryMutation.isPending}
                        className="p-1 rounded bg-primary/10 hover:bg-primary/20"
                      >
                        {updateAnniversaryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                      <button onClick={() => setAnniversaryEditing(false)} className="p-1 rounded hover:bg-muted">
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {(member as typeof member & { anniversaryDate?: string | null }).anniversaryDate
                        ? new Date((member as typeof member & { anniversaryDate?: string | null }).anniversaryDate!).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) + " · 매년 15% 쿠폰 자동 발급"
                        : "입력 시 매년 기념일에 15% 쿠폰 자동 발급"}
                    </p>
                  )}
                </div>
              </div>
              {!anniversaryEditing && (
                <button
                  onClick={() => {
                    const existing = (member as typeof member & { anniversaryDate?: string | null }).anniversaryDate;
                    setAnniversaryInput(existing ? existing.slice(0, 10) : "");
                    setAnniversaryEditing(true);
                  }}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* 마케팅 동의 현황 */}
            <div className={`flex items-center justify-between p-3 rounded-xl border ${
              member.marketingConsent
                ? "bg-primary/5 border-primary/20"
                : "bg-muted/50 border-border/50"
            }`}>
              <div className="flex items-center gap-2.5">
                {member.marketingConsent ? (
                  <Bell className="w-4 h-4 text-primary" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-semibold text-foreground">마케팅 정보 수신</p>
                  <p className="text-xs text-muted-foreground">
                    {member.marketingConsent
                      ? "신메뉴 · 이벤트 안내 수신 중"
                      : "동의 시 10% 할인 + 생일 쿠폰 발급"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={member.marketingConsent ? "outline" : "default"}
                className="text-xs h-8 shrink-0"
                onClick={() => setConsentConfirmOpen(true)}
              >
                {member.marketingConsent ? "수신 철회" : "동의하고 쿠폰 받기"}
              </Button>
            </div>
          </div>
        )}

        {/* 마케팅 동의 확인 다이얼로그 */}
        <Dialog open={consentConfirmOpen} onOpenChange={setConsentConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {member?.marketingConsent ? "마케팅 수신 철회" : "마케팅 정보 수신 동의"}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {member?.marketingConsent ? (
                <p className="text-sm text-muted-foreground">
                  마케팅 정보 수신을 철회합니다.<br />
                  철회 후에도 기본 멤버십 혜택(콜키지 프리)은 유지됩니다.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    마케팅 정보 수신에 동의하면 아래 쿠폰이 즉시 발급됩니다.
                  </p>
                  <div className="bg-primary/10 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-bold text-primary">🎁 즉시 발급 쿠폰</p>
                    <p className="text-xs text-foreground">✓ 10% 할인 쿠폰 (미발급 시)</p>
                    <p className="text-xs text-foreground">✓ 생일 15% 할인 쿠폰 (올해 미발급 시)</p>
                  </div>
                  <p className="text-xs text-muted-foreground">수신 항목: 신메뉴 안내, 이벤트 정보, 프로모션 혜택</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConsentConfirmOpen(false)}>
                취소
              </Button>
              <Button
                className="flex-1"
                variant={member?.marketingConsent ? "destructive" : "default"}
                disabled={marketingConsentMutation.isPending}
                onClick={() => {
                  if (!member) return;
                  marketingConsentMutation.mutate({
                    memberId: member.id,
                    email: member.email,
                    agreed: !member.marketingConsent,
                    userAgent: navigator.userAgent,
                  });
                }}
              >
                {marketingConsentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : member?.marketingConsent ? "철회" : "동의하고 쿠폰 받기"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Coupons */}
        {member && (
          <>
            {couponsQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Gift className="w-8 h-8 mx-auto mb-3 animate-pulse" />
                <p className="text-sm">쿠폰을 불러오는 중...</p>
              </div>
            ) : (
              <>
                {activeCoupons.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      사용 가능한 쿠폰 ({activeCoupons.length})
                    </h2>
                    <div className="space-y-3">
                      {activeCoupons.map((coupon) => (
                        <CouponCard key={coupon.id} coupon={coupon} onSelect={() => setSelectedCoupon(coupon)} onCopy={() => copyCode(coupon.code)} />
                      ))}
                    </div>
                  </div>
                )}

                {usedCoupons.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      사용 완료 / 만료 ({usedCoupons.length})
                    </h2>
                    <div className="space-y-3 opacity-60">
                      {usedCoupons.map((coupon) => (
                        <CouponCard key={coupon.id} coupon={coupon} onSelect={() => setSelectedCoupon(coupon)} onCopy={() => copyCode(coupon.code)} disabled />
                      ))}
                    </div>
                  </div>
                )}

                {coupons.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <Gift className="w-10 h-10 mx-auto mb-4 opacity-30" />
                    <p className="text-sm">보유한 쿠폰이 없습니다.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Coupon Detail Modal */}
      <Dialog open={!!selectedCoupon} onOpenChange={() => setSelectedCoupon(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center font-bold">{selectedCoupon?.name}</DialogTitle>
          </DialogHeader>
          {selectedCoupon && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="p-4 bg-white rounded-2xl border border-border">
                <QRCodeImage value={selectedCoupon.code} size={180} />
              </div>
              <div className="w-full">
                <p className="text-xs text-muted-foreground text-center mb-2">쿠폰 코드</p>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-4 py-3">
                  <code className="flex-1 text-center text-lg font-mono font-bold text-foreground tracking-widest">
                    {selectedCoupon.code}
                  </code>
                  <button onClick={() => copyCode(selectedCoupon.code)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">종류</span>
                  <span className="font-medium"><CouponTypeLabel type={selectedCoupon.type} /></span>
                </div>
                {selectedCoupon.discountPercent && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">할인율</span>
                    <span className="font-bold text-primary">{selectedCoupon.discountPercent}%</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">상태</span>
                  <CouponStatusBadge status={selectedCoupon.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">유효기간</span>
                  <span className="font-medium">{new Date(selectedCoupon.expiresAt).toLocaleDateString("ko-KR")}까지</span>
                </div>
              </div>
              {selectedCoupon.description && (
                <p className="text-xs text-muted-foreground text-center border-t border-border pt-4 w-full">
                  {selectedCoupon.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center bg-muted/50 rounded-lg px-4 py-2 w-full">
                직원에게 이 화면 또는 쿠폰 코드를 보여주세요
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CouponCard({ coupon, onSelect, onCopy, disabled = false }: {
  coupon: Coupon; onSelect: () => void; onCopy: () => void; disabled?: boolean;
}) {
  return (
    <div
      className={`bg-card rounded-xl border p-5 flex items-center gap-4 transition-all duration-200 ${
        disabled ? "border-border/30 cursor-default" : "border-primary/20 hover:border-primary/40 hover:shadow-md cursor-pointer"
      }`}
      onClick={disabled ? undefined : onSelect}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${disabled ? "bg-muted" : "bg-primary/10"}`}>
        {coupon.status === "used" ? <CheckCircle2 className="w-6 h-6 text-muted-foreground" /> :
         coupon.status === "expired" ? <XCircle className="w-6 h-6 text-muted-foreground" /> :
         <Gift className="w-6 h-6 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-bold text-sm text-foreground truncate">{coupon.name}</p>
          {coupon.discountPercent && <span className="text-primary font-extrabold text-sm shrink-0">{coupon.discountPercent}%</span>}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{coupon.code}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}까지</p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <CouponStatusBadge status={coupon.status} />
        {!disabled && (
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onCopy(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="코드 복사">
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="QR 코드 보기">
              <QrCode className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
