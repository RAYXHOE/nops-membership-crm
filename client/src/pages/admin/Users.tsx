import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, Search, Crown, Building2, Briefcase, User, Edit3, Check, X } from "lucide-react";
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

type Role = "user" | "branch_admin" | "staff" | "admin";

const roleConfig: Record<Role, { label: string; desc: string; color: string; icon: React.ElementType }> = {
  admin: {
    label: "슈퍼 어드민",
    desc: "전체 기능 + 권한 관리",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: Crown,
  },
  staff: {
    label: "본사 스태프",
    desc: "대시보드 + 회원/쿠폰 + 데이터 분석",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Briefcase,
  },
  branch_admin: {
    label: "지점 관리자",
    desc: "회원 관리 + 쿠폰 관리만",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: Building2,
  },
  user: {
    label: "일반 사용자",
    desc: "관리자 접근 불가",
    color: "bg-muted text-muted-foreground border-border",
    icon: User,
  },
};

// 지점 선택 드롭다운 컴포넌트 (등록된 지점 목록에서 선택)
function BranchCodeEditor({
  userId,
  currentCode,
  currentRole,
  onSave,
}: {
  userId: number;
  currentCode: string | null;
  currentRole: Role;
  onSave: () => void;
}) {
  const utils = trpc.useUtils();
  const branchCodesQuery = trpc.admin.listBranchCodes.useQuery();
  const branchCodes = (branchCodesQuery.data ?? []) as { code: string; name: string }[];

  const updateMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("지점이 저장되었습니다.");
      onSave();
    },
    onError: (e) => toast.error(e.message),
  });

  if (currentRole !== "branch_admin") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Select
      value={currentCode ?? "none"}
      onValueChange={(v) => updateMutation.mutate({ userId, role: currentRole, branchCode: v === "none" ? null : v })}
      disabled={updateMutation.isPending}
    >
      <SelectTrigger className="w-36 h-8 text-xs">
        <SelectValue placeholder="지점 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">지점 선택 안함</SelectItem>
        {branchCodes.map((b) => (
          <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

}

export default function AdminUsers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const utils = trpc.useUtils();

  const isAdmin = user?.role === "admin";

  // ─── 모든 Hook은 조기 return 이전에 위치 (React Hook 규칙) ───────────────────
  const query = trpc.admin.listUsers.useQuery(
    {
      search: search || undefined,
      role: roleFilter === "all" ? undefined : roleFilter,
      limit: 50,
      offset: 0,
    },
    { enabled: isAdmin }
  );

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("권한이 변경되었습니다.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const users = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  // ─── 조기 return (Hook 이후에 위치) ─────────────────────────────────────────
  if (user && !isAdmin) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground mb-2">접근 권한이 없습니다</p>
          <p className="text-sm text-muted-foreground">슈퍼 어드민만 이 페이지에 접근할 수 있습니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Access Control</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">권한 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            총 {total}명 · 슈퍼 어드민만 접근 가능
          </p>
        </div>

        {/* 역할 안내 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {(Object.entries(roleConfig) as [Role, typeof roleConfig[Role]][]).map(([role, cfg]) => (
            <div key={role} className={`rounded-xl border p-4 ${cfg.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <cfg.icon className="w-4 h-4" />
                <span className="text-xs font-bold">{cfg.label}</span>
              </div>
              <p className="text-xs opacity-80">{cfg.desc}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 이메일 검색"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | "all")}>
              <SelectTrigger className="w-40 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 역할</SelectItem>
                <SelectItem value="admin">슈퍼 어드민</SelectItem>
                <SelectItem value="staff">본사 스태프</SelectItem>
                <SelectItem value="branch_admin">지점 관리자</SelectItem>
                <SelectItem value="user">일반 사용자</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10 px-5">검색</Button>
          </form>
        </div>

        {/* 모바일 카드 리스트 (md 미만) */}
        <div className="md:hidden space-y-3 mb-4">
          {query.isLoading ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : users.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">사용자가 없습니다</div>
          ) : (
            users.map((u) => {
              const cfg = roleConfig[u.role as Role] ?? roleConfig.user;
              const RoleIcon = cfg.icon;
              return (
                <div key={u.id} className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-sm font-semibold">{(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{u.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? u.openId}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border shrink-0 ${cfg.color}`}>
                      <RoleIcon className="w-3 h-3" />{cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <BranchCodeEditor
                      userId={u.id}
                      currentCode={(u as typeof u & { branchCode?: string | null }).branchCode ?? null}
                      currentRole={u.role as Role}
                      onSave={() => utils.admin.listUsers.invalidate()}
                    />
                    <Select
                      value={u.role}
                      onValueChange={(newRole) => updateRoleMutation.mutate({ userId: u.id, role: newRole as Role, branchCode: (u as typeof u & { branchCode?: string | null }).branchCode })}
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">슈퍼 어드민</SelectItem>
                        <SelectItem value="staff">본사 스태프</SelectItem>
                        <SelectItem value="branch_admin">지점 관리자</SelectItem>
                        <SelectItem value="user">일반 사용자</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 데스크톱 테이블 (md 이상) */}
        <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">사용자</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">마지막 로그인</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">역할</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">지점 코드</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">역할 변경</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {query.isLoading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">사용자가 없습니다</td></tr>
                ) : (
                  users.map((u) => {
                    const cfg = roleConfig[u.role as Role] ?? roleConfig.user;
                    const RoleIcon = cfg.icon;
                    return (
                      <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-primary text-xs font-semibold">
                                {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{u.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{u.email ?? u.openId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(u.lastSignedIn).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold border ${cfg.color}`}>
                            <RoleIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <BranchCodeEditor
                            userId={u.id}
                            currentCode={(u as typeof u & { branchCode?: string | null }).branchCode ?? null}
                            currentRole={u.role as Role}
                            onSave={() => utils.admin.listUsers.invalidate()}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              updateRoleMutation.mutate({
                                userId: u.id,
                                role: newRole as Role,
                                branchCode: (u as typeof u & { branchCode?: string | null }).branchCode,
                              });
                            }}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">슈퍼 어드민</SelectItem>
                              <SelectItem value="staff">본사 스태프</SelectItem>
                              <SelectItem value="branch_admin">지점 관리자</SelectItem>
                              <SelectItem value="user">일반 사용자</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 안내 */}
        <div className="mt-6 bg-muted/30 rounded-xl p-5 space-y-3">
          <p className="font-semibold text-foreground text-sm">권한 부여 및 지점 코드 설정 방법</p>
          <div className="text-sm text-muted-foreground space-y-1.5">
            <p><span className="font-medium text-foreground">1단계</span> — 직원이 <code className="bg-muted px-1.5 py-0.5 rounded text-xs">membership.nops.kr/admin</code>에 구글 계정으로 로그인합니다.</p>
            <p><span className="font-medium text-foreground">2단계</span> — 이 화면에서 해당 계정을 검색 후 역할을 변경합니다.</p>
            <p><span className="font-medium text-foreground">3단계</span> — <strong>지점 관리자</strong>로 설정 시 지점 코드 컬럼의 ✏️ 버튼을 클릭해 코드를 입력합니다.</p>
            <p className="text-xs pt-1">지점 코드 예시: <code className="bg-muted px-1.5 py-0.5 rounded">SINCHON</code>, <code className="bg-muted px-1.5 py-0.5 rounded">GANGNAM</code>, <code className="bg-muted px-1.5 py-0.5 rounded">BRANCH_01</code></p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
