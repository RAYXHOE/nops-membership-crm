# SOLAPI 브랜드 메시지 자동 발송 요건

작성일: 2026-08-27

## 공식 확인 사항

SOLAPI 브랜드 메시지 템플릿형 발송은 수신번호(`to`), 카카오 채널 프로필 ID(`pfId` 또는 `senderKey`), 브랜드 메시지 템플릿 ID, 모든 템플릿 변수, 그리고 `kakaoOptions.bms.targeting`을 요구한다. 템플릿형 브랜드 메시지는 알림톡과 달리 본문을 직접 지정할 수 없고 템플릿에 정의된 변수만 치환해야 한다.

타게팅 값은 `I`(채널 친구), `M`(마케팅 수신 동의자), `N`(마케팅 수신 동의자 중 채널 친구 제외)이다. `M`, `N`은 카카오 측 인허가를 받은 비즈니스 채널에서만 가능하며, `I`는 브랜드 등록 없이도 사용할 수 있다.

브랜드 메시지는 광고성 메시지다. SOLAPI 안내는 마케팅 수신 동의와 080 수신거부 표시를 요구하며 발송 가능 시간을 08:00~20:50 KST로 안내한다. 브랜드 메시지는 문자 대체발송이 지원되지 않으며, 전송 결과는 SOLAPI 전송요청내역 또는 웹훅으로 확인할 수 있다.

## NOPS 적용 원칙

- `members.kakaoMarketingConsent = true`인 회원만 `M` 타게팅 후보로 취급한다. 기존 이메일·SMS 동의(`marketingConsent`)는 카카오 동의로 소급 해석하지 않는다.
- 현재 카카오톡 수신 동의자는 0명이며, 30일 재발급 대상도 0명이다. 따라서 즉시 50건 발송 대상은 없다.
- 콜키지 쿠폰 발급 작업(자정 KST)과 브랜드 메시지 발송은 분리하고, 메시지는 허용 시간인 09:00 KST에 대기열에서 처리한다.
- 실제 발송 전 SOLAPI에서 NOPS 채널의 `M` 타게팅 인허가 및 080 수신거부 설정을 확인한다.
- 요청 ID, 접수 결과, 실패 상세 코드, 웹훅 기반 수신 결과를 영속 로그로 분리해 기록한다.

## 출처

1. [SOLAPI 브랜드 메시지 템플릿형 발송 API](https://solapi.com/developers/api/kakao-bms-templates)
2. [SOLAPI 브랜드 메시지 발송 안내](https://solapi.com/blog/sedning-kakao-messages-with-solapi)
3. [카카오 비즈니스 브랜드 메시지 안내](https://business.kakao.com/info/brandmessage/)
