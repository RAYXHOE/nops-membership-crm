import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Users,
  Tag,
  TrendingUp,
  Gift,
  Crown,
  ArrowUpRight,
  Calendar,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Coins,
  ChevronDown,
  ChevronUp,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  href,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  trend?: string;
  href?: string;
}) {
  const inner = (
    <div className={`bg-card rounded-2xl border border-border/50 p-6 transition-all ${
      href ? "hover:shadow-md hover:border-primary/30 cursor-pointer group" : "hover:shadow-md"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex items-center gap-1">
          {trend && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              {trend}
            </span>
          )}
          {href && (
            <span className="text-xs text-primary/50 group-hover:text-primary transition-colors">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export default function AdminDashboard() {
  const analyticsQuery = trpc.admin.getAnalytics.useQuery();
  const membersQuery = trpc.admin.listMembers.useQuery({ limit: 5 });
  const couponsQuery = trpc.admin.listCoupons.useQuery({ limit: 5 });
  const pointsMissingQuery = trpc.admin.getPointsMissingStats.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // 5분마다 자동 갱신
  });
  const fixMissingPoint = trpc.admin.fixMissingPoint.useMutation({
    onSuccess: () => {
      toast.success("적립 보정 완료!");
      pointsMissingQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const [showMissingList, setShowMissingList] = useState(false);

  const stats = analyticsQuery.data;
  const ms = stats?.memberStats;
  const cs = stats?.couponStats;
  const ps = stats?.purchaseStats;

  const chartData = ms?.monthlyJoins.map((m) => ({
    name: m.month.slice(5),
    가입: m.count,
  })) ?? [];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Dashboard</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            운영 현황
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>

        {/* 적립 모니터링 위젯 */}
        {pointsMissingQuery.data && (
          <div className={`rounded-2xl border p-5 mb-6 ${
            pointsMissingQuery.data.missingCount > 0
              ? "bg-red-50 border-red-200"
              : "bg-green-50 border-green-200"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {pointsMissingQuery.data.missingCount > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${
                    pointsMissingQuery.data.missingCount > 0 ? "text-red-700" : "text-green-700"
                  }`}>
                    {pointsMissingQuery.data.missingCount > 0
                      ? `적립 누락 ${pointsMissingQuery.data.missingCount}건 감지`
                      : "적립 누락 없음"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    오늘 구매 {pointsMissingQuery.data.todayPurchases}건 /
                    오늘 적립 {pointsMissingQuery.data.todayEarns}건
                    {pointsMissingQuery.data.missingCount > 0 && (
                      <span className="text-red-600 font-medium ml-1">
                        · 누락 {pointsMissingQuery.data.missingCount}건 (3,400원 이상 구매 기준)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {pointsMissingQuery.data.missingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMissingList((v) => !v)}
                  className="flex items-center gap-1 text-xs text-red-600 font-medium hover:text-red-800"
                >
                  {showMissingList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showMissingList ? "접기" : "목록 보기"}
                </button>
              )}
            </div>

            {showMissingList && pointsMissingQuery.data.missingItems.length > 0 && (
              <div className="mt-4 space-y-2">
                {pointsMissingQuery.data.missingItems.map((item) => (
                  <div key={item.purchaseId} className="bg-white rounded-lg border border-red-100 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Coins className="w-4 h-4 text-red-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {item.memberName ?? "(이름 없음)"}
                          <span className="text-muted-foreground ml-1 font-normal">{item.memberEmail}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.finalAmount.toLocaleString()}원 구매 · 예상 적립 {item.expectedPoints.toLocaleString()}원 ·{" "}
                          {new Date(item.purchasedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={fixMissingPoint.isPending}
                      onClick={() => fixMissingPoint.mutate({ purchaseId: item.purchaseId })}
                      className="flex items-center gap-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50 shrink-0"
                    >
                      <Wrench className="w-3 h-3" />
                      적립 보정
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="전체 회원"
            value={ms?.total ?? "—"}
            sub={`활성 ${ms?.active ?? 0}명`}
            icon={Users}
            href="/admin/members"
          />
          <StatCard
            title="마케팅 동의"
            value={ms ? `${ms.marketingConsented}명` : "—"}
            sub={ms ? `${Math.round((ms.marketingConsented / (ms.total || 1)) * 100)}%` : ""}
            icon={Percent}
            href="/admin/members"
          />
          <StatCard
            title="발급 쿠폰"
            value={cs?.total ?? "—"}
            sub={`사용률 ${cs?.usageRate ?? 0}%`}
            icon={Tag}
            href="/admin/coupons"
          />
          <StatCard
            title="총 매출"
            value={ps ? `₩${Number(ps.totalAmount).toLocaleString()}` : "—"}
            sub={`${ps?.totalCount ?? 0}건`}
            icon={TrendingUp}
            href="/admin/analytics"
          />
        </div>

        {/* Chart + Quick actions */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Monthly joins chart */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-6">월별 신규 가입</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.52 0.09 55)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.52 0.09 55)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="가입"
                    stroke="oklch(0.52 0.09 55)"
                    fill="url(#grad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                데이터가 없습니다
              </div>
            )}
          </div>

          {/* Coupon status */}
          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-6">쿠폰 현황</h2>
            {cs ? (
              <div className="space-y-4">
                {[
                  { label: "사용 가능", value: cs.active, color: "bg-green-500" },
                  { label: "사용 완료", value: cs.used, color: "bg-primary" },
                  { label: "만료", value: cs.expired, color: "bg-muted-foreground" },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-foreground">{item.value}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all`}
                        style={{ width: `${cs.total > 0 ? (item.value / cs.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">사용률</span>
                    <span className="font-bold text-primary">{cs.usageRate}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">로딩 중...</div>
            )}
          </div>
        </div>

        {/* Recent members & coupons */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent members */}
          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-foreground">최근 가입 회원</h2>
              <Link href="/admin/members">
                <span className="text-xs text-primary hover:underline cursor-pointer">전체 보기</span>
              </Link>
            </div>
            <div className="space-y-3">
              {membersQuery.data?.items.slice(0, 5).map((m) => (
                <Link key={m.id} href={`/admin/members/${m.id}`}>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-xs font-semibold">{m.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {new Date(m.joinedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </Link>
              ))}
              {!membersQuery.data?.items.length && (
                <p className="text-sm text-muted-foreground text-center py-4">회원이 없습니다</p>
              )}
            </div>
          </div>

          {/* Recent coupons */}
          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-foreground">최근 발급 쿠폰</h2>
              <Link href="/admin/coupons">
                <span className="text-xs text-primary hover:underline cursor-pointer">전체 보기</span>
              </Link>
            </div>
            <div className="space-y-3">
              {couponsQuery.data?.items.slice(0, 5).map(({ coupon, memberName }) => (
                <div key={coupon.id} className="flex items-center gap-3 p-2 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{coupon.name}</p>
                    <p className="text-xs text-muted-foreground">{memberName ?? "—"}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      coupon.status === "active"
                        ? "bg-green-100 text-green-700"
                        : coupon.status === "used"
                        ? "bg-muted text-muted-foreground"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {coupon.status === "active" ? "사용가능" : coupon.status === "used" ? "사용완료" : "만료"}
                  </span>
                </div>
              ))}
              {!couponsQuery.data?.items.length && (
                <p className="text-sm text-muted-foreground text-center py-4">쿠폰이 없습니다</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
