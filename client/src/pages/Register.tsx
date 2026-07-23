import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Crown, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIVACY_TEXT = `개인정보 수집·이용 동의서

■ 수집 항목: 이름, 이메일, 전화번호, 생년월일
■ 수집 목적: 멤버십 서비스 제공, 쿠폰 발급 및 관리, 회원 식별
■ 보유 기간: 회원 탈퇴 후 5년 (관계 법령에 따름)
■ 제3자 제공: 없음

[개인정보 국외 이전 고지 (개인정보보호법 제28조의 8)]
■ 이전 항목: 이름, 이메일, 전화번호, 생년월일
■ 이전 국가: 미국 (AWS us-east-1, 버지니아 북부)
■ 수탁 업체: PingCAP, Inc. (TiDB Cloud) / Amazon Web Services, Inc.
■ 이전 목적: 멤버십 데이터베이스 운영 및 서비스 제공
■ 보유 기간: 회원 탈퇴 후 5년

위 내용에 동의하지 않으실 경우 멤버십 가입이 제한될 수 있습니다.

[개인정보보호법 제15조 및 제28조의 8에 의거하여 수집·이용 및 국외 이전에 동의합니다]`;

const MARKETING_TEXT = `마케팅 정보 수신 동의서 (선택)

■ 수신 항목: 신메뉴 안내, 이벤트 정보, 프로모션 혜택
■ 수신 방법: 이메일, SMS
■ 보유 기간: 동의 철회 시까지
■ 동의 거부 시 불이익: 마케팅 정보 수신이 제한되나, 기본 멤버십 혜택은 유지됩니다.

본 동의는 선택 사항이며 거부하셔도 멤버십 가입에 불이익이 없습니다.`;

