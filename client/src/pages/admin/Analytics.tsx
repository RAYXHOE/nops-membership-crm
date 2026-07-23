import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { BarChart3, Users, Tag, TrendingUp, Percent, Download, Calendar, MapPin } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPreset(preset: string): { start: string; end: string } {
  const now = new Date();
  const end = toDateStr(now);
  if (preset === "7d") { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: toDateStr(s), end }; }
  if (preset === "30d") { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: toDateStr(s), end }; }
  if (preset === "3m") { const s = new Date(now); s.setMonth(s.getMonth() - 3); return { start: toDateStr(s), end }; }
  if (preset === "6m") { const s = new Date(now); s.setMonth(s.getMonth() - 6); return { start: toDateStr(s), end }; }
  if (preset === "1y") { const s = new Date(now); s.setFullYear(s.getFullYear() - 1); return { start: toDateStr(s), end }; }
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateStr(s), end };
}

function downloadExcel(data: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export default function AdminAnalytics() {
  const [preset, setPreset] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [branchCode, setBranchCode] = useState<string>("all");

  const { start, end } = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) return { start: customStart, end: customEnd };
    return getPreset(preset);
  }, [preset, customStart, customEnd]);

  const isValidRange = !!start && !!end && start <= end;
  const selectedBranch = branchCode === "all" ? undefined : branchCode;

  // ─── 쿼리 ───────────────────────────────────────────────────────────────────────────────
  const query = trpc.admin.getAnalytics.useQuery();
  const { memberStats: ms, couponStats: cs, purchaseStats: ps } = query.data ?? {};

  const branchCodesQuery = trpc.admin.listBranchCodes.useQuery();
  const branchCodes = (branchCodesQuery.data ?? []) as { code: string; name: string }[];

  const branchMemberStatsQuery = trpc.admin.getBranchMemberStats.useQuery();

  const membersPeriodQuery = trpc.admin.getMembersByPeriod.useQuery(
    { startDate: start, endDate: end, groupBy },
    { enabled: isValidRange }
  );

  const couponUsagePeriodQuery = trpc.admin.getCouponUsageByPeriod.useQuery(
    { startDate: start, endDate: end, groupBy, branchCode: selectedBranch },
    { enabled: isValidRange }
  );

  const exportMembersQuery = trpc.admin.exportMembers.useQuery(
    { startDate: start || undefined, endDate: end || undefined },
    { enabled: false }
  );

  const exportCouponQuery = trpc.admin.exportCouponUsage.useQuery(
    { startDate: start || undefined, endDate: end || undefined, branchCode: selectedBranch },
    { enabled: false }
  );

  // ─── 차트 데이터 ──────────────────────────────────────────────────────────
  const couponTypeData = cs?.byType.map((t) => ({
    name: t.type === "discount_percent" ? "할인" : t.type === "corkage_free" ? "콜키지" : "생일",
    전체: t.total, 사용: t.used,
  })) ?? [];

  const couponStatusData = cs ? [
    { name: "사용 가능", value: cs.active },
    { name: "사용 완료", value: cs.used },
    { name: "만료", value: cs.expired },
  ] : [];

  const monthlyJoinData = ms?.monthlyJoins.map((m) => ({ name: m.month.slice(5), 가입: m.count })) ?? [];
  const monthlyRevenueData = ps?.monthly.map((m) => ({ name: m.month.slice(5), 매출: m.amount, 건수: m.count })) ?? [];

  const memberChartData = useMemo(() =>
    (membersPeriodQuery.data ?? []).map((r) => ({ period: r.period, 가입자: Number(r.count) })),
    [membersPeriodQuery.data]
  );

  const couponChartData = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const r of couponUsagePeriodQuery.data ?? []) {
      const row = map.get(r.period) ?? { period: r.period };
      const label = r.type === "discount_percent" ? "할인쿠폰" : r.type === "corkage_free" ? "콜키지프리" :
                    r.type === "birthday" ? "생일쿠폰" : r.type === "anniversary" ? "기념일쿠폰" : r.type;
      (row as Record<string, unknown>)[label] = ((row as Record<string, number>)[label] ?? 0) + Number(r.count);
      map.set(r.period, row);
    }
    return Array.from(map.values()).sort((a, b) => String(a.period).localeCompare(String(b.period)));
  }, [couponUsagePeriodQuery.data]);

  // ─── 다운로드 ─────────────────────────────────────────────────────────────
  const handleDownloadMembers = async () => {
    const result = await exportMembersQuery.refetch();
    if (!result.data?.length) return;
    const rows = result.data.map((m) => ({
      ID: m.id, 이름: m.name, 이메일: m.email, 전화번호: m.phone,
      생년월일: m.birthDate ? new Date(m.birthDate).toLocaleDateString("ko-KR") : "",
      마케팅동의: m.marketingConsent ? "동의" : "미동의",
      상태: m.status,
      가입일: m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("ko-KR") : "",
    }));
    downloadExcel(rows as Record<string, unknown>[], `NOPS_회원목록_${start}_${end}`);
  };

  const handleDownloadCoupons = async () => {
    const result = await exportCouponQuery.refetch();
    if (!result.data?.length) return;
    const rows = result.data.map((c) => ({
      쿠폰ID: c.couponId, 쿠폰코드: c.couponCode, 쿠폰명: c.couponName, 쿠폰종류: c.couponType,
      할인율: c.discountPercent ? `${c.discountPercent}%` : "-",
      회원명: c.memberName ?? "", 이메일: c.memberEmail ?? "", 전화번호: c.memberPhone ?? "",
      사용일시: c.usedAt ? new Date(c.usedAt).toLocaleString("ko-KR") : "",
      사용지점: c.usedBranchCode ?? "",
    }));
    downloadExcel(rows as Record<string, unknown>[], `NOPS_쿠폰사용내역_${start}_${end}`);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Analytics</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">데이터 분석</h1>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
              <p className="text-2xl font-bold text-foreground">{kpi.value}{kpi.unit}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* ─── 기간별 분석 섹션 ─────────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">기간별 분석 및 데이터 다운로드</p>
          </div>

          {/* 기간 필터 */}
          <div className="flex flex-wrap gap-3 items-end mb-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">기간</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">최근 7일</SelectItem>
                  <SelectItem value="30d">최근 30일</SelectItem>
                  <SelectItem value="3m">최근 3개월</SelectItem>
                  <SelectItem value="6m">최근 6개월</SelectItem>
                  <SelectItem value="1y">최근 1년</SelectItem>
                  <SelectItem value="this_month">이번 달</SelectItem>
                  <SelectItem value="custom">직접 입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">시작일</Label>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-36" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">종료일</Label>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-36" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">집계 단위</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "month")}>
                <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">일별</SelectItem>
                  <SelectItem value="month">월별</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">지점</Label>
              <Select value={branchCode} onValueChange={setBranchCode}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 지점</SelectItem>
                  {branchCodes.map((b) => (
                    <SelectItem key={b.code} value={b.code}>{b.name} ({b.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {branchCode !== "all" && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <p className="text-xs text-primary font-medium">지점 필터 적용: <strong>{branchCode}</strong> — 쿠폰 사용 차트와 다운로드에 지점 필터가 적용됩니다.</p>
            </div>
          )}

          {/* 기간 내 요약 */}
          {isValidRange && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">기간 내 신규 가입</p>
                <p className="text-xl font-bold text-primary">
                  {membersPeriodQuery.isLoading ? "..." : (membersPeriodQuery.data?.reduce((s, r) => s + Number(r.count), 0) ?? 0).toLocaleString()}명
                </p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">기간 내 쿠폰 사용</p>
                <p className="text-xl font-bold text-primary">
                  {couponUsagePeriodQuery.isLoading ? "..." : (couponUsagePeriodQuery.data?.reduce((s, r) => s + Number(r.count), 0) ?? 0).toLocaleString()}건
                </p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">조회 기간</p>
                <p className="text-xs font-semibold text-foreground">{start} ~ {end}</p>
              </div>
            </div>
          )}

          {/* 기간별 가입자 차트 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground">기간별 신규 가입자</p>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                onClick={handleDownloadMembers} disabled={exportMembersQuery.isFetching}>
                <Download className="w-3.5 h-3.5" />
                {exportMembersQuery.isFetching ? "다운로드 중..." : "회원 데이터 (.xlsx)"}
              </Button>
            </div>
            {!isValidRange ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">기간을 선택해주세요</div>
            ) : membersPeriodQuery.isLoading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">로딩 중...</div>
            ) : memberChartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">해당 기간에 가입자가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={memberChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="가입자" fill="oklch(0.52 0.09 55)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 기간별 쿠폰 사용 차트 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground">기간별 쿠폰 사용 현황</p>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                onClick={handleDownloadCoupons} disabled={exportCouponQuery.isFetching}>
                <Download className="w-3.5 h-3.5" />
                {exportCouponQuery.isFetching ? "다운로드 중..." : "쿠폰 데이터 (.xlsx)"}
              </Button>
            </div>
            {!isValidRange ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">기간을 선택해주세요</div>
            ) : couponUsagePeriodQuery.isLoading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">로딩 중...</div>
            ) : couponChartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">해당 기간에 사용된 쿠폰이 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={couponChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="할인쿠폰" fill="#c9a84c" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="콜키지프리" fill="#6366f1" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="생일쿠폰" fill="#ec4899" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="기념일쿠폰" fill="#f97316" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ─── 전체 현황 차트 (기존 유지) ──────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <SectionTitle icon={Users} title="회원 현황 (전체)" />
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <p className="text-xs text-muted-foreground mb-4">월별 신규 가입 (최근 12개월)</p>
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
                      <div className={`h-full ${seg.color} rounded-full`}
                        style={{ width: `${ms.total > 0 ? (seg.value / ms.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <SectionTitle icon={Tag} title="쿠폰 분석 (전체)" />
          <div className="grid md:grid-cols-2 gap-8">
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
            <div>
              <p className="text-xs text-muted-foreground mb-4">상태별 분포</p>
              {couponStatusData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={couponStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
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

        {/* ─── 지점별 가입자 통계 ─────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <SectionTitle icon={MapPin} title="지점별 가입자 현황" />
          {branchMemberStatsQuery.isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">로딩 중...</div>
          ) : !branchMemberStatsQuery.data?.length ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-muted-foreground mb-4">지점별 가입자 수</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={branchMemberStatsQuery.data}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="branch" tick={{ fontSize: 10 }} width={64} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()}명`, "가입자"]} />
                    <Bar dataKey="count" name="가입자" fill="oklch(0.52 0.09 55)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-4">지점 비율</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={branchMemberStatsQuery.data}
                      dataKey="count"
                      nameKey="branch"
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={80}
                      label={({ branch, percent }) => percent > 0.04 ? `${branch} ${Math.round(percent * 100)}%` : ""}
                      labelLine={false}
                    >
                      {branchMemberStatsQuery.data.map((_, i) => (
                        <Cell key={i} fill={[
                          "oklch(0.52 0.09 55)","oklch(0.62 0.07 200)","oklch(0.72 0.06 140)",
                          "oklch(0.65 0.1 30)","oklch(0.58 0.12 280)","oklch(0.68 0.09 160)",
                          "oklch(0.55 0.11 320)","oklch(0.75 0.08 80)","oklch(0.60 0.10 240)",
                          "oklch(0.70 0.07 20)","oklch(0.50 0.13 350)","oklch(0.65 0.09 110)",
                          "oklch(0.72 0.06 60)","oklch(0.58 0.08 190)","oklch(0.63 0.11 300)",
                        ][i % 15]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()}명`, "가입자"]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {/* 지점별 순위 테이블 */}
          {(branchMemberStatsQuery.data?.length ?? 0) > 0 && (
            <div className="mt-6 border-t border-border/30 pt-4">
              <p className="text-xs text-muted-foreground mb-3">지점별 순위</p>
              <div className="space-y-2">
                {branchMemberStatsQuery.data!.map((row, i) => {
                  const total = branchMemberStatsQuery.data!.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? (row.count / total) * 100 : 0;
                  return (
                    <div key={row.branch} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                      <span className={`text-xs font-medium w-28 truncate ${row.branch === '미지정' ? 'text-muted-foreground' : 'text-foreground'}`}>{row.branch}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.branch === '미지정' ? 'bg-muted-foreground/30' : 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-16 text-right">{row.count.toLocaleString()}명 ({pct.toFixed(1)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-6">
          <SectionTitle icon={TrendingUp} title="매출 분석" />
          {monthlyRevenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip formatter={(v: number) => [`₩${v.toLocaleString()}`, "매출"]} />
                <Line type="monotone" dataKey="매출" stroke="oklch(0.52 0.09 55)" strokeWidth={2}
                  dot={{ fill: "oklch(0.52 0.09 55)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">구매 이력이 없습니다</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
