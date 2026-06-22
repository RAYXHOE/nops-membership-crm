import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { MapPin, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Branch = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export default function AdminBranches() {
  const utils = trpc.useUtils();
  const branchesQuery = trpc.admin.listBranches.useQuery();
  const branches = branchesQuery.data ?? [];

  // 신규 등록 폼
  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // 수정 폼
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const createMutation = trpc.admin.createBranch.useMutation({
    onSuccess: () => {
      utils.admin.listBranches.invalidate();
      toast.success("지점이 등록되었습니다.");
      setCreateOpen(false);
      setNewCode(""); setNewName(""); setNewAddress(""); setNewPhone("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.admin.updateBranch.useMutation({
    onSuccess: () => {
      utils.admin.listBranches.invalidate();
      toast.success("지점 정보가 수정되었습니다.");
      setEditBranch(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteBranch.useMutation({
    onSuccess: () => {
      utils.admin.listBranches.invalidate();
      toast.success("지점이 삭제되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveMutation = trpc.admin.updateBranch.useMutation({
    onSuccess: () => utils.admin.listBranches.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newCode || !newName) return toast.error("지점 코드와 지점명은 필수입니다.");
    createMutation.mutate({ code: newCode.toUpperCase(), name: newName, address: newAddress || undefined, phone: newPhone || undefined });
  };

  const handleEdit = (b: Branch) => {
    setEditBranch(b);
    setEditName(b.name);
    setEditAddress(b.address ?? "");
    setEditPhone(b.phone ?? "");
  };

  const handleUpdate = () => {
    if (!editBranch) return;
    updateMutation.mutate({ id: editBranch.id, name: editName, address: editAddress || null, phone: editPhone || null });
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5 text-primary" />
              <p className="text-xs text-primary tracking-widest uppercase">Branches</p>
            </div>
            <h1 className="text-2xl font-bold text-foreground">지점 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">총 {branches.length}개 지점</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            지점 등록
          </Button>
        </div>

        {/* 지점 목록 */}
        {branchesQuery.isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">로딩 중...</div>
        ) : branches.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-12 text-center">
            <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">등록된 지점이 없습니다.</p>
            <p className="text-muted-foreground text-xs mt-1">지점 등록 버튼을 클릭해 첫 지점을 추가하세요.</p>
          </div>
        ) : (
          <>
            {/* 모바일 카드 */}
            <div className="md:hidden space-y-3">
              {branches.map((b) => (
                <div key={b.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{b.code}</code>
                        <Badge variant={b.isActive ? "default" : "secondary"} className="text-xs">
                          {b.isActive ? "활성" : "비활성"}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{b.name}</p>
                      {b.address && <p className="text-xs text-muted-foreground mt-0.5">{b.address}</p>}
                      {b.phone && <p className="text-xs text-muted-foreground">{b.phone}</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEdit(b as Branch)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => { if (confirm(`'${b.name}' 지점을 삭제하시겠습니까?`)) deleteMutation.mutate({ id: b.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 데스크탑 테이블 */}
            <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase">지점 코드</th>
                    <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">지점명</th>
                    <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">주소</th>
                    <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">전화번호</th>
                    <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase">상태</th>
                    <th className="px-4 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {branches.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{b.code}</code>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-foreground">{b.name}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground hidden lg:table-cell">{b.address ?? "—"}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground hidden lg:table-cell">{b.phone ?? "—"}</td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: b.id, isActive: !b.isActive })}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                            b.isActive ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                          }`}
                        >
                          {b.isActive ? <><Check className="w-3 h-3" />활성</> : <><X className="w-3 h-3" />비활성</>}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(b as Branch)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => { if (confirm(`'${b.name}' 지점을 삭제하시겠습니까?`)) deleteMutation.mutate({ id: b.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 지점 등록 다이얼로그 */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>지점 등록</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>지점 코드 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="예: SINCHON (영문 대문자, 숫자, _)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                />
                <p className="text-xs text-muted-foreground">영문 대문자, 숫자, 언더스코어만 사용 가능합니다</p>
              </div>
              <div className="space-y-1.5">
                <Label>지점명 <span className="text-red-500">*</span></Label>
                <Input placeholder="예: 신촌점" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>주소 (선택)</Label>
                <Input placeholder="서울시 서대문구..." value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>전화번호 (선택)</Label>
                <Input placeholder="02-0000-0000" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 지점 수정 다이얼로그 */}
        <Dialog open={!!editBranch} onOpenChange={(open) => !open && setEditBranch(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>지점 수정 — <code className="text-sm">{editBranch?.code}</code></DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>지점명 <span className="text-red-500">*</span></Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>주소</Label>
                <Input placeholder="주소 없음" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>전화번호</Label>
                <Input placeholder="전화번호 없음" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditBranch(null)}>취소</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
