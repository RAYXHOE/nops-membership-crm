import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { MessageCircle, Filter, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  coupon: "쿠폰",
  membership: "멤버십",
  points: "적립금",
  other: "기타",
};

const STATUS_CONFIG = {
  pending: { label: "답변 대기", color: "bg-amber-100 text-amber-700", icon: Clock },
  answered: { label: "답변 완료", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  closed: { label: "종료", color: "bg-muted text-muted-foreground", icon: XCircle },
};

export default function AdminInquiries() {
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "answered" | "closed">("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const limit = 30;
  const utils = trpc.useUtils();

  const query = trpc.admin.listInquiries.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit,
    offset: page * limit,
  });

  const replyMutation = trpc.admin.replyInquiry.useMutation({
    onSuccess: () => {
      utils.admin.listInquiries.invalidate();
      toast.success("답변이 저장되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-5 h-5 text-primary" />
              <p className="text-xs text-primary tracking-widest uppercase">Inquiries</p>
            </div>
            <h1 className="text-2xl font-bold text-foreground">고객 문의</h1>
            <p className="text-sm text-muted-foreground mt-1">
              총 {total}건
              {pendingCount > 0 && <span className="ml-2 text-amber-600 font-medium">· 미답변 {pendingCount}건</span>}
            </p>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(0); }}>
              <SelectTrigger className="w-36 h-10">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">답변 대기</SelectItem>
                <SelectItem value="answered">답변 완료</SelectItem>
                <SelectItem value="closed">종료</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 문의 목록 */}
        {query.isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">로딩 중...</div>
        ) : items.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-12 text-center">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">문의가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status];
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                  {/* 헤더 */}
                  <button
                    className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />{statusCfg.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{item.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.name} · {item.email}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                  </button>

                  {/* 상세 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/30">
                      <div className="mt-4 p-3 bg-muted/30 rounded-xl">
                        <p className="text-xs text-muted-foreground mb-1">문의 내용</p>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{item.content}</p>
                      </div>

                      {item.adminReply && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                          <p className="text-xs text-green-600 font-medium mb-1">관리자 답변</p>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{item.adminReply}</p>
                          {item.repliedAt && (
                            <p className="text-xs text-muted-foreground mt-1">{new Date(item.repliedAt).toLocaleString("ko-KR")}</p>
                          )}
                        </div>
                      )}

                      {item.status !== "closed" && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="답변을 입력하세요..."
                            value={replyText[item.id] ?? ""}
                            onChange={(e) => setReplyText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            rows={3}
                            className="resize-none text-sm"
                          />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline"
                              onClick={() => replyMutation.mutate({ id: item.id, adminReply: replyText[item.id] ?? "", status: "closed" })}
                              disabled={!replyText[item.id] || replyMutation.isPending}>
                              종료 처리
                            </Button>
                            <Button size="sm"
                              onClick={() => replyMutation.mutate({ id: item.id, adminReply: replyText[item.id] ?? "", status: "answered" })}
                              disabled={!replyText[item.id] || replyMutation.isPending}>
                              답변 저장
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {total > limit && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">{page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}건</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>이전</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>다음</Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
