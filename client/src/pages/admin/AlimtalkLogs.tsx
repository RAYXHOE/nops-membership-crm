import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Filter, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<string, string> = {
  welcome: "가입 환영",
  expiry: "쿠폰 만료",
  anniversary: "결혼기념일",
  birthday: "생일",
  corkage: "콜키지 재발급",
};

const TYPE_COLORS: Record<string, string> = {
  welcome: "bg-blue-100 text-blue-700",
  expiry: "bg-orange-100 text-orange-700",
  anniversary: "bg-pink-100 text-pink-700",
  birthday: "bg-purple-100 text-purple-700",
  corkage: "bg-teal-100 text-teal-700",
};

export default function AdminAlimtalkLogs() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [page, setPage] = useState(0);
  const limit = 50;

  const query = trpc.admin.listAlimtalkLogs.useQuery({
    type: typeFilter === "all" ? undefined : typeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit,
    offset: page * limit,
  });

  const logs = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Alimtalk Logs</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">알림톡 발송 내역</h1>
          <p className="text-sm text-muted-foreground mt-1">총 {total.toLocaleString()}건</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "전체", value: total, color: "text-foreground" },
            { label: "성공", value: query.data?.items.filter(l => l.status === "success").length ?? 0, color: "text-green-600" },
            { label: "실패", value: query.data?.items.filter(l => l.status === "failed").length ?? 0, color: "text-red-600" },
            { label: "성공률", value: total > 0 ? `${Math.round((successCount / (successCount + failedCount || 1)) * 100)}%` : "—", color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-2xl border border-border/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40 h-10">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 종류</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(0); }}>
              <SelectTrigger className="w-36 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="success">성공</SelectItem>
                <SelectItem value="failed">실패</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => query.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />새로고침
            </Button>
            {(typeFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-10 text-xs text-muted-foreground"
                onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setPage(0); }}>
                필터 초기화
              </Button>
            )}
          </div>
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden space-y-3 mb-4">
          {query.isLoading ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : logs.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border/50 p-8 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">발송 내역이 없습니다</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[log.type] ?? "bg-muted text-muted-foreground"}`}>
                      {TYPE_LABELS[log.type] ?? log.type}
                    </span>
                    {log.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.sentAt).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{log.recipientName ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{log.recipientPhone}</p>
                {log.status === "failed" && log.errorMessage && (
                  <p className="text-xs text-red-500 mt-1.5 bg-red-50 rounded px-2 py-1 break-all">{log.errorMessage.slice(0, 100)}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* 데스크탑 테이블 */}
        <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase">종류</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">수신자</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">전화번호</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">상태</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">오류 메시지</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">발송 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {query.isLoading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">발송 내역이 없습니다</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[log.type] ?? "bg-muted text-muted-foreground"}`}>
                          {TYPE_LABELS[log.type] ?? log.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">{log.recipientName ?? "—"}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground font-mono">{log.recipientPhone}</td>
                      <td className="px-4 py-4">
                        {log.status === "success" ? (
                          <div className="flex items-center gap-1.5 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-medium">성공</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-red-500">
                            <XCircle className="w-4 h-4" />
                            <span className="text-xs font-medium">실패</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-red-500 hidden lg:table-cell max-w-xs truncate">
                        {log.errorMessage ? log.errorMessage.slice(0, 80) : "—"}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {new Date(log.sentAt).toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="border-t border-border/50 px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}건
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>이전</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>다음</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
