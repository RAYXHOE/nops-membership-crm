import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Keyboard, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CouponInfo {
  id: number;
  code: string;
  name: string;
  type: string;
  discountPercent: number | null;
  status: string;
  expiresAt: Date;
  memberName?: string | null;
  memberEmail?: string | null;
}

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SCANNER_ID = "nops-qr-scanner";

export default function QrScannerModal({ open, onClose, onSuccess }: QrScannerModalProps) {
  const [tab, setTab] = useState<"scan" | "manual">("scan");
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const utils = trpc.useUtils();

  // 쿠폰 코드로 정보 조회
  const lookupQuery = trpc.admin.listCoupons.useQuery(
    { limit: 1, offset: 0 },
    { enabled: false }
  );

  const useCouponMutation = trpc.admin.useCoupon.useMutation({
    onSuccess: () => {
      utils.admin.listCoupons.invalidate();
      toast.success("쿠폰이 사용 처리되었습니다! ✅");
      onSuccess();
      handleClose();
    },
    onError: (e) => toast.error(e.message),
  });

  // 쿠폰 코드 직접 조회 (getCouponByCode API 활용)

  // 카메라 스캔 시작
  const startScanner = async () => {
    setCameraError(null);
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      setScanning(true);

      await scanner.start(
        { facingMode: "environment" }, // 후면 카메라
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // QR 스캔 성공
          handleCodeDetected(decodedText);
        },
        () => {
          // 스캔 중 (오류 아님)
        }
      );
    } catch (err) {
      setScanning(false);
      const errMsg = String(err);
      if (errMsg.includes("permission") || errMsg.includes("NotAllowed")) {
        setCameraError("카메라 접근 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해 주세요.");
      } else if (errMsg.includes("NotFound") || errMsg.includes("device")) {
        setCameraError("카메라를 찾을 수 없습니다. 수동 입력 탭을 이용해 주세요.");
      } else {
        setCameraError("카메라를 시작할 수 없습니다. 수동 입력 탭을 이용해 주세요.");
      }
    }
  };

  // 카메라 중지
  const stopScanner = async () => {
    if (scannerRef.current && scanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // 이미 중지된 경우 무시
      }
      scannerRef.current = null;
      setScanning(false);
    }
  };

  // QR 코드 감지 처리
  const handleCodeDetected = async (code: string) => {
    await stopScanner();

    // QR 코드에서 쿠폰 코드 추출
    // 마이페이지 QR은 쿠폰 코드 자체를 인코딩함
    const couponCode = code.trim().toUpperCase();
    setScannedCode(couponCode);
    await lookupCoupon(couponCode);
  };

  // 쿠폰 정보 조회 - getCouponByCode API 직접 호출
  const lookupCoupon = async (code: string) => {
    setLookupError(null);
    setCouponInfo(null);

    try {
      const data = await utils.admin.getCouponByCode.fetch({ code: code.trim().toUpperCase() });
      setCouponInfo({
        id: data.id,
        code: data.code,
        name: data.name,
        type: data.type,
        discountPercent: data.discountPercent,
        status: data.status,
        expiresAt: data.expiresAt,
        memberName: data.memberName,
        memberEmail: data.memberEmail,
      });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "쿠폰을 찾을 수 없습니다.";
      setLookupError(msg);
    }
  };

  // 수동 입력 조회
  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    setScannedCode(manualCode.trim().toUpperCase());
    await lookupCoupon(manualCode.trim().toUpperCase());
  };

  // 사용처리 확정
  const handleConfirmUse = () => {
    if (!couponInfo) return;
    useCouponMutation.mutate({ couponId: couponInfo.id });
  };

  // 초기화
  const handleReset = () => {
    setScannedCode(null);
    setCouponInfo(null);
    setLookupError(null);
    setManualCode("");
    if (tab === "scan") startScanner();
  };

  // 닫기
  const handleClose = async () => {
    await stopScanner();
    setScannedCode(null);
    setCouponInfo(null);
    setLookupError(null);
    setManualCode("");
    onClose();
  };

  // 탭 변경 시 스캐너 제어
  useEffect(() => {
    if (!open) return;
    if (tab === "scan" && !scannedCode) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [tab, open]);

  // 모달 열릴 때 스캐너 시작
  useEffect(() => {
    if (open && tab === "scan" && !scannedCode) {
      setTimeout(() => startScanner(), 300);
    }
    if (!open) {
      stopScanner();
    }
  }, [open]);

  const typeLabel = (type: string) => {
    if (type === "discount_percent") return "할인 쿠폰";
    if (type === "corkage_free") return "콜키지 프리";
    return "생일 쿠폰";
  };

  const statusColor = (status: string) => {
    if (status === "active") return "text-green-600";
    if (status === "used") return "text-muted-foreground";
    return "text-destructive";
  };

  const statusLabel = (status: string) => {
    if (status === "active") return "사용 가능";
    if (status === "used") return "이미 사용된 쿠폰";
    return "만료된 쿠폰";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            쿠폰 스캔 / 사용처리
          </DialogTitle>
        </DialogHeader>

        {/* 쿠폰 정보 확인 화면 */}
        {(couponInfo || lookupError) && scannedCode ? (
          <div className="space-y-4 py-2">
            {/* 스캔된 코드 */}
            <div className="bg-muted rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">스캔된 코드</p>
              <code className="text-base font-mono font-bold tracking-widest text-foreground">
                {scannedCode}
              </code>
            </div>

            {/* 오류 */}
            {lookupError && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                <XCircle className="w-5 h-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive font-medium">{lookupError}</p>
              </div>
            )}

            {/* 쿠폰 정보 */}
            {couponInfo && (
              <div className={`rounded-xl border p-4 space-y-3 ${
                couponInfo.status === "active"
                  ? "bg-green-50 border-green-200"
                  : "bg-muted/50 border-border"
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-foreground text-base">{couponInfo.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(couponInfo.type)}</p>
                  </div>
                  {couponInfo.discountPercent && (
                    <span className="text-xl font-extrabold text-primary">{couponInfo.discountPercent}%</span>
                  )}
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">회원</span>
                    <span className="font-medium">{couponInfo.memberName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">상태</span>
                    <span className={`font-bold ${statusColor(couponInfo.status)}`}>
                      {couponInfo.status === "active" ? "✓ " : "✗ "}{statusLabel(couponInfo.status)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">유효기간</span>
                    <span className="font-medium">
                      {new Date(couponInfo.expiresAt).toLocaleDateString("ko-KR")}까지
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                다시 스캔
              </Button>
              {couponInfo?.status === "active" && (
                <Button
                  className="flex-1 gap-1.5"
                  onClick={handleConfirmUse}
                  disabled={useCouponMutation.isPending}
                >
                  {useCouponMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  사용처리 확정
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* 스캔 / 수동 입력 탭 */
          <Tabs value={tab} onValueChange={(v) => setTab(v as "scan" | "manual")}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="scan" className="flex-1 gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                카메라 스캔
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 gap-1.5">
                <Keyboard className="w-3.5 h-3.5" />
                코드 직접 입력
              </TabsTrigger>
            </TabsList>

            {/* 카메라 스캔 탭 */}
            <TabsContent value="scan" className="space-y-3">
              {cameraError ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertCircle className="w-10 h-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">{cameraError}</p>
                  <Button variant="outline" size="sm" onClick={() => { setCameraError(null); startScanner(); }}>
                    다시 시도
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    id={SCANNER_ID}
                    className="w-full rounded-xl overflow-hidden bg-black"
                    style={{ minHeight: "260px" }}
                  />
                  {scanning && (
                    <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      QR코드를 카메라에 비춰주세요
                    </p>
                  )}
                </>
              )}
            </TabsContent>

            {/* 수동 입력 탭 */}
            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">쿠폰 코드 입력</Label>
                <Input
                  placeholder="예: NOPS-ABCD1234"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                  className="h-12 text-base font-mono tracking-wider text-center"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">고객 마이페이지의 쿠폰 코드를 입력하세요</p>
              </div>
              <Button
                className="w-full h-11"
                onClick={handleManualLookup}
                disabled={!manualCode.trim()}
              >
                쿠폰 조회
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
