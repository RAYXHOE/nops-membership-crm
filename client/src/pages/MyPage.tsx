import { useState, useEffect } from "react";
import { useSearch, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Crown, ArrowLeft, Search, Gift, CheckCircle2, Clock, XCircle, QrCode, Copy, UserPlus } from "lucide-react";
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
          <div className="bg-card rounded-2xl border border-primary/20 p-6 mb-8 flex items-center justify-between">
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
        )}

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