const schema = z.object({
  name: z.string().min(1, "이름을 입력해주세요").max(100),
  email: z.string().email("올바른 이메일 형식이 아닙니다"),
  phone: z.string().min(9, "전화번호를 입력해주세요").max(20),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일 형식: YYYY-MM-DD"),
  privacyConsent: z.boolean().refine((v) => v === true, "개인정보 수집 동의는 필수입니다"),
  marketingConsent: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

// 생년월일 자동 포맷 (숫자 입력 → YYYY-MM-DD)
function formatBirthDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// Dialog를 독립 컴포넌트로 분리 → Hook 충돌 방지
function ConsentDialog({
  title,
  content,
  onAgree,
}: {
  title: string;
  content: string;
  onAgree: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="text-xs text-primary underline mt-0.5 hover:opacity-70"
        onClick={() => setOpen(true)}
      >
        내용 보기
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64 mt-4">
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
              {content}
            </pre>
          </ScrollArea>
          <Button
            onClick={() => {
              onAgree();
              setOpen(false);
            }}
            className="mt-2"
          >
            동의합니다
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 마케팅 동의 아코디언 컴포넌트
function MarketingConsentAccordion({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="marketingConsent"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center gap-1 flex-wrap">
          <label htmlFor="marketingConsent" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
            <span className="text-muted-foreground text-xs font-semibold">[선택]</span>
            마케팅 정보 수신 동의
            <span className="text-xs text-muted-foreground">(국외 이전 포함/미국 AWS 서버)</span>
          </label>
          <button
            type="button"
            className="text-xs text-primary underline hover:opacity-70 flex items-center gap-0.5"
            onClick={() => setOpen((o) => !o)}
          >
            내용 보기 {open ? "▲" : "▼"}
          </button>
        </div>
        {open && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border/50 text-xs text-muted-foreground space-y-1">
            <p><span className="font-semibold text-foreground">수집 항목:</span> 이름, 이메일, 전화번호, 생년월일</p>
            <p><span className="font-semibold text-foreground">이전 국가:</span> 미국 (AWS us-east-1, 버지니아 북부)</p>
            <p><span className="font-semibold text-foreground">수탁 업체:</span> PingCAP, Inc. (TiDB Cloud) / Amazon Web Services, Inc.</p>
            <p><span className="font-semibold text-foreground">이전 목적:</span> 멤버십 데이터베이스 운영 및 서비스 제공</p>
            <p><span className="font-semibold text-foreground">보유 기간:</span> 회원 탈퇴 후 5년</p>
            <div className="pt-1 border-t border-border/30">
              <p className="text-primary text-xs font-semibold">✓ 동의 시 혜택: 10% 할인 쿠폰 + 생일 15% 쿠폰 즉시 발급</p>
            </div>
          </div>
        )}
      </div>
      {checked && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
    </div>
  );
}

export default function Register() {
  const [, navigate] = useLocation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { privacyConsent: false, marketingConsent: false },
  });

  const privacyConsent = watch("privacyConsent");
  const marketingConsent = watch("marketingConsent");
  const [birthDisplay, setBirthDisplay] = useState("");
  const [visitedBranch, setVisitedBranch] = useState("");

  const registerMutation = trpc.membership.register.useMutation({
    onSuccess: (data) => {
      navigate(`/register/success?memberId=${data.memberId}`);
    },
    onError: (err) => {
      toast.error(err.message || "가입 중 오류가 발생했습니다.");
    },
  });

  const branchesQuery = trpc.admin.listBranchCodes.useQuery();

  const onSubmit = (values: FormValues) => {
    registerMutation.mutate({
      ...values,
      visitedBranch: visitedBranch || undefined,
      ipAddress: undefined,
      userAgent: navigator.userAgent,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm">
        <div className="container flex items-center h-16">
          <Link href="/">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              돌아가기
            </button>
          </Link>
          <div className="flex items-center gap-2 mx-auto">
            <Crown className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-widest text-sm uppercase">NOPS</span>
            <span className="text-muted-foreground text-xs hidden sm:inline">Steak House</span>
          </div>
        </div>
      </header>

      <div className="container py-16 max-w-lg">
        <div className="text-center mb-12">
          <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3 font-semibold">Join Us</p>
          <h1 className="text-3xl font-extrabold text-foreground mb-3">멤버십 가입</h1>
          <p className="text-muted-foreground text-sm">
            가입 즉시 사용 가능한 <span className="font-semibold text-foreground">"콜키지 프리" 쿠폰</span>과<br />
            마케팅 동의 시 <span className="font-semibold text-foreground">"10% 할인 쿠폰 · 생일 15% 할인 쿠폰"</span>이 발급됩니다.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-card rounded-2xl border border-border/50 p-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="홍길동" {...register("name")} className="h-11" />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input id="email" type="email" placeholder="example@email.com" {...register("email")} className="h-11" />
              {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold text-foreground">
                전화번호 <span className="text-destructive">*</span>
              </Label>
              <Input id="phone" type="tel" placeholder="010-0000-0000" {...register("phone")} className="h-11" />
              {errors.phone && <p className="text-destructive text-xs">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate" className="text-sm font-semibold text-foreground">
                생년월일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthDate"
                type="text"
                inputMode="numeric"
                placeholder="예: 19901231"
                value={birthDisplay}
                onChange={(e) => {
                  const formatted = formatBirthDate(e.target.value);
                  setBirthDisplay(formatted);
                  if (formatted.length === 10) {
                    setValue("birthDate", formatted, { shouldValidate: true });
                  } else {
                    setValue("birthDate", "", { shouldValidate: false });
                  }
                }}
                maxLength={10}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">숫자 8자리 입력 시 자동 포맷 (예: 19901231 → 1990-12-31)</p>
              {errors.birthDate && <p className="text-destructive text-xs">{errors.birthDate.message}</p>}
            </div>

            {/* 방문 매장 선택 (선택) */}
            <div className="space-y-2">
              <Label htmlFor="visitedBranch" className="text-sm font-semibold text-foreground">
                방문하신 혹은 방문 예정이신 놉스 매장
                <span className="ml-1 text-xs text-muted-foreground font-normal">(선택)</span>
              </Label>
              {branchesQuery.data && branchesQuery.data.length > 0 ? (
                <Select value={visitedBranch} onValueChange={setVisitedBranch}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="매장을 선택해 주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {branchesQuery.data.map((b) => (
                      <SelectItem key={b.code} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="visitedBranch"
                  type="text"
                  placeholder="예: 강남점, 신촌점 등"
                  value={visitedBranch}
                  onChange={(e) => setVisitedBranch(e.target.value)}
                  className="h-11"
                />
              )}
              <p className="text-xs text-muted-foreground">방문 경험 또는 방문 예정 매장을 선택해 주세요.</p>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 p-8 space-y-4">
            <h3 className="text-sm font-bold text-foreground mb-4">약관 동의</h3>

            {/* 개인정보 동의 */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="privacyConsent"
                checked={privacyConsent}
                onCheckedChange={(v) => setValue("privacyConsent", v === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <label htmlFor="privacyConsent" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
                  <span className="text-destructive text-xs font-semibold">[필수]</span>
                  개인정보 수집·이용 동의
                </label>
                <ConsentDialog
                  title="개인정보 수집·이용 동의서"
                  content={PRIVACY_TEXT}
                  onAgree={() => setValue("privacyConsent", true)}
                />
              </div>
              {privacyConsent && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
            </div>
            {errors.privacyConsent && (
              <p className="text-destructive text-xs ml-7">{errors.privacyConsent.message}</p>
            )}

            {/* 마케팅 동의 - 아코디언 방식 */}
            <MarketingConsentAccordion
              checked={marketingConsent}
              onCheckedChange={(v) => setValue("marketingConsent", v)}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-sm tracking-wider font-semibold"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />가입 처리 중...</>
            ) : (
              "멤버십 가입 완료 →"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            이미 회원이신가요?{" "}
            <Link href="/mypage">
              <span className="text-primary underline cursor-pointer">마이페이지 바로가기</span>
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
