import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  User,
  Tag,
  Calendar,
  ShoppingBag,
  FileText,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function AdminMemberDetail() {
  const params = useParams<{ id: string }>();
  const memberId = Number(params.id);
  const utils = trpc.useUtils();

  const memberQuery = trpc.admin.getMember.useQuery({ id: memberId });
  const visitsQuery = trpc.admin.getVisits.useQuery({ memberId });
  const purchasesQuery = trpc.admin.getPurchases.useQuery({ memberId });
  const couponsQuery = trpc.admin.listCoupons.useQuery({ memberId, limit: 50 });
  const consentQuery = trpc.admin.getConsentLogs.useQuery({ memberId });

  const member = memberQuery.data;

  // Visit form
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitForm, setVisitForm] = useState({ visitedAt: "", partySize: "", notes: "" });
  const addVisitMutation = trpc.admin.addVisit.useMutation({
    onSuccess: () => {
      utils.admin.getVisits.invalidate({ memberId });
      setVisitOpen(false);
      setVisitForm({ visitedAt: "", partySize: "", notes: "" });
      toast.success("방문 기록이 추가되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteVisitMutation = trpc.admin.deleteVisit.useMutation({
    onSuccess: () => { utils.admin.getVisits.invalidate({ memberId }); toast.success("삭제되었습니다."); },
  });

  // Purchase form
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    amount: "",
    discountAmount: "0",
    finalAmount: "",
    memo: "",
    purchasedAt: "",
  });
  const addPurchaseMutation = trpc.admin.addPurchase.useMutation({
    onSuccess: () => {
      utils.admin.getPurchases.invalidate({ memberId });
      setPurchaseOpen(false);
      setPurchaseForm({ amount: "", discountAmount: "0", finalAmount: "", memo: "", purchasedAt: "" });
      toast.success("구매 이력이 추가되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });
  const deletePurchaseMutation = trpc.admin.deletePurchase.useMutation({
    onSuccess: () => { utils.admin.getPurchases.invalidate({ memberId }); toast.success("삭제되었습니다."); },
  });

  // Coupon issue
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponType, setCouponType] = useState<"discount_percent" | "corkage_free" | "birthday">("discount_percent");
  const issueCouponMutation = trpc.admin.issueCoupon.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate({ memberId });
      setCouponOpen(false);
      toast.success("쿠폰이 발급되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Coupon use
  const useCouponMutation = trpc.admin.useCoupon.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate({ memberId });
      toast.success("쿠폰이 사용 처리되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Update member notes
  const [notesEdit, setNotesEdit] = useState(false);
  const [notes, setNotes] = useState("");
  const updateMemberMutation = trpc.admin.updateMember.useMutation({
    onSuccess: () => {
      utils.admin.getMember.invalidate({ id: memberId });
      setNotesEdit(false);
      toast.success("저장되었습니다.");
    },
  });

  if (memberQuery.isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-muted-foreground">로딩 중...</div>
      </AdminLayout>
    );
  }

  if (!member) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-muted-foreground">회원을 찾을 수 없습니다.</div>
      </AdminLayout>
    );
  }

  const activeCoupons = couponsQuery.data?.items.filter((i) => i.coupon.status === "active") ?? [];

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Back */}
        <Link href="/admin/members">
          <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            회원 목록
          </button>
        </Link>

        {/* Member header */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-xl font-bold">{member.name.charAt(0)}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-foreground">{member.name}</h1>
                  <Badge
                    className={
                      member.status === "active"
                        ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {member.status === "active" ? "활성" : member.status === "inactive" ? "비활성" : "탈퇴"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{member.email}</p>
                <p className="text-sm text-muted-foreground">{member.phone}</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">가입일</p>
              <p className="font-medium text-foreground">
                {new Date(member.joinedAt).toLocaleDateString("ko-KR")}
              </p>
              <p className="text-muted-foreground mt-2">생년월일</p>
              <p className="font-medium text-foreground">
                {new Date(member.birthDate).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </div>

          {/* Consent badges */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${member.privacyConsent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {member.privacyConsent ? "✓ 개인정보 동의" : "✗ 개인정보 미동의"}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${member.marketingConsent ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
              {member.marketingConsent ? "✓ 마케팅 동의" : "✗ 마케팅 미동의"}
            </span>
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-green-100 text-green-700">
              ✓ 사용가능 쿠폰 {activeCoupons.length}장
            </span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="visits">
          <TabsList className="mb-6">
            <TabsTrigger value="visits" className="gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              방문 기록
            </TabsTrigger>
            <TabsTrigger value="purchases" className="gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              구매 이력
            </TabsTrigger>
            <TabsTrigger value="coupons" className="gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              쿠폰
            </TabsTrigger>
            <TabsTrigger value="consent" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              동의 기록
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5">
              <Edit3 className="w-3.5 h-3.5" />
              메모
            </TabsTrigger>
          </TabsList>

          {/* ─── Visits ─── */}
          <TabsContent value="visits">
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-foreground">방문 기록</h2>
                <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      추가
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>방문 기록 추가</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>방문 일시</Label>
                        <Input
                          type="datetime-local"
                          value={visitForm.visitedAt}
                          onChange={(e) => setVisitForm((f) => ({ ...f, visitedAt: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>인원 수</Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="2"
                          value={visitForm.partySize}
                          onChange={(e) => setVisitForm((f) => ({ ...f, partySize: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>메모</Label>
                        <Textarea
                          placeholder="특이사항 등"
                          value={visitForm.notes}
                          onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!visitForm.visitedAt || addVisitMutation.isPending}
                        onClick={() =>
                          addVisitMutation.mutate({
                            memberId,
                            visitedAt: visitForm.visitedAt,
                            partySize: visitForm.partySize ? Number(visitForm.partySize) : undefined,
                            notes: visitForm.notes || undefined,
                          })
                        }
                      >
                        저장
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {visitsQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">방문 기록이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {visitsQuery.data?.map((v) => (
                    <div key={v.id} className="flex items-start justify-between p-4 rounded-xl bg-muted/30 border border-border/30">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {new Date(v.visitedAt).toLocaleString("ko-KR")}
                        </p>
                        {v.partySize && (
                          <p className="text-xs text-muted-foreground mt-0.5">{v.partySize}명 방문</p>
                        )}
                        {v.notes && <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>}
                      </div>
                      <button
                        onClick={() => deleteVisitMutation.mutate({ id: v.id })}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Purchases ─── */}
          <TabsContent value="purchases">
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-foreground">구매 이력</h2>
                <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      추가
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>구매 이력 추가</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>구매 일시</Label>
                        <Input
                          type="datetime-local"
                          value={purchaseForm.purchasedAt}
                          onChange={(e) => setPurchaseForm((f) => ({ ...f, purchasedAt: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>결제 금액 (원)</Label>
                        <Input
                          type="number"
                          placeholder="50000"
                          value={purchaseForm.amount}
                          onChange={(e) => setPurchaseForm((f) => ({ ...f, amount: e.target.value, finalAmount: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>할인 금액 (원)</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={purchaseForm.discountAmount}
                          onChange={(e) => {
                            const disc = Number(e.target.value);
                            const amt = Number(purchaseForm.amount);
                            setPurchaseForm((f) => ({
                              ...f,
                              discountAmount: e.target.value,
                              finalAmount: String(Math.max(0, amt - disc)),
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>최종 결제 금액 (원)</Label>
                        <Input
                          type="number"
                          value={purchaseForm.finalAmount}
                          onChange={(e) => setPurchaseForm((f) => ({ ...f, finalAmount: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>메모</Label>
                        <Textarea
                          placeholder="주문 내역 등"
                          value={purchaseForm.memo}
                          onChange={(e) => setPurchaseForm((f) => ({ ...f, memo: e.target.value }))}
                          rows={2}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!purchaseForm.purchasedAt || !purchaseForm.amount || addPurchaseMutation.isPending}
                        onClick={() =>
                          addPurchaseMutation.mutate({
                            memberId,
                            amount: Number(purchaseForm.amount),
                            discountAmount: Number(purchaseForm.discountAmount),
                            finalAmount: Number(purchaseForm.finalAmount),
                            memo: purchaseForm.memo || undefined,
                            purchasedAt: purchaseForm.purchasedAt,
                          })
                        }
                      >
                        저장
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {purchasesQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">구매 이력이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {purchasesQuery.data?.map((p) => (
                    <div key={p.id} className="flex items-start justify-between p-4 rounded-xl bg-muted/30 border border-border/30">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {new Date(p.purchasedAt).toLocaleString("ko-KR")}
                        </p>
                        <p className="text-sm font-bold text-primary mt-0.5">
                          ₩{Number(p.finalAmount).toLocaleString()}
                          {Number(p.discountAmount) > 0 && (
                            <span className="text-xs text-muted-foreground font-normal ml-1.5">
                              (할인 ₩{Number(p.discountAmount).toLocaleString()})
                            </span>
                          )}
                        </p>
                        {p.memo && <p className="text-xs text-muted-foreground mt-0.5">{p.memo}</p>}
                      </div>
                      <button
                        onClick={() => deletePurchaseMutation.mutate({ id: p.id })}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Coupons ─── */}
          <TabsContent value="coupons">
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-foreground">쿠폰 관리</h2>
                <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <Gift className="w-3.5 h-3.5" />
                      발급
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>쿠폰 발급</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>쿠폰 종류</Label>
                        <Select value={couponType} onValueChange={(v) => setCouponType(v as typeof couponType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="discount_percent">10% 할인 쿠폰</SelectItem>
                            <SelectItem value="corkage_free">콜키지 프리 쿠폰</SelectItem>
                            <SelectItem value="birthday">생일 15% 할인 쿠폰</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full"
                        disabled={issueCouponMutation.isPending}
                        onClick={() => issueCouponMutation.mutate({ memberId, type: couponType })}
                      >
                        발급하기
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {couponsQuery.data?.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">발급된 쿠폰이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {couponsQuery.data?.items.map(({ coupon }) => (
                    <div key={coupon.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${coupon.status === "active" ? "bg-primary/10" : "bg-muted"}`}>
                          <Gift className={`w-4 h-4 ${coupon.status === "active" ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{coupon.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{coupon.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}까지
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            coupon.status === "active"
                              ? "bg-green-100 text-green-700"
                              : coupon.status === "used"
                              ? "bg-muted text-muted-foreground"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {coupon.status === "active" ? "사용가능" : coupon.status === "used" ? "사용완료" : "만료"}
                        </span>
                        {coupon.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => useCouponMutation.mutate({ couponId: coupon.id })}
                            disabled={useCouponMutation.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            사용처리
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Consent ─── */}
          <TabsContent value="consent">
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <h2 className="text-sm font-semibold text-foreground mb-5">동의 기록 (법적 보관)</h2>
              {consentQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">동의 기록이 없습니다</p>
              ) : (
                <div className="space-y-4">
                  {consentQuery.data?.map((log) => (
                    <div key={log.id} className="p-4 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              log.consentType === "privacy"
                                ? "bg-blue-100 text-blue-700"
                                : log.consentType === "marketing"
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {log.consentType === "privacy"
                              ? "개인정보 수집"
                              : log.consentType === "marketing"
                              ? "마케팅 동의"
                              : "마케팅 철회"}
                          </span>
                          <span className={`text-xs font-medium ${log.agreed ? "text-green-600" : "text-red-600"}`}>
                            {log.agreed ? "동의" : "거부"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground transition-colors">약관 전문 보기</summary>
                        <pre className="mt-2 whitespace-pre-wrap leading-relaxed font-sans border-t border-border/50 pt-2">
                          {log.consentContent}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Notes ─── */}
          <TabsContent value="notes">
            <div className="bg-card rounded-2xl border border-border/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-foreground">운영자 메모</h2>
                {!notesEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setNotes(member.notes ?? ""); setNotesEdit(true); }}
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                    편집
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setNotesEdit(false)}>취소</Button>
                    <Button
                      size="sm"
                      onClick={() => updateMemberMutation.mutate({ id: memberId, notes })}
                      disabled={updateMemberMutation.isPending}
                    >
                      저장
                    </Button>
                  </div>
                )}
              </div>
              {notesEdit ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  placeholder="회원에 대한 메모를 입력하세요..."
                  className="resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap min-h-[100px]">
                  {member.notes || "메모가 없습니다."}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
