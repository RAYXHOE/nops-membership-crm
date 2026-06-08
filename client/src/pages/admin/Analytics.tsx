import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { BarChart3, Users, Tag, TrendingUp, Percent } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

const COLORS = [
  "oklch(0.52 0.09 55)",
  "oklch(0.62 0.07 200)",
  "oklch(0.72 0.06 140)",
  "oklch(0.65 0.1 30)",
];

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
    </div>
  );
}

export default function AdminAnalytics() {
  const query = trpc.admin.getAnalytics.useQuery();
  const { memberStats: ms, couponStats: cs, purchaseStats: ps } = query.data ?? {};

  const couponTypeData = cs?.byType.map((t) => ({
    name: t.type === "discount_percent" ? "할인" : t.type === "corkage_free" ? "콜키지" : "생일",
    전체: t.total,
    사용: t.used,
  })) ?? [];

  const couponStatusData = cs
    ? [
        { name: "사용 가능", value: cs.active },
        { name: "사용 완료", value: cs.used },
        { name: "만료", value: cs.expired },
      ]
    : [];

  const monthlyJoinData = ms?.monthlyJoins.map((m) => ({
    name: m.month.slice(5),
    가입: m.count,
  })) ?? [];

  const monthlyRevenueData = ps?.monthly.map((m) => ({
    name: m.month.slice(5),
    매출: m.amount,
    건수: m.count,
  })) ?? [];

  if (query.isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-muted-foreground">데이터 로딩 중...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Analytics</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            데이터 분석
          </h1>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { label: "전체 회원", value: ms?.total ?? 0, icon: Users, unit: "명" },
            { label: "마케팅 동의율", value: ms ? `${Math.round((ms.marketingConsented / (ms.total || 1)) * 100)}` : 0, icon: Percent, unit: "%" },
            { label: "쿠폰 사용률", value: cs?.usageRate ?? 0, icon: Tag, unit: "%" },
            { label: "총 매출", value: ps ? `₩${Math.round(ps.totalAmount / 10000)}만` : "—", icon: TrendingUp, unit: "" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <kpi.icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {kpi.value}{kpi.unit}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Member section */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <SectionTitle icon={Users} title="회원 현황" />
          <div className="grid md:grid-cols-2 gap-8">
            {/* Monthly joins */}
            <div>
              <p className="text-xs text-muted-foreground mb-4">월별 신규 가입</p>
              {monthlyJoinData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyJoinData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="가입" fill="oklch(0.52 0.09 55)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </div>

            {/* Segment */}
            <div>
              <p className="text-xs text-muted-foreground mb-4">회원 세그먼트</p>
              <div className="space-y-3">
                {ms && [
                  { label: "활성 회원", value: ms.active, total: ms.total, color: "bg-green-500" },
                  { label: "마케팅 동의", value: ms.marketingConsented, total: ms.total, color: "bg-primary" },
                  { label: "비활성/탈퇴", value: ms.total - ms.active, total: ms.total, color: "bg-muted-foreground" },
                ].map((seg) => (
                  <div key={seg.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{seg.label}</span>
                      <span className="font-semibold text-foreground">
                        {seg.value}명 ({ms.total > 0 ? Math.round((seg.value / ms.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${seg.color} rounded-full`}
                        style={{ width: `${ms.total > 0 ? (seg.value / ms.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coupon section */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <SectionTitle icon={Tag} title="쿠폰 분석" />
          <div className="grid md:grid-cols-2 gap-8">
            {/* By type */}
            <div>
              <p className="text-xs text-muted-foreground mb-4">종류별 발급/사용</p>
              {couponTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={couponTypeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="전체" fill="oklch(0.52 0.09 55)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="사용" fill="oklch(0.72 0.12 60)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </div>

            {/* Status pie */}
            <div>
              <p className="text-xs text-muted-foreground mb-4">상태별 분포</p>
              {couponStatusData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={couponStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                      labelLine={false}
                    >
                      {couponStatusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </div>
          </div>
        </div>

        {/* Revenue section */}
        <div className="bg-card rounded-2xl border border-border/50 p-6">
          <SectionTitle icon={TrendingUp} title="매출 분석" />
          {monthlyRevenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip formatter={(v: number) => [`₩${v.toLocaleString()}`, "매출"]} />
                <Line
                  type="monotone"
                  dataKey="매출"
                  stroke="oklch(0.52 0.09 55)"
                  strokeWidth={2}
                  dot={{ fill: "oklch(0.52 0.09 55)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
              구매 이력이 없습니다
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
