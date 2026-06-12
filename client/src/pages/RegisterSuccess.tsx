import { Link, useSearch } from "wouter";
import { Crown, Gift, Star, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function RegisterSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const memberId = params.get("memberId");

  // 발급된 쿠폰 조회
  const couponsQuery = trpc.membership.getMyCoupons.useQuery(
    { memberId: memberId ? Number(memberId) : 0 },
    { enabled: !!memberId }
  );

  const coupons = couponsQuery.data ?? [];
  const hasMarketing = coupons.some((c) => c.type === "discount_percent");

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Success icon */}
        <div className="relative inline-flex mb-8">
          <div className="w-20 h-20 rounded-full coupon-gold-shimmer flex items-center justify-center">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>

        <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3 font-semibold">Welcome</p>
        <h1 className="text-3xl font-extrabold text-foreground mb-4">
          가입을 환영합니다!
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-2">
          NOPS Steak House 멤버십에 가입해 주셔서 감사합니다.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          가입하신 이메일로 쿠폰 안내 메일이 발송됩니다.
        </p>

        {/* 발급된 쿠폰 목록 - 실제 발급 데이터 기반 */}
        <div className="space-y-3 mb-8 text-left">
          {couponsQuery.isLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">쿠폰 확인 중...</div>
          ) : coupons.length > 0 ? (
            coupons.map((coupon) => (
              <div key={coupon.id} className="bg-card border border-primary/20 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {coupon.type === "birthday" ? (
                    <Star className="w-5 h-5 text-primary" />
                  ) : (
                    <Gift className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{coupon.name}</p>
                  <p className="text-xs text-green-600 font-medium">
                    ✓ 발급 완료
                    {coupon.description?.includes("마케팅") && " · 마케팅 동의 감사 혜택"}
                  </p>
                </div>
              </div>
            ))
          ) : null}

          {/* 마케팅 미동의 시 추가 혜택 안내 */}
          {!hasMarketing && !couponsQuery.isLoading && (
            <div className="bg-muted/50 border border-border/50 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">마케팅 동의 시 추가 혜택</p>
                <p className="text-xs text-muted-foreground">10% 할인 + 생일 15% 쿠폰 — 마이페이지에서 동의 가능</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Link href={`/mypage${memberId ? `?memberId=${memberId}` : ""}`}>
            <Button className="w-full h-12 text-sm tracking-wider gap-2 font-semibold">
              내 쿠폰 확인하기
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" className="w-full text-sm text-muted-foreground">
              홈으로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
