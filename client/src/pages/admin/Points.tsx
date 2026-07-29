import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Coins, Search, Filter, AlertTriangle, ChevronRight,
  TrendingUp, Users, Wallet, Clock, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import * as XLSX from "xlsx";

const DIST_COLORS = [
  "oklch(0.82 0.02 60)", "oklch(0.68 0.07 55)", "oklch(0.55 0.10 50)",
  "oklch(0.45 0.12 45)", "oklch(0.35 0.14 40)",
];

function ExpiryBadge({ date }: { date: Date | null }) {
  if (!date) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString("ko-KR");
  if (diffDays <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{label} (D-{diffDays})</span>;
  if (diffDays <= 90) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{label} (D-{diffDays})</span>;
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

export default function AdminPoints() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [hasBalance, setHasBalance] = useState(false);
  const [expiringDays, setExpiringDays] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<"balance_desc" | "balance_asc" | "joined_desc" | "expiry_asc">("balance_desc");
  const [page, setPage] = useState(0);
  const limit = 50;

  const statsQuery = trpc.admin.getPointsStats.useQuery();
  const listQuery = trpc.admin.listMembersPoints.useQuery({
    search: search || undefined,
    hasBalance: hasBalance || undefined,
    expiringDays,
    sortBy,
    limit,
    offset: page * limit,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pts = statsQuery.data;

  const monthlyData = useMemo(() =>
    (pts?.monthly ?? []).map((m) => ({
      month: String(m.month).slice(5),
      적립: Number(m.earned),
      사용: Number(m.used),
    })), [pts?.monthly]);

  const distData = useMemo(() =>
    (pts?.distribution ?? []).map((d) => ({
      name: String(d.rangeLabel),
      value: Number(d.cnt),
    })), [pts?.distribution]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  };

  const handleDownload = () => {
    if (!items.length) return;
    const rows = items.map((m) => ({
      ID: m.id,
      이름: m.name,
      이메일: m.email,
      전화번호: m.phone,
      현재잔액: m.pointBalance,
      누적적립: m.totalEarned,
      사용금액: m.totalUsed,
      적립건수: m.earnCount,
      최조만료일: m.earliestExpiry ? new Date(m.earliestExpiry).toLocaleDateString("ko-KR") : "",
      가입일: new Date(m.joinedAt).toLocaleDateString("ko-KR"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:6},{wch:12},{wch:28},{wch:14},{wch:10},{wch:10},{wch:10},{wch:8},{wch:14},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "적립금현황");
    XLSX.writeFile(wb, `NOPS_적립금현황_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Points</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">적립금 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            정책: 결제금액 3% 적립 · 1만원 단위 사용 · 적립 연도 기준 다음 해 12월 31일 만료
          </p>
        </div>

        {/* KPI 카드 */}
        {pts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: Wallet, label: "전체 잔액 합계", value: `${pts.totalBalance.toLocaleString()}원`, sub: `${pts.withBalance}명 보유`, color: "text-primary" },
              { icon: TrendingUp, label: "누적 적립", value: `${pts.totalEarned.toLocaleString()}원`, sub: `${pts.earnCount}건`, color: "text-green-600" },
              { icon: Users, label: "평균 잔액", value: `${pts.avgBalance.toLocaleString()}원`, sub: `최고 ${pts.maxBalance.toLocaleString()}원`, color: "text-blue-600" },
              { icon: Clock, label: "90일 내 만료", value: `${pts.expiringAmount.toLocaleString()}원`, sub: `${pts.expiringCount}건`, color: pts.expiringAmount > 0 ? "text-amber-600" : "text-muted-foreground" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-card rounded-2xl border border-border/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* 알림 배지 */}
        {pts && (pts.missingEarnCount > 0 || pts.expiringAmount > 0) && (
          <div className="flex flex-wrap gap-3 mb-6">
            {pts.missingEarnCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs text-red-700 font-medium">적립 누락 {pts.missingEarnCount}건 — 대시보드에서 확인</span>
              </div>
            )}
            {pts.expiringAmount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-amber-700 font-medium">
                  90일 내 만료 예정 {pts.expiringAmount.toLocaleString()}원 —
                  <button className="underline ml-1" onClick={() => { setExpiringDays(90); setPage(0); }}>목록 보기</button>
                </span>
              </div>
            )}
          </div>
        )}

        {/* 차트 */}
        {pts && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-card rounded-2xl border border-border/50 p-5">
              <p className="text-xs font-semibold text-muted-foreground mb-4">월별 적립 / 사용 (최근 6개월)</p>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 60)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}천`} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="적립" fill="oklch(0.52 0.09 55)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="사용" fill="oklch(0.62 0.07 200)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </div>
            <div className="bg-card rounded-2xl border border-border/50 p-5">
              <p className="text-xs font-semibold text-muted-foreground mb-4">잔액 구간별 회원 분포</p>
              {distData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={distData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }: { name: string; percent: number }) =>
                        percent > 0.06 ? `${Math.round(percent * 100)}%` : ""}
                      labelLine={false}>
                      {distData.map((_, i) => <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v}명`, "회원"]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </div>
          </div>
        )}

        {/* 필터 */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 이메일, 전화번호 검색"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v as typeof sortBy); setPage(0); }}>
              <SelectTrigger className="w-36 h-10">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balance_desc">잔액 높은 순</SelectItem>
                <SelectItem value="balance_asc">잔액 낮은 순</SelectItem>
                <SelectItem value="joined_desc">최근 가입순</SelectItem>
                <SelectItem value="expiry_asc">만료 임박순</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={expiringDays?.toString() ?? "all"}
              onValueChange={(v) => { setExpiringDays(v === "all" ? undefined : Number(v)); setPage(0); }}
            >
              <SelectTrigger className="w-36 h-10"><SelectValue placeholder="만료 필터" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="30">30일 내 만료</SelectItem>
                <SelectItem value="60">60일 내 만료</SelectItem>
                <SelectItem value="90">90일 내 만료</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => { setHasBalance(!hasBalance); setPage(0); }}
              className={`h-10 px-3 rounded-lg border text-xs font-medium transition-colors ${
                hasBalance ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              잔액 보유자만{hasBalance && " ✔"}
            </button>
            <Button type="submit" className="h-10 px-5">검색</Button>
            <Button type="button" variant="outline" className="h-10 px-4 gap-2" onClick={handleDownload}>
              <Download className="w-4 h-4" />엑셀
            </Button>
          </form>
        </div>

        {/* 테이블 */}
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="px-6 py-3 border-b border-border/50 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">총 {total.toLocaleString()}명</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">회원</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">전화번호</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">현재 잔액</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">누적 적립</th>
                  <th className="text-right px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">사용</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">최조 만료일</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">가입일</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {listQuery.isLoading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">해당하는 회원이 없습니다</td></tr>
                ) : items.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-primary text-xs font-semibold">{m.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{m.phone}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`text-sm font-bold ${m.pointBalance > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {m.pointBalance.toLocaleString()}원
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground hidden md:table-cell">
                      {m.totalEarned.toLocaleString()}원
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-muted-foreground hidden md:table-cell">
                      {m.totalUsed.toLocaleString()}원
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <ExpiryBadge date={m.earliestExpiry ? new Date(m.earliestExpiry) : null} />
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground hidden lg:table-cell">
                      {new Date(m.joinedAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/members/${m.id}`}>
                        <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {total > limit && (
            <div className="border-t border-border/50 px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}명</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 0}>이전</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}>다음</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
