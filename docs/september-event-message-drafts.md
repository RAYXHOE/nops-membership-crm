# 9월 감사 이벤트 링크·쿠폰 안내 문구 초안

작성일: 2026-08-29

## 사용 전 확정할 값

현재 이벤트 전용 랜딩 페이지와 캠페인 쿠폰은 구현되지 않았다. 따라서 아래 링크 중 `/event/sep-thanks-2026`은 **구현 전 임시 경로**이며, 발송 전에 실제로 열리고 OTP 인증·쿠폰 1회 발급 조건을 처리하는지 검증해야 한다.

| 값 | 초안 | 발송 전 확정 필요 |
|---|---|---|
| 캠페인 ID | `sep_thanks_2026` | 예 |
| 이벤트 혜택 | `9월 감사 [10%] 할인 쿠폰` | 예: 10% 또는 9.9% |
| 이벤트 종료일 | `[YYYY년 MM월 DD일]` | 예 |
| 쿠폰 만료일 | `[YYYY년 MM월 DD일]` 또는 발급일+365일 | 예 |
| 문의처 | `[NOPS 고객센터 전화번호]` | 예 |
| SMS 수신거부 | `080-500-4233` | 공용 번호 사용 시 |

## 링크 구조

카카오와 SMS 링크는 하나의 이벤트 페이지로 연결하되, 유입 채널은 UTM으로 분리한다. 고객은 링크에서 전화번호 또는 이메일 OTP로 본인 인증한 후에만 회원 상태와 쿠폰 자격을 확인한다.

| 채널 | 초안 링크 |
|---|---|
| 카카오 채널 브랜드 메시지 | `https://membership.nops.kr/event/sep-thanks-2026?utm_source=kakao&utm_medium=brand_message&utm_campaign=sep_thanks_2026` |
| CRM SMS/LMS | `https://membership.nops.kr/event/sep-thanks-2026?utm_source=sms&utm_medium=lms&utm_campaign=sep_thanks_2026` |

## 카카오 채널 브랜드 메시지 초안

### A안: 간결한 링크 유입형

> [NOPS] 9월 감사 이벤트
>
> NOPS를 찾아주신 고객님께 9월 감사 혜택을 준비했습니다.
> 이벤트 참여 및 혜택 확인: https://membership.nops.kr/event/sep-thanks-2026?utm_source=kakao&utm_medium=brand_message&utm_campaign=sep_thanks_2026
>
> 기간: [YYYY.MM.DD]까지

**버튼:** `9월 감사 혜택 확인`

### B안: 기존 멤버십 혜택 연결형

> [NOPS] 고객 감사 이벤트
>
> 멤버십 회원을 위한 9월 한정 감사 혜택을 확인해 보세요.
> 본인 인증 후 참여 조건과 발급 가능한 쿠폰을 바로 확인할 수 있습니다.
>
> [이벤트 참여하기]

**버튼 URL:** `https://membership.nops.kr/event/sep-thanks-2026?utm_source=kakao&utm_medium=brand_message&utm_campaign=sep_thanks_2026`

카카오 채널 메시지에는 고객 개인 쿠폰 코드·이름·회원 여부를 넣지 않는다. 채널 전체 발송 뒤 링크에서 인증한 고객만 CRM의 혜택 조건을 판정한다. 실제 발송은 등록된 브랜드 메시지 템플릿의 변수·버튼 형식과 일치해야 한다.

## CRM SMS/LMS 초안

### A안: 기존 회원의 이벤트 참여 유도

> (광고)[NOPS]
> [고객명]님, 9월 감사 이벤트 혜택을 확인해 보세요.
> 본인 인증 후 참여 조건에 맞는 쿠폰을 1회 발급받을 수 있습니다.
> 참여하기: https://membership.nops.kr/event/sep-thanks-2026?utm_source=sms&utm_medium=lms&utm_campaign=sep_thanks_2026
> 기간: [YYYY.MM.DD]까지
> 문의: [NOPS 고객센터 전화번호]
> 무료수신거부 080-500-4233

### B안: 이미 쿠폰 발급이 완료된 고객 안내

> (광고)[NOPS]
> [고객명]님, 9월 감사 [할인율]% 할인 쿠폰이 발급되었습니다.
> 쿠폰 코드: [개인 쿠폰 코드]
> 유효기간: [YYYY.MM.DD]까지
> 쿠폰 확인: https://membership.nops.kr/mypage?utm_source=sms&utm_medium=lms&utm_campaign=sep_thanks_2026
> 문의: [NOPS 고객센터 전화번호]
> 무료수신거부 080-500-4233

## 발송 전 검수 기준

| 항목 | 카카오 채널 | CRM SMS/LMS |
|---|---:|---:|
| 실제로 열리는 링크 확인 | 필수 | 필수 |
| 이벤트 조건·할인율·만료일 확정 | 필수 | 필수 |
| 캠페인 쿠폰 1회 발급 키 적용 | 링크 인증 이후 | 발송 전 또는 인증 이후 |
| 대상 동의·차단 목록 검증 | 채널 친구 `I` 타게팅 | `marketingConsent = true` + SOLAPI 수신거부 제외 |
| 광고성 표기·문의처·080 | 등록 템플릿·SOLAPI 가이드 확인 | 본문 직접 포함 |
| 발송 시간 08:00~20:50 KST | 필수 | 필수 |
| 발송 전 관리자 최종 승인 | 필수 | 필수 |

## 금지 사항

10% 가입 기념 쿠폰을 재발급하는 문구로 쓰면 안 된다. 이벤트는 별도 캠페인 쿠폰으로 운영하고, 기존 가입 혜택과 다른 `grantKey`를 사용해야 한다. 이벤트 페이지·쿠폰 발급 로직·발송 이력이 구현되기 전에는 이 문구와 링크를 실제 발송에 사용하지 않는다.
