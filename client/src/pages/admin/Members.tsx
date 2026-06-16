import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Search, Users, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">활성</Badge>;
  if (status === "inactive") return <Badge variant="secondary" className="text-xs">비활성</Badge>;
  return <Badge variant="destructive" className="text-xs">탈퇴</Badge>;
}

export default function AdminMembers() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "withdrawn" | "all">("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const query = trpc.admin.listMembers.useQuery({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    limit,
    offset: page * limit,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  };

  const members = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-primary" />
            <p className="text-xs text-primary tracking-widest uppercase">Members</p>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            회원 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">총 {total.toLocaleString()}명</p>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 이메일, 전화번호 검색"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
                <SelectItem value="active">활성</SelectItem>
                <SelectItem value="inactive">비활성</SelectItem>
                <SelectItem value="withdrawn">탈퇴</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10 px-5">검색</Button>
          </form>
        </div>

        {/* 모바일 카드 리스트 (md 미만) */}
        <div className="md:hidden space-y-3 mb-4">
          {query.isLoading ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : members.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center text-muted-foreground text-sm">회원이 없습니다</div>
          ) : (
            members.map((m) => (
              <Link key={m.id} href={`/admin/members/${m.id}`}>
                <div className="bg-card rounded-2xl border border-border/50 p-4 hover:border-primary/30 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-sm font-semibold">{m.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={m.status} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">전화</span> <span className="text-foreground ml-1">{m.phone}</span></div>
                    <div><span className="text-muted-foreground">마케팅</span> <span className={`ml-1 ${m.marketingConsent ? "text-green-600" : "text-muted-foreground"}`}>{m.marketingConsent ? "동의" : "미동의"}</span></div>
                    <div><span className="text-muted-foreground">가입일</span> <span className="text-foreground ml-1">{new Date(m.joinedAt).toLocaleDateString("ko-KR")}</span></div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* 데스크톱 테이블 (md 이상) */}
        <div className="hidden md:block bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">회원</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">전화번호</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">생년월일</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">마케팅</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
                  <th className="text-left px-4 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">가입일</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {query.isLoading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">로딩 중...</td></tr>
                ) : members.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">회원이 없습니다</td></tr>
                ) : (
                  members.map((m) => (
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
                      <td className="px-4 py-4 text-sm text-muted-foreground hidden lg:table-cell">{new Date(m.birthDate).toLocaleDateString("ko-KR")}</td>
                      <td className="px-4 py-4"><span className={`text-xs ${m.marketingConsent ? "text-green-600" : "text-muted-foreground"}`}>{m.marketingConsent ? "동의" : "미동의"}</span></td>
                      <td className="px-4 py-4"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-4 text-xs text-muted-foreground hidden lg:table-cell">{new Date(m.joinedAt).toLocaleDateString("ko-KR")}</td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/members/${m.id}`}>
                          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="border-t border-border/50 px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}명
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  이전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * limit >= total}
                >
                  다음
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
