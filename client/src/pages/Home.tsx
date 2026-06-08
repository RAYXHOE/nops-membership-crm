import { Link } from "wouter";
import { Crown, Gift, Star, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Gift,
    title: "가입 즉시 혜택",
    desc: "10% 할인 쿠폰 + 콜키지 프리 쿠폰 즉시 발급",
  },
  {
    icon: Star,
    title: "생일 특별 혜택",
    desc: "매년 생일에 15% 할인 쿠폰 자동 증정",
  },
  {
    icon: Sparkles,
    title: "프리미엄 경험",
    desc: "멤버 전용 혜택과 신메뉴 우선 안내",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <span className="font-semibold tracking-widest text-sm uppercase text-foreground">NOBS</span>
          </div>
          <div className="flex items-center gap-3">
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
            <p className="text-primary text-xs tracking-[0.3em] uppercase mb-6 font-medium">
              Exclusive Membership
            </p>
            <h1
              className="text-5xl lg:text-6xl font-bold text-foreground leading-[1.1] mb-6"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              놉스에서 누리는<br />
              <em className="not-italic text-primary">특별한 혜택</em>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-10 font-light" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
              멤버십 가입 즉시 할인 쿠폰과 콜키지 프리 혜택을 받으세요.<br />
              매년 생일에는 특별한 15% 할인 쿠폰이 자동으로 발급됩니다.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/register">
                <Button size="lg" className="px-8 py-6 text-sm tracking-wider gap-2">
                  지금 가입하기
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/mypage">
                <Button variant="outline" size="lg" className="px-8 py-6 text-sm tracking-wider bg-card">
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
            <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3">Member Benefits</p>
            <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              멤버십 혜택 안내
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <div
                key={i}
                className="bg-card rounded-2xl p-8 border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                  <b.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">{b.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
                  {b.desc}
                </p>
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
              <h2
                className="text-3xl lg:text-4xl font-bold text-background mb-4"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                지금 바로 시작하세요
              </h2>
              <p className="text-background/60 mb-8 text-sm" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
                가입 즉시 2가지 쿠폰이 자동으로 발급됩니다
              </p>
              <Link href="/register">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-background text-foreground hover:bg-background/90 px-10 py-6 text-sm tracking-wider border-0"
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
            <span className="text-sm text-muted-foreground tracking-wider">NOBS Membership</span>
          </div>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            © 2025 NOBS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
