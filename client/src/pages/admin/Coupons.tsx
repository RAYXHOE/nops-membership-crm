import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import QrScannerModal from "@/components/QrScannerModal";
import { trpc } from "@/lib/trpc";
import { Tag, CheckCircle2, Filter, RefreshCw, QrCode, Search, RotateCcw, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function AdminCoupons() {
  const [status, setStatus] = useState<"active" | "used" | "expired" | "all">("all");
  const [page, setPage] = useState(0);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchInput, setMemberSearchInput] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const limit = 30;
  const utils = trpc.useUtils();

  const branchCodesQuery = trpc.admin.listBranchCodes.useQuery();
  const branchCodes = branchCodesQuery.data ?? [];

  const query = trpc.admin.listCoupons.useQuery({
    status: status === "all" ? undefined : status,
    limit,
    offset: page * limit,
    memberSearch: memberSearch || undefined,
    usedBranchCode: branchFilter === "all" ? undefined : branchFilter,
  });

  const useCouponMutation = trpc.admin.useCoupon.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate();
      toast.success("쿠폰이 사용 처리되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const revertCouponMutation = trpc.admin.revertCoupon.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate();
      toast.success("쿠폰 사용처리가 철회되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const expireMutation = trpc.admin.expireCoupons.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate();
      toast.success("만료 처리가 완료되었습니다.");
    },
  });

  const birthdayMutation = trpc.admin.issueBirthdayCoupons.useMutation({
    onSuccess: (data) => {
      utils.admin.listCoupons.invalidate();
      toast.success(`생일 쿠폰 ${data.issued}건 발급 완료`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [scannerOpen, setScannerOpen] = useState(false);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberSearch(memberSearchInput);
    setPage(0);
  };

  const typeLabel = (type: string) => {
    if (type === "discount_percent") return "할인 쿠폰";
    if (type === "corkage_free") return "콜키지 프리";
    return "생일 쿠폰";
  };

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Coupons</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            쿠폰 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">총 {total.toLocaleString()}건</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* QR 스캔 버튼 - 가장 눈에 띄게 */}
          <Button
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setScannerOpen(true)}
          >
            <QrCode className="w-4 h-4" />
            QR 스캔 사용처리
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => birthdayMutation.mutate()}
            disabled={birthdayMutation.isPending}
          >
            <Tag className="w-3.5 h-3.5" />
            오늘 생일 쿠폰 발급
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => expireMutation.mutate()}
            disabled={expireMutation.isPending}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            만료 처리 실행
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-40 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="회원 이름 / 이메일 검색"
                value={memberSearchInput}
                onChange={(e) => setMemberSearchInput(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
              <SelectTrigger className="w-36 h-10">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="active">사용 가능</SelectItem>
                <SelectItem value="used">사용 완료</SelectItem>
                <SelectItem value="expired">만료</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36 h-10">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 지점</SelectItem>
                {branchCodes.map((code) => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10 px-5">검색</Button>
            {(memberSearch || branchFilter !== "all") && (
              <Button type="button" variant="ghost" size="sm" className="h-10 text-xs text-muted-foreground"
                onClick={() => { setMemberSearch(""); setMemberSearchInput(""); setBranchFilter("all"); setPage(0); }}>
                필터 초기화
              </Button>
            )}
          </form>
        </div>

        {/* 모바일 카드 리스트 (md 미만) */}
        <div className="md:hidden space-y-3 mb-4">
          {query.isLoading ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : items.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">쿠폰이 없습니다</div>
          ) : (
            items.map(({ coupon, memberName }) => (
              <div key={coupon.id} className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{coupon.name}</p>
                    <p className="text-xs text-muted-foreground">{memberName ?? "—"}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    coupon.status === "active" ? "bg-green-100 text-green-700" :
                    coupon.status === "used" ? "bg-muted text-muted-foreground" : "bg-red-100 text-red-600"
                  }`}>
                    {coupon.status === "active" ? "사용가능" : coupon.status === "used" ? "사용완료" : "만료"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <code className="text-xs font-mono bg-muted px-2 py-1 rounded block">{coupon.code}</code>
                    <p className="text-xs text-muted-foreground">유효: {new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}까지</p>
                    {coupon.discountPercent && <p className="text-xs font-bold text-primary">{coupon.discountPercent}% 할인</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {coupon.status === "active" && (
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
                        onClick={() => useCouponMutation.mutate({ couponId: coupon.id })}
                        disabled={useCouponMutation.isPending}>
                        <CheckCircle2 className="w-3 h-3" />사용처리
                      </Button>
                    )}
                    {coupon.status === "used" && (
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                        onClick={() => { if (confirm("사용처리를 철회하시겠습니까?")) revertCouponMutation.mutate({ couponId: coupon.id }); }}
                        disabled={revertCouponMutation.isPending}>
                        <RotateCcw className="w-3 h-3" />철회
                      </Button>
                    )}
                  </div>
                </div>
                {coupon.status === "used" && (coupon as typeof coupon & { usedBranchCode?: string | null }).usedBranchCode && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    <MapPin className="w-3 h-3 inline mr-1" />사용 지점: <span className="font-medium text-foreground">{(coupon as typeof coupon & { usedBranchCode?: string | null }).usedBranchCode}</span>
                  </p>
                )}
              </div>
            ))
          )}
          {total > limit && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">{page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}건</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>이전</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>다음</Button>
              </div>
            </div>
          )}
        </div>

        {/* 데스크톱 테이블 (md 이상) */}
        <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">쿠폰</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">회원</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">코드</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">유효기간</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {query.isLoading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">쿠폰이 없습니다</td></tr>
                ) : (
                  items.map(({ coupon, memberName, memberEmail }) => (
                    <tr key={coupon.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-foreground">{coupon.name}</p>
                        <p className="text-xs text-muted-foreground">{typeLabel(coupon.type)}</p>
                        {coupon.discountPercent && <p className="text-xs font-bold text-primary">{coupon.discountPercent}% 할인</p>}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-foreground">{memberName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{memberEmail ?? ""}</p>
                      </td>
                      <td className="px-4 py-4"><code className="text-xs font-mono bg-muted px-2 py-1 rounded">{coupon.code}</code></td>
                      <td className="px-4 py-4 text-xs text-muted-foreground hidden lg:table-cell">{new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}</td>
                      <td className="px-4 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          coupon.status === "active" ? "bg-green-100 text-green-700" :
                          coupon.status === "used" ? "bg-muted text-muted-foreground" : "bg-red-100 text-red-600"
                        }`}>
                          {coupon.status === "active" ? "사용가능" : coupon.status === "used" ? "사용완료" : "만료"}
                        </span>
                        {coupon.usedAt && <p className="text-xs text-muted-foreground mt-0.5">{new Date(coupon.usedAt).toLocaleDateString("ko-KR")}</p>}
                        {coupon.status === "used" && (coupon as typeof coupon & { usedBranchCode?: string | null }).usedBranchCode && (
                          <p className="text-xs text-primary mt-0.5 font-medium">{(coupon as typeof coupon & { usedBranchCode?: string | null }).usedBranchCode}</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5">
                          {coupon.status === "active" && (
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                              onClick={() => useCouponMutation.mutate({ couponId: coupon.id })}
                              disabled={useCouponMutation.isPending}>
                              <CheckCircle2 className="w-3 h-3" />사용처리
                            </Button>
                          )}
                          {coupon.status === "used" && (
                            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => { if (confirm("사용처리를 철회하시겠습니까?")) revertCouponMutation.mutate({ couponId: coupon.id }); }}
                              disabled={revertCouponMutation.isPending}>
                              <RotateCcw className="w-3 h-3" />철회
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="border-t border-border/50 px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}건</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>이전</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>다음</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR 스캐너 모달 */}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSuccess={() => {
          utils.admin.listCoupons.invalidate();
          setScannerOpen(false);
        }}
      />
    </AdminLayout>
  );
}
