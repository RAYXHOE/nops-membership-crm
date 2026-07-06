import { Link } from "wouter";
import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Design Tokens (Burgundy #800020) ────────────────────────────────────────
const NOPS_LOGO = "/manus-storage/nops-logo_4916b11f.png";
const BADGE_USDA = "/manus-storage/badge-usda_7ec1c5bf.png";
const BADGE_SINCE = "/manus-storage/badge-since1983_9eb58e50.png";

const benefits = [
  {
    // Line icon: gift outline
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    ),
    tag: "",
    title: "기본 가입 혜택",
    desc: "가입 즉시 콜키지 프리 쿠폰 설급",
  },
  {
    // Line icon: star outline
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    tag: "동의 시",
    title: "마케팅 동의 추가 혜택",
    desc: "10% 할인 쿠폰 + 생일 15% 할인 쿠폰 즉시 발급",
  },
  {
    // Line icon: sparkle / diamond outline
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
    ),
    tag: "동의 시",
    title: "프리미엄 경험",
    desc: "신메뉴 우선 안내 및 이벤트 정보 제공",
  },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && user?.role === "admin";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F9F8F6" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: "#F9F8F6", borderColor: "#E5DFDB" }}
      >
        <div className="container flex items-center justify-between h-16">
          {/* NOPS Logo Image */}
          <Link href="/">
            <img
              src={NOPS_LOGO}
              alt="NOPS Steak House"
              className="h-10 w-auto object-contain cursor-pointer"
            />
          </Link>

          <nav className="flex items-center gap-1">
            {isAdmin && (
              <Link href="/admin">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs tracking-widest font-medium"
                  style={{ color: "#800020" }}
                >
                  <Settings className="w-3.5 h-3.5" />
                  관리자
                </Button>
              </Link>
            )}
            <Link href="/mypage">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs tracking-widest font-normal"
                style={{ color: "#6B6365" }}
              >
                마이페이지
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="text-xs tracking-widest font-semibold px-5 rounded-none"
                style={{ backgroundColor: "#800020", color: "#fff", borderRadius: "0px" }}
              >
                멤버십 가입
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="container">
          {/* Brand caption */}
          <p
            className="text-center text-xs font-light mb-8"
            style={{ color: "#6B6365", letterSpacing: "0.25em" }}
          >
            NOPS STEAK HOUSE — EXCLUSIVE MEMBERSHIP
          </p>

          {/* 3-column: badge | title | badge */}
          <div className="flex items-center justify-center gap-8 md:gap-16">
            {/* USDA CHOICE badge */}
            <img
              src={BADGE_USDA}
              alt="USDA Choice"
              className="hidden sm:block w-20 md:w-24 object-contain opacity-90"
            />

            {/* Main title block */}
            <div className="text-center">
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-5"
                style={{ color: "#800020" }}
              >
                놉스에서 누리는<br />특별한 혜택
              </h1>
              <p
                className="text-sm md:text-base font-light leading-relaxed mb-8"
                style={{ color: "#6B6365" }}
              >
                가입 즉시 콜키지 프리 쿠폰이 발급됩니다.<br />
                마케팅 동의 시 10% 할인 쿠폰 + 생일 15% 쿠폰도 함께 증정됩니다.
              </p>

              {/* CTA Buttons */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link href="/register">
                  <Button
                    size="lg"
                    className="px-8 font-semibold tracking-wide text-sm rounded-none"
                    style={{ backgroundColor: "#800020", color: "#fff", borderRadius: "0px" }}
                  >
                    지금 가입하기 ›
                  </Button>
                </Link>
                <Link href="/mypage">
                  <Button
                    variant="outline"
                    size="lg"
                    className="px-8 font-light tracking-wide text-sm rounded-none"
                    style={{
                      borderColor: "#800020",
                      color: "#800020",
                      borderRadius: "0px",
                      backgroundColor: "transparent",
                    }}
                  >
                    내 쿠폰 확인
                  </Button>
                </Link>
              </div>
            </div>

            {/* SINCE 1983 badge */}
            <img
              src={BADGE_SINCE}
              alt="Since 1983"
              className="hidden sm:block w-20 md:w-24 object-contain opacity-90"
            />
          </div>

          {/* Mobile: badges below title */}
          <div className="flex sm:hidden items-center justify-center gap-8 mt-10">
            <img src={BADGE_USDA} alt="USDA Choice" className="w-16 object-contain opacity-90" />
            <img src={BADGE_SINCE} alt="Since 1983" className="w-16 object-contain opacity-90" />
          </div>
        </div>
      </section>

      {/* ── Benefits Section ───────────────────────────────────────────────── */}
      <section className="py-16 md:py-20">
        <div className="container">
          {/* Section header */}
          <div className="text-center mb-14">
            <p
              className="text-xs font-light mb-3"
              style={{ color: "#6B6365", letterSpacing: "0.2em" }}
            >
              MEMBER BENEFITS
            </p>
            <h2
              className="text-2xl md:text-3xl font-black"
              style={{ color: "#800020" }}
            >
              멤버십 혜택 안내
            </h2>
          </div>

          {/* Benefit cards — minimal top-border only */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-8">
            {benefits.map((b, i) => (
              <div
                key={i}
                className="pt-6 pb-8 px-2 md:px-4"
                style={{ borderTop: "1px solid #800020" }}
              >
                {/* Tag */}
                {b.tag && (
                  <p
                    className="text-xs font-light mb-4 text-right"
                    style={{ color: "#6B6365", letterSpacing: "0.1em" }}
                  >
                    {b.tag}
                  </p>
                )}
                {!b.tag && <div className="mb-8" />}

                {/* Icon */}
                <div className="mb-4" style={{ color: "#800020" }}>
                  {b.icon}
                </div>

                {/* Title */}
                <h3
                  className="text-base font-bold mb-2"
                  style={{ color: "#1a1a1a" }}
                >
                  {b.title}
                </h3>

                {/* Desc */}
                <p
                  className="text-sm font-light leading-relaxed"
                  style={{ color: "#6B6365" }}
                >
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        className="py-10 border-t"
        style={{ borderColor: "#E5DFDB" }}
      >
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={NOPS_LOGO} alt="NOPS" className="h-8 w-auto object-contain opacity-70" />
          <p
            className="text-xs font-light text-center"
            style={{ color: "#6B6365", letterSpacing: "0.1em" }}
          >
            © 2024 NOPS Steak House. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/register">
              <span
                className="text-xs font-light cursor-pointer hover:underline"
                style={{ color: "#6B6365", letterSpacing: "0.1em" }}
              >
                멤버십 가입
              </span>
            </Link>
            <Link href="/mypage">
              <span
                className="text-xs font-light cursor-pointer hover:underline"
                style={{ color: "#6B6365", letterSpacing: "0.1em" }}
              >
                마이페이지
              </span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
