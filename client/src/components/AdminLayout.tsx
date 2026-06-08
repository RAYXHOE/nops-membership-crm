import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  BarChart3,
  ChevronRight,
  Crown,
  LogOut,
  Tag,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect } from "react";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "대시보드" },
  { href: "/admin/members", icon: Users, label: "회원 관리" },
  { href: "/admin/coupons", icon: Tag, label: "쿠폰 관리" },
  { href: "/admin/analytics", icon: BarChart3, label: "데이터 분석" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      navigate("/");
    },
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    if (!loading && isAuthenticated && user?.role !== "admin") {
      toast.error("관리자 권한이 필요합니다.");
      navigate("/");
    }
  }, [loading, isAuthenticated, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Crown className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") return null;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-8 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full coupon-gold-shimmer flex items-center justify-center">
              <Crown className="w-4 h-4 text-sidebar" />
            </div>
            <div>
              <p className="text-sidebar-foreground font-bold tracking-wider text-sm uppercase">NOPS</p>
              <p className="text-sidebar-foreground/50 text-xs">Steak House CRM</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sidebar-primary text-xs font-semibold">
                {user?.name?.charAt(0) ?? "A"}
              </span>
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
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
