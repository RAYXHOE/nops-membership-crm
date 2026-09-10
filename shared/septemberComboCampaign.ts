/** 2026년 9월 콤보 전 메뉴 멤버십 감사 이벤트의 단일 정책 정의. */
export const SEP_COMBO_2026 = {
  code: "sep_combo_2026",
  grantKey: "sep_combo_2026_v1",
  templateName: "9월 콤보 전 메뉴 10% 할인 쿠폰",
  couponName: "9월 콤보 전 메뉴 10% 할인 쿠폰",
  discountPercent: 10,
  description: "콤보 전 메뉴(런치·디너·베네핏 신메뉴 포함) 10% 할인 · 타 할인 중복 불가",
  templateValidityDays: 33,
  expiresAt: "2026-10-11T14:59:59.000Z",
  targetDescription: "활성 회원 중 SMS 마케팅 수신 동의자",
} as const;

/** 2026-10-11 23:59:59 KST를 UTC Date로 반환한다. DB 초 단위 정밀도와 호환된다. */
export function getSepCombo2026ExpiryAt() {
  return new Date(SEP_COMBO_2026.expiresAt);
}
