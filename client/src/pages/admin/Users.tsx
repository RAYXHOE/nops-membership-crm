import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, Search, Crown, Building2, Briefcase, User } from "lucide-react";
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

export default function AdminUsers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const utils = trpc.useUtils();

  // admin 전용 페이지 - 직접 URL 접근 차단
  if (user && user.role !== "admin") {
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

  const query = trpc.admin.listUsers.useQuery({
    search: search || undefined,
    role: roleFilter === "all" ? undefined : roleFilter,
    limit: 50,
    offset: 0,
  });

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

        {/* 역할 안내 */}
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

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">사용자</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">마지막 로그인</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">현재 역할</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">역할 변경</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {query.isLoading ? (
                  <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">사용자가 없습니다</td></tr>
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
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              updateRoleMutation.mutate({ userId: u.id, role: newRole as Role });
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
        <div className="mt-6 bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground mb-2">권한 부여 방법</p>
          <p>1. 권한을 부여할 직원이 <strong>membership.nops.kr</strong>에 Manus 계정으로 로그인합니다.</p>
          <p>2. 이 화면에서 해당 계정을 검색 후 역할을 변경합니다.</p>
          <p>3. 변경 즉시 적용됩니다 (재로그인 필요).</p>
        </div>
      </div>
    </AdminLayout>
  );
}
