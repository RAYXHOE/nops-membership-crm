import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Search, CheckCircle2, Users, CreditCard, Tag, Crown,
  ChevronRight, RotateCcw, Coins, Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Step = "search" | "member" | "payment" | "done";

export default function AdminCheckin() {
  const { user, loading, isAuthenticated } = useAuth();
  const isAllowed = isAuthenticated && user?.role && ["admin", "staff", "branch_admin"].includes(user.role);

  const [step, setStep] = useState<Step>("search");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<{ id: number; name: string; email: string; phone: string; pointBalance?: number } | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [amount, setAmount] = useState("");
  const [finalAmount, setFinalAmount] = useState("");
  const [paymentOnly, setPaymentOnly] = useState(false); // 결제 없이 방문만 기록
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchQuery_ = trpc.admin.listMembers.useQuery(
    { search: searchQuery, limit: 5 },
    { enabled: searchQuery.length >= 2 }
  );

  const couponsQuery = trpc.admin.listCoupons.useQuery(
    { memberId: selectedMember?.id, status: "active", limit: 20 },
    { enabled: !!selectedMember }
  );

  const checkinMutation = trpc.admin.checkin.useMutation({
    onSuccess: () => {
      toast.success(`${selectedMember?.name}님 체크인 완료!`, {
        description: amount ? `결제 ${Number(finalAmount || amount).toLocaleString()}원 · 적립금 ${Math.floor(Number(finalAmount || amount) * 0.03 / 100) * 100}원 적립` : "방문 기록 완료",
      });
      setStep("done");
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => {
    setStep("search");
    setSearchInput("");
    setSearchQuery("");
    setSelectedMember(null);
    setSelectedCouponId(null);
    setPartySize(2);
    setAmount("");
    setFinalAmount("");
    setPaymentOnly(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleSearch = () => {
    if (searchInput.trim().length < 2) return;
    setSearchQuery(searchInput.trim());
  };

  const handleSelectMember = (m: typeof selectedMember) => {
    setSelectedMember(m);
    setStep("member");
  };

  const handleCheckin = () => {
    if (!selectedMember) return;
    const hasPayment = !paymentOnly && amount;
    checkinMutation.mutate({
      memberId: selectedMember.id,
      partySize,
      couponId: selectedCouponId ?? undefined,
      amount: hasPayment ? Number(amount) : undefined,
      discountAmount: hasPayment && selectedCouponId ? undefined : 0,
      finalAmount: hasPayment ? Number(finalAmount || amount) : undefined,
    });
  };

  const activeCoupons = couponsQuery.data?.items ?? [];
  const earnPreview = Math.floor(Number(finalAmount || amount || 0) * 0.03 / 100) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">로딩 중...</div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8">
        <Crown className="w-10 h-10 text-primary" />
        <p className="text-foreground font-semibold">관리자 로그인이 필요합니다</p>
        <Button onClick={() => window.location.href = getLoginUrl()}>로그인</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="bg-card border-b border-border/50 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm tracking-wider">NOPS 체크인</span>
        </div>
        {step !== "search" && (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs">
            <RotateCcw className="w-3.5 h-3.5" />새 고객
          </Button>
        )}
      </div>

      <div className="max-w-lg mx-auto p-4">

        {/* ─── STEP 1: 검색 ─── */}
        {step === "search" && (
          <div className="mt-6">
            <h1 className="text-xl font-bold text-foreground mb-1">고객 검색</h1>
            <p className="text-sm text-muted-foreground mb-6">이름 또는 전화번호 뒤 4자리를 입력하세요</p>
            <div className="flex gap-2">
              <Input
                ref={searchInputRef}
                autoFocus
                placeholder="홍길동 또는 5678"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-14 text-lg"
              />
              <Button className="h-14 px-6" onClick={handleSearch}>
                <Search className="w-5 h-5" />
              </Button>
            </div>

            {searchQuery_.isLoading && (
              <p className="text-sm text-muted-foreground text-center mt-6">검색 중...</p>
            )}

            {searchQuery_.data && (
              <div className="mt-4 space-y-2">
                {searchQuery_.data.items.length === 0 ? (
                  <div className="bg-card rounded-2xl border border-border/50 p-6 text-center">
                    <p className="text-muted-foreground text-sm">검색 결과가 없습니다</p>
                    <p className="text-xs text-muted-foreground mt-1">이름 또는 전화번호 뒤 4자리로 검색해 주세요</p>
                  </div>
                ) : (
                  searchQuery_.data.items.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleSelectMember({ id: m.id, name: m.name!, email: m.email, phone: m.phone, pointBalance: (m as typeof m & { pointBalance?: number }).pointBalance })}
                      className="w-full bg-card rounded-2xl border border-border/50 p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{m.name}</p>
                          <p className="text-sm text-muted-foreground">{m.phone}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.status === "withdrawn" && <Badge variant="secondary" className="text-xs">탈퇴</Badge>}
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: 회원 확인 ─── */}
        {step === "member" && selectedMember && (
          <div className="mt-6">
            <h1 className="text-xl font-bold text-foreground mb-1">회원 확인</h1>
            <p className="text-sm text-muted-foreground mb-4">쿠폰 사용 여부를 선택하고 다음으로 이동하세요</p>

            {/* 회원 카드 */}
            <div className="bg-card rounded-2xl border border-primary/30 p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-lg font-bold text-foreground">{selectedMember.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedMember.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">적립금</p>
                  <p className="text-lg font-bold text-primary">{(selectedMember.pointBalance ?? 0).toLocaleString()}원</p>
                </div>
              </div>

              {/* 인원 수 */}
              <div className="flex items-center justify-between py-3 border-t border-border/30">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">방문 인원</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPartySize((p) => Math.max(1, p - 1))} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold hover:bg-muted/80">−</button>
                  <span className="text-lg font-bold w-6 text-center">{partySize}</span>
                  <button onClick={() => setPartySize((p) => p + 1)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg font-bold hover:bg-muted/80">+</button>
                </div>
              </div>
            </div>

            {/* 쿠폰 선택 */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">쿠폰 사용 (선택)</p>
              </div>
              {couponsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">쿠폰 조회 중...</p>
              ) : activeCoupons.length === 0 ? (
                <div className="bg-muted/30 rounded-xl p-4 text-center">
                  <Gift className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">사용 가능한 쿠폰 없음</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 쿠폰 없음 선택지 */}
                  <button
                    onClick={() => setSelectedCouponId(null)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${!selectedCouponId ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/30"}`}
                  >
                    <p className="text-sm font-medium text-foreground">쿠폰 사용 안 함</p>
                  </button>
                  {activeCoupons.map(({ coupon }) => (
                    <button
                      key={coupon.id}
                      onClick={() => setSelectedCouponId(coupon.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${selectedCouponId === coupon.id ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/30"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{coupon.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{coupon.code}</p>
                        </div>
                        {coupon.discountPercent && (
                          <span className="text-lg font-bold text-primary">{coupon.discountPercent}%</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full h-14 text-base" onClick={() => setStep("payment")}>
              결제 정보 입력 <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full mt-2 text-sm text-muted-foreground"
              onClick={() => { setPaymentOnly(true); handleCheckin(); }}>
              방문만 기록 (결제 없음)
            </Button>
          </div>
        )}

        {/* ─── STEP 3: 결제 정보 ─── */}
        {step === "payment" && selectedMember && (
          <div className="mt-6">
            <h1 className="text-xl font-bold text-foreground mb-1">결제 정보 입력</h1>
            <p className="text-sm text-muted-foreground mb-6">{selectedMember.name}님 · {selectedCouponId ? "쿠폰 사용" : "쿠폰 없음"}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">결제 금액 (원)</label>
                <Input
                  type="number"
                  placeholder="예: 120000"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (!selectedCouponId) setFinalAmount(e.target.value);
                  }}
                  className="h-14 text-xl font-mono"
                  autoFocus
                />
              </div>

              {selectedCouponId && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">최종 결제 금액 (할인 적용 후)</label>
                  <Input
                    type="number"
                    placeholder="할인 후 금액"
                    value={finalAmount}
                    onChange={(e) => setFinalAmount(e.target.value)}
                    className="h-14 text-xl font-mono"
                  />
                </div>
              )}

              {amount && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">적립 예정</span>
                    <span className="text-lg font-bold text-primary ml-auto">{earnPreview.toLocaleString()}원</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full h-14 text-base"
              onClick={handleCheckin}
              disabled={!amount || checkinMutation.isPending}
            >
              {checkinMutation.isPending ? "처리 중..." : "체크인 완료"}
              <CheckCircle2 className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* ─── STEP 4: 완료 ─── */}
        {step === "done" && selectedMember && (
          <div className="mt-12 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">체크인 완료!</h1>
            <p className="text-muted-foreground mb-2">{selectedMember.name}님</p>
            {amount && (
              <div className="bg-card rounded-2xl border border-border/50 p-5 mt-6 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">결제 금액</span>
                  <span className="font-medium">{Number(amount).toLocaleString()}원</span>
                </div>
                {selectedCouponId && finalAmount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">최종 결제</span>
                    <span className="font-bold text-primary">{Number(finalAmount).toLocaleString()}원</span>
                  </div>
                )}
                {earnPreview > 0 && (
                  <div className="flex justify-between text-sm border-t border-border/30 pt-3">
                    <span className="text-muted-foreground flex items-center gap-1"><Coins className="w-3.5 h-3.5" />적립금</span>
                    <span className="font-bold text-primary">+{earnPreview.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}
            <Button className="w-full h-14 text-base mt-8" onClick={reset}>
              <RotateCcw className="w-5 h-5 mr-2" />다음 고객
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
