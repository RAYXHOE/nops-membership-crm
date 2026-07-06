import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  BarChart3, ChevronRight, Crown, LogOut, Tag,
  Users, LayoutDashboard, UserCog, ShieldOff, Menu, X, AlertTriangle, MapPin, MessageSquare, MessageCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

// 앱 내 WebView 여부 감지
function isWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /KAKAOTALK|Instagram|NAVER|Line|FB_IAB|FB4A|FBAN|Twitter|Snapchat|WeChat|MicroMessenger|LinkedInApp|Bytedance|TikTok/i.test(ua)
    || /wv|WebView/.test(ua)
    || (!!ua.match(/Android/) && !ua.match(/Chrome\/[.0-9]* Mobile/));
}

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "대시보드", roles: ["admin", "staff", "branch_admin"] },
  { href: "/admin/members", icon: Users, label: "회원 관리", roles: ["admin", "staff", "branch_admin"] },
  { href: "/admin/coupons", icon: Tag, label: "쿠폰 관리", roles: ["admin", "staff", "branch_admin"] },
  { href: "/admin/analytics", icon: BarChart3, label: "데이터 분석", roles: ["admin", "staff"] },
  { href: "/admin/alimtalk", icon: MessageSquare, label: "알림톡 내역", roles: ["admin", "staff"] },
  { href: "/admin/inquiries", icon: MessageCircle, label: "고객 문의", roles: ["admin", "staff"] },
  { href: "/admin/branches", icon: MapPin, label: "지점 관리", roles: ["admin"] },
  { href: "/admin/users", icon: UserCog, label: "권한 관리", roles: ["admin"] },
];

const ALLOWED_ROLES = ["admin", "staff", "branch_admin"];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/"),
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  // 페이지 이동 시 사이드바 닫기
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        {isWebView() && (
          <div className="fixed top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 px-4 py-3 z-50">
            <div className="flex items-start gap-2 max-w-sm mx-auto">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">외부 브라우저로 열어주세요</p>
                <p className="text-xs text-amber-700 mt-0.5">카카오톡 등 앱에서 열린 경우 구글 로그인이 차단됩니다.<br />우측 하단 ⋯ → <strong>기본 브라우저에서 열기</strong>를 선택해 주세요.</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center gap-4">
          <Crown className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!ALLOWED_ROLES.includes(user?.role ?? "")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">접근 권한이 없습니다</h2>
          <p className="text-sm text-muted-foreground mb-4">
            관리자에게 권한 부여를 요청하세요.<br />
            권한 부여 후 다시 로그인해주세요.
          </p>
          <div className="bg-muted rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-muted-foreground font-mono">{user?.email}</p>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  const visibleNavItems = navItems.filter(item => item.roles.includes(user?.role ?? ""));

  const SidebarContent = () => (
    <>
      <div className="px-6 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img
            src="/manus-storage/nops-logo_4916b11f.png"
            alt="NOPS"
            className="h-9 w-auto object-contain brightness-0 invert"
          />
          <p className="text-sidebar-foreground/50 text-xs tracking-widest">CRM</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {visibleNavItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}>
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sidebar-primary text-xs font-semibold">{user?.name?.charAt(0) ?? "A"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-sm font-medium truncate">{user?.name ?? "관리자"}</p>
            <p className="text-sidebar-foreground/40 text-xs truncate">{user?.email ?? ""}</p>
          </div>
        </div>
        <button
          onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200 text-sm"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* 데스크탑 사이드바 (lg 이상) */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 모바일 사이드바 드로어 */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-sidebar text-sidebar-foreground flex flex-col z-50 transform transition-transform duration-300 lg:hidden ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <SidebarContent />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단 헤더 */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/manus-storage/nops-logo_4916b11f.png" alt="NOPS" className="h-7 w-auto object-contain brightness-0 invert" />
            <span className="text-sidebar-foreground/50 text-xs">CRM</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
