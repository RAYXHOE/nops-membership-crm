import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Crown, Gift, Star, ChevronRight, Sparkles, Settings, X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

const benefits = [
  {
    icon: Gift,
    title: "기본 가입 혜택",
    desc: "가입 즉시 콜키지 프리 쿠폰 발급",
    tag: "",
  },
  {
    icon: Star,
    title: "마케팅 동의 추가 혜택",
    desc: "10% 할인 쿠폰 + 생일 15% 할인 쿠폰 즉시 발급",
    tag: "동의 시",
  },
  {
    icon: Sparkles,
    title: "프리미엄 경험",
    desc: "신메뉴 우선 안내 및 이벤트 정보 제공",
    tag: "동의 시",
  },
];

const NOTICE_KEY = "nops_notice_dismissed_v1";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && user?.role === "admin";
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(NOTICE_KEY);
    if (!dismissed) setShowNotice(true);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(NOTICE_KEY, "1");
    setShowNotice(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 테스트 안내 팝업 */}
      {showNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-sm w-full p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-amber-600 font-semibold tracking-wider uppercase">Notice</p>
                <p className="text-sm font-bold text-foreground">NOPS 멤버십 안내</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <p className="text-sm text-foreground leading-relaxed">
                현재 <strong>NOPS 멤버십 프로그램을 내부 테스트 중</strong>입니다.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                가입 및 쿠폰 발급은 정상적으로 진행되지만, 쿠폰 사용을 통한 할인 적용은 <strong>2026년 7월 정식 오픈 이후</strong>부터 가능합니다.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-700 font-medium">미리 가입하시면 정식 오픈 시 쿠폰이 자동 적용됩니다. 가입 후 마이페이지에서 쿠폰을 확인하실 수 있습니다.</p>
              </div>
            </div>
            <Button onClick={handleDismiss} className="w-full h-10 text-sm">
              확인했습니다
            </Button>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <div>
              <span className="font-bold tracking-widest text-sm uppercase text-foreground">NOPS</span>
              <span className="text-muted-foreground text-xs ml-1.5 hidden sm:inline">Steak House</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs tracking-wide gap-1.5 font-semibold">
                  <Settings className="w-3.5 h-3.5" />
                  관리자
                </Button>
              </Link>
            )}
            <Link href="/mypage">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs tracking-wide">
                마이페이지
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="text-xs tracking-wide px-5">
                멤버십 가입
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/30 pointer-events-none" />
        <div className="container relative py-28 lg:py-40">
          <div className="max-w-2xl">
            <p className="text-primary text-xs tracking-[0.3em] uppercase mb-6 font-semibold">
              NOPS Steak House — Exclusive Membership
            </p>
            <h1 className="text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.15] mb-6">
              놉스에서 누리는<br />
              <span className="text-primary">특별한 혜택</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-10 font-light">
              가입 즉시 <strong className="text-foreground">콜키지 프리 쿠폰</strong>이 발급됩니다.<br />
              마케팅 동의 시 <strong className="text-foreground">10% 할인 쿠폰 + 생일 15% 쿠폰</strong>도 함께 증정됩니다.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/register">
                <Button size="lg" className="px-8 py-6 text-sm tracking-wider gap-2 font-semibold">
                  지금 가입하기
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/mypage">
                <Button variant="outline" size="lg" className="px-8 py-6 text-sm tracking-wider bg-card font-medium">
                  내 쿠폰 확인
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-card/50">
        <div className="container">
          <div className="text-center mb-16">
            <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3 font-semibold">Member Benefits</p>
            <h2 className="text-3xl font-bold text-foreground">
              멤버십 혜택 안내
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <div
                key={i}
                className="bg-card rounded-2xl p-8 border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group relative"
              >
                {b.tag && (
                  <span className="absolute top-4 right-4 text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full border border-primary/20">
                    {b.tag}
                  </span>
                )}
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                  <b.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">{b.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container">
          <div className="bg-foreground rounded-3xl p-12 lg:p-16 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />
            <div className="relative">
              <Crown className="w-10 h-10 text-primary mx-auto mb-6" />
              <h2 className="text-3xl lg:text-4xl font-extrabold text-background mb-4">
                지금 바로 시작하세요
              </h2>
              <p className="text-background/60 mb-8 text-sm">
                가입 즉시 2가지 쿠폰이 자동으로 발급됩니다
              </p>
              <Link href="/register">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-background text-foreground hover:bg-background/90 px-10 py-6 text-sm tracking-wider border-0 font-semibold"
                >
                  무료 멤버십 가입
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground font-medium">NOPS Steak House Membership</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2025 NOPS Steak House. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
