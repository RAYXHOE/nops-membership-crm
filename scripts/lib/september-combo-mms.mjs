export const SEPTEMBER_COMBO_MMS_SUBJECT = "(광고)[NOPS] 쿠폰 발급!";

export function normalizeRecipientName(value) {
  const name = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) {
    throw new Error("A non-empty recipient name is required for personalized MMS.");
  }

  return name;
}

export function renderSeptemberComboMmsText(value) {
  const name = normalizeRecipientName(value);
  const text = `[멤버쉽 특전] 스테이크하우스 NOPS
${name}님, 9월 콤보 전 메뉴 10% 할인 쿠폰이 발급되었습니다.

쿠폰 확인: https://membership.nops.kr/mypage

사용 기간: 2026.10.11까지
적용 메뉴: 콤보 전 메뉴(런치 / 디너 / 베네핏 신메뉴)
메뉴 확인: https://pf.kakao.com/_AAxjEn/114522532

문의: 02-597-4030
무료수신거부: 080-500-4233`;

  if (/#\{[^}]+}/.test(text)) {
    throw new Error("MMS body contains an unresolved variable.");
  }

  return text;
}
