import { Calendar, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type NotificationStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "delivered"
  | "failed"
  | "unknown"
  | "cancelled"
  | "blocked";

type OccasionAutomationStatusData = {
  enabled: boolean;
  channelMode: "none" | "email" | "sms" | "email_sms";
  startDate: string;
  leadDays: 30;
  counts: { channel: "email" | "sms"; status: NotificationStatus; count: number }[];
  nextStep: string;
};

const notificationStatuses: {
  status: NotificationStatus;
  label: string;
  description: string;
  className: string;
}[] = [
  { status: "pending", label: "발송 대기", description: "발송 처리 전", className: "text-muted-foreground" },
  { status: "sending", label: "처리 중", description: "처리 진행 중 · 결과 불명 (미확정)", className: "text-blue-700" },
  { status: "accepted", label: "제공사 접수", description: "제공사 접수 확인 · 수신 확인 아님", className: "text-blue-700" },
  { status: "delivered", label: "전달 확인", description: "제공사 전달 결과 확인 · 열람 확인 아님", className: "text-green-700" },
  { status: "failed", label: "발송 실패", description: "실패 결과 확인", className: "text-red-700" },
  { status: "unknown", label: "결과 불명", description: "최종 결과 확인 불가 · 실패와 구분", className: "text-amber-700" },
  { status: "cancelled", label: "발송 취소", description: "발송 작업 취소", className: "text-muted-foreground" },
  { status: "blocked", label: "발송 차단", description: "발송 조건 또는 정책상 차단", className: "text-amber-700" },
];

const channelLabels = {
  none: "알림 채널 미설정",
  email: "이메일",
  sms: "문자(LMS)",
  email_sms: "이메일 + 문자(LMS)",
};

export default function OccasionAutomationStatus() {
  const statusQuery = trpc.admin.occasionAutomationStatus.useQuery();
  const data: OccasionAutomationStatusData | undefined = statusQuery.data;

  return (
    <section aria-labelledby="occasion-automation-heading" className="mb-6 rounded-2xl border border-primary/20 bg-primary/[0.035] p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-wide">OCCASION AUTOMATION</span>
          </div>
          <h2 id="occasion-automation-heading" className="text-base font-bold text-foreground">생일·결혼기념일 D-30 자동화 현황</h2>
          <p className="mt-1 text-sm text-muted-foreground">조회 전용 · 예약 활성화와 실제 발송 설정 변경은 별도 승인된 운영 명령으로만 진행합니다.</p>
        </div>
        <span className="shrink-0 rounded-full border border-border/50 bg-card px-3 py-1 text-xs text-muted-foreground">읽기 전용</span>
      </div>

      {statusQuery.isLoading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">자동화 현황을 불러오는 중입니다.</p>
      ) : statusQuery.isError || !data ? (
        <p role="alert" className="mt-4 text-sm text-amber-700">자동화 현황을 조회하지 못했습니다. 활성화 여부와 발송 결과는 현재 확인할 수 없습니다.</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">자동화 상태</dt>
              <dd className={`mt-1 font-semibold ${data.enabled ? "text-green-700" : "text-amber-700"}`}>{data.enabled ? "활성화" : "비활성화"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">설정된 알림 채널</dt>
              <dd className="mt-1 font-semibold text-foreground">{channelLabels[data.channelMode]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">운영 시작일 (한국 시간)</dt>
              <dd className="mt-1 font-semibold text-foreground">{data.startDate || "미설정"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">발급 시점</dt>
              <dd className="mt-1 flex items-center gap-1 font-semibold text-foreground"><Calendar className="h-3.5 w-3.5" />해당일 정확히 {data.leadDays}일 전</dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(["email", "sms"] as const).map((channel) => (
              <div key={channel} className="rounded-xl border border-border/50 bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">{channel === "email" ? "이메일" : "문자(LMS)"} 알림 상태</h3>
                <dl className="space-y-2">
                  {notificationStatuses.map(({ status, label, description, className }) => {
                    const count = data.counts
                      .filter((entry) => entry.channel === channel && entry.status === status)
                      .reduce((sum, entry) => sum + entry.count, 0);
                    return (
                      <div key={status} className="flex items-start justify-between gap-3 text-xs">
                        <div>
                          <dt className={`font-medium ${className}`}>{label}</dt>
                          <dd className="mt-0.5 text-muted-foreground">{description}</dd>
                        </div>
                        <dd className={`shrink-0 font-semibold tabular-nums ${className}`}>{count.toLocaleString()}건</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border/50 bg-card p-3">
            <p className="text-xs font-semibold text-foreground">다음 운영 단계</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{data.nextStep || "별도 운영 안내가 없습니다."}</p>
          </div>
        </>
      )}

      <p className="mt-4 border-t border-primary/10 pt-3 text-xs leading-relaxed text-muted-foreground">
        날짜 등록·마케팅 수신 동의 후 해당일 정확히 30일 전에 발급하며 쿠폰은 발급일부터 365일간 유효합니다. 발급일이 지난 후 등록·동의한 회원은 다음 해 해당일의 정확히 30일 전부터 대상이 됩니다. 과거 미발급 쿠폰은 소급 발급하지 않습니다. 가입 10% 즉시 발급 혜택은 유지됩니다. 카카오톡 기념일 알림은 보류 중입니다.
      </p>
    </section>
  );
}
