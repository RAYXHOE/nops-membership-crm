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
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일 형식: YYYY-MM-DD"),
  privacyConsent: z.boolean().refine((v) => v === true, "개인정보 수집 동의는 필수입니다"),
  marketingConsent: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function Register() {
  const [, navigate] = useLocation();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);

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
            <span className="font-semibold tracking-widest text-sm uppercase">NOBS</span>
          </div>
        </div>
      </header>

      <div className="container py-16 max-w-lg">
        {/* Title */}
        <div className="text-center mb-12">
          <p className="text-primary text-xs tracking-[0.3em] uppercase mb-3">Join Us</p>
          <h1
            className="text-3xl font-bold text-foreground mb-3"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            멤버십 가입
          </h1>
          <p className="text-muted-foreground text-sm" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            가입 즉시 10% 할인 쿠폰과 콜키지 프리 쿠폰이 발급됩니다
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-card rounded-2xl border border-border/50 p-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-foreground">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                {...register("name")}
                className="h-11"
              />
              {errors.name && (
                <p className="text-destructive text-xs">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                이메일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                {...register("email")}
                className="h-11"
              />
              {errors.email && (
                <p className="text-destructive text-xs">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium text-foreground">
                전화번호 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="010-0000-0000"
                {...register("phone")}
                className="h-11"
              />
              {errors.phone && (
                <p className="text-destructive text-xs">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate" className="text-sm font-medium text-foreground">
                생년월일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="birthDate"
                type="date"
                {...register("birthDate")}
                className="h-11"
              />
              {errors.birthDate && (
                <p className="text-destructive text-xs">{errors.birthDate.message}</p>
              )}
            </div>
          </div>

          {/* Consent */}
          <div className="bg-card rounded-2xl border border-border/50 p-8 space-y-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">약관 동의</h3>

            {/* Privacy */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="privacyConsent"
                checked={privacyConsent}
                onCheckedChange={(v) => setValue("privacyConsent", v === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <label htmlFor="privacyConsent" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
                  <span className="text-destructive text-xs font-medium">[필수]</span>
                  개인정보 수집·이용 동의
                </label>
                <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="text-xs text-primary underline mt-0.5 hover:opacity-70">
                      내용 보기
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>개인정보 수집·이용 동의서</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-64 mt-4">
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
                        {PRIVACY_TEXT}
                      </pre>
                    </ScrollArea>
                    <Button onClick={() => { setValue("privacyConsent", true); setPrivacyOpen(false); }} className="mt-2">
                      동의합니다
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
              {privacyConsent && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
            </div>
            {errors.privacyConsent && (
              <p className="text-destructive text-xs ml-7">{errors.privacyConsent.message}</p>
            )}

            {/* Marketing */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="marketingConsent"
                checked={marketingConsent}
                onCheckedChange={(v) => setValue("marketingConsent", v === true)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <label htmlFor="marketingConsent" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
                  <span className="text-muted-foreground text-xs font-medium">[선택]</span>
                  마케팅 정보 수신 동의
                </label>
                <Dialog open={marketingOpen} onOpenChange={setMarketingOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="text-xs text-primary underline mt-0.5 hover:opacity-70">
                      내용 보기
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>마케팅 정보 수신 동의서</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-64 mt-4">
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
                        {MARKETING_TEXT}
                      </pre>
                    </ScrollArea>
                    <Button onClick={() => { setValue("marketingConsent", true); setMarketingOpen(false); }} className="mt-2">
                      동의합니다
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
              {marketingConsent && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-sm tracking-wider"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                가입 처리 중...
              </>
            ) : (
              "멤버십 가입 완료"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
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
