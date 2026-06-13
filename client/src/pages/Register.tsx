import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Crown, ArrowLeft, Loader2, CheckCircle2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRIVACY_TEXT = `개인정보 수집·이용 동의서

■ 수집 항목: 이름, 이메일, 전화번호, 생년월일
■ 수집 목적: 멤버십 서비스 제공, 쿠폰 발급 및 관리, 회원 식별
■ 보유 기간: 회원 탈퇴 후 5년 (관계 법령에 따름)
■ 제3자 제공: 없음

위 내용에 동의하지 않으실 경우 멤버십 가입이 제한될 수 있습니다.

[개인정보보호법 제15조에 의거하여 수집·이용합니다]`;

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
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일을 입력해주세요"),
  anniversaryDate: z.string().optional(), // 결혼기념일 (선택)
  privacyConsent: z.boolean().refine((v) => v === true, "개인정보 수집 동의는 필수입니다"),
  marketingConsent: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

// 전화번호 자동 하이픈 포맷
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.startsWith("02")) {
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// 생년월일 자동 포맷 (YYYYMMDD → YYYY-MM-DD)
function formatBirthDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function Register() {
  const [, navigate] = useLocation();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [birthDisplay, setBirthDisplay] = useState("");
  const [anniversaryDisplay, setAnniversaryDisplay] = useState("");

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

  const registerMutation = trpc.membership.register.useMutation({
    onSuccess: (data) => {
      navigate(`/register/success?memberId=${data.memberId}`);
    },
    onError: (err) => {
      toast.error(err.message || "가입 중 오류가 발생했습니다.");
    },
  });

  const onSubmit = (values: FormValues) => {
    registerMutation.mutate({
      ...values,
      ipAddress: undefined,
      userAgent: navigator.userAgent,
    });
  };

  // 전체 동의 처리
  const allChecked = privacyConsent && marketingConsent;
  const handleAllConsent = () => {
    const newVal = !allChecked;
    setValue("privacyConsent", newVal);
    setValue("marketingConsent", newVal);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      <div className="container py-12 max-w-lg">
        {/* Title */}
        <div className="text-center mb-10">
          <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3 font-semibold">Join Us</p>
          <h1 className="text-3xl font-extrabold text-foreground mb-3">멤버십 가입</h1>
          <p className="text-muted-foreground text-sm">
            가입 즉시 <span className="text-primary font-semibold">콜키지 프리 쿠폰</span>이 발급됩니다. 마케팅 동의 시 <span className="text-primary font-semibold">10% 할인 + 생일 쿠폰</span> 추가 증정
          </p>
        </div>

        {/* 혜택 요약 배너 */}
        <div className="space-y-3 mb-8">
          {/* 기본 혜택 */}
          <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm">
              <p className="font-bold text-foreground mb-0.5">기본 가입 혜택 (모든 회원)</p>
              <p className="text-muted-foreground text-xs">콜키지 프리 쿠폰 즉시 발급</p>
            </div>
          </div>
          {/* 마케팅 동의 추가 혜택 */}
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-bold text-foreground">마케팅 동의 시 추가 혜택</p>
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">+2가지</span>
              </div>
              <p className="text-muted-foreground text-xs">10% 할인 쿠폰 + 생일 15% 할인 쿠폰 즉시 발급</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-card rounded-2xl border border-border/50 p-6 space-y-5">
            {/* 이름 */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                {...register("name")}
                className="h-12 text-base"
                autoComplete="name"
              />
              {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
            </div>

            {/* 이메일 */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                {...register("email")}
                className="h-12 text-base"
                autoComplete="email"
                inputMode="email"
              />
              {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
            </div>

            {/* 전화번호 - 자동 하이픈 */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-semibold text-foreground">
                전화번호 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="010-0000-0000"
                value={phoneDisplay}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  setPhoneDisplay(formatted);
                  setValue("phone", formatted, { shouldValidate: true });
                }}
                className="h-12 text-base"
                autoComplete="tel"
                inputMode="tel"
              />
              {errors.phone && <p className="text-destructive text-xs">{errors.phone.message}</p>}
            </div>

            {/* 생년월일 - 숫자 입력 자동 포맷 */}
            <div className="space-y-1.5">
              <Label htmlFor="birthDate" className="text-sm font-semibold text-foreground">
                생년월일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthDate"
                type="text"
                placeholder="19900101 또는 1990-01-01"
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
                className="h-12 text-base"
                inputMode="numeric"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">숫자만 입력하면 자동으로 형식이 맞춰집니다 (예: 19900115)</p>
              {errors.birthDate && <p className="text-destructive text-xs">{errors.birthDate.message}</p>}
            </div>

            {/* 결혼기념일 (선택) */}
            <div className="space-y-1.5">
              <Label htmlFor="anniversaryDate" className="text-sm font-semibold text-foreground">
                결혼기념일 <span className="text-muted-foreground text-xs font-normal">(선택 · 입력 시 기념일 15% 쿠폰 자동 발급)</span>
              </Label>
              <Input
                id="anniversaryDate"
                type="text"
                placeholder="예: 20150520 또는 2015-05-20"
                value={anniversaryDisplay}
                onChange={(e) => {
                  const formatted = formatBirthDate(e.target.value);
                  setAnniversaryDisplay(formatted);
                  if (formatted.length === 10) {
                    setValue("anniversaryDate", formatted, { shouldValidate: false });
                  } else {
                    setValue("anniversaryDate", undefined);
                  }
                }}
                className="h-12 text-base"
                inputMode="numeric"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">결혼기념일을 입력하시면 매년 기념일에 15% 할인 쿠폰이 자동 발급됩니다</p>
            </div>
          </div>

          {/* 약관 동의 */}
          <div className="bg-card rounded-2xl border border-border/50 p-6 space-y-4">
            <h3 className="text-sm font-bold text-foreground">약관 동의</h3>

            {/* 전체 동의 */}
            <div
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                allChecked ? "bg-primary/10 border border-primary/30" : "bg-muted/50 border border-border"
              }`}
              onClick={handleAllConsent}
            >
              <Checkbox
                checked={allChecked}
                onCheckedChange={handleAllConsent}
                className="pointer-events-none"
              />
              <span className="text-sm font-bold text-foreground">전체 동의</span>
              {allChecked && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
            </div>

            <div className="border-t border-border/50 pt-3 space-y-3">
              {/* 개인정보 */}
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
                  <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
                    <DialogTrigger asChild>
                      <button type="button" className="text-xs text-primary underline mt-0.5 hover:opacity-70">내용 보기</button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>개인정보 수집·이용 동의서</DialogTitle></DialogHeader>
                      <ScrollArea className="h-64 mt-4">
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">{PRIVACY_TEXT}</pre>
                      </ScrollArea>
                      <Button onClick={() => { setValue("privacyConsent", true); setPrivacyOpen(false); }} className="mt-2">동의합니다</Button>
                    </DialogContent>
                  </Dialog>
                </div>
                {privacyConsent && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
              </div>
              {errors.privacyConsent && <p className="text-destructive text-xs ml-7">{errors.privacyConsent.message}</p>}

              {/* 마케팅 */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="marketingConsent"
                  checked={marketingConsent}
                  onCheckedChange={(v) => setValue("marketingConsent", v === true)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="marketingConsent" className="text-sm text-foreground cursor-pointer flex items-center gap-1 flex-wrap">
                    <span className="text-muted-foreground text-xs font-semibold">[선택]</span>
                    마케팅 정보 수신 동의
                    <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full border border-primary/20 ml-1">+10% 할인 쿠폰 · 생일 쿠폰</span>
                  </label>
                  <Dialog open={marketingOpen} onOpenChange={setMarketingOpen}>
                    <DialogTrigger asChild>
                      <button type="button" className="text-xs text-primary underline mt-0.5 hover:opacity-70">내용 보기</button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>마케팅 정보 수신 동의서</DialogTitle></DialogHeader>
                      <ScrollArea className="h-64 mt-4">
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">{MARKETING_TEXT}</pre>
                      </ScrollArea>
                      <Button onClick={() => { setValue("marketingConsent", true); setMarketingOpen(false); }} className="mt-2">동의합니다</Button>
                    </DialogContent>
                  </Dialog>
                </div>
                {marketingConsent && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-13 text-base tracking-wider font-bold py-4"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />가입 처리 중...</>
            ) : "멤버십 가입 완료 →"}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-4">
            이미 회원이신가요?{" "}
            <Link href="/mypage"><span className="text-primary underline cursor-pointer font-medium">내 쿠폰 확인하기</span></Link>
          </p>
        </form>
      </div>
    </div>
  );
}
