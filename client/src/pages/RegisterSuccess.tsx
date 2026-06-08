import { Link, useSearch } from "wouter";
import { Crown, Gift, Star, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RegisterSuccess() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const memberId = params.get("memberId");

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

        <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3">Welcome</p>
        <h1
          className="text-3xl font-bold text-foreground mb-4"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          가입을 환영합니다!
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-10" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
          NOBS 멤버십에 가입해 주셔서 감사합니다.<br />
          아래 혜택 쿠폰이 즉시 발급되었습니다.
        </p>

        {/* Issued coupons */}
        <div className="space-y-3 mb-10">
          <div className="bg-card border border-primary/20 rounded-xl p-4 flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">가입 기념 10% 할인 쿠폰</p>
              <p className="text-xs text-muted-foreground">발급 완료 · 마이페이지에서 확인</p>
            </div>
          </div>
          <div className="bg-card border border-primary/20 rounded-xl p-4 flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">콜키지 프리 쿠폰</p>
              <p className="text-xs text-muted-foreground">발급 완료 · 마이페이지에서 확인</p>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">생일 15% 할인 쿠폰</p>
              <p className="text-xs text-muted-foreground">매년 생일에 자동 발급 예정</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link href={`/mypage${memberId ? `?memberId=${memberId}` : ""}`}>
            <Button className="w-full h-12 text-sm tracking-wider gap-2">
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
