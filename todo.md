# 놉스 멤버십 CRM - TODO

## 데이터베이스 & 백엔드
- [x] DB 스키마 설계 및 마이그레이션 (members, coupons, coupon_templates, visits, purchases, consent_logs)
- [x] 회원 가입 API (멤버 생성 + 쿠폰 자동 발급)
- [x] 쿠폰 CRUD API (발급, 사용 처리, 이력 조회)
- [x] 방문 기록 / 구매 이력 CRUD API
- [x] 생일 쿠폰 자동 발급 스케줄러 (수동 트리거 + 향후 heartbeat 연동 가능)
- [x] 데이터 분석 API (통계, 세그먼트, 쿠폰 사용률)
- [x] 동의 기록 저장 및 조회 API
- [x] 관리자 권한 분리 (adminProcedure)

## 고객용 페이지
- [x] 멤버십 가입 페이지 (이름/이메일/전화번호/생년월일/동의)
- [x] 고객 마이페이지 (쿠폰 목록, QR코드, 쿠폰 코드)
- [x] 가입 완료 페이지

## 운영사 대시보드
- [x] 대시보드 레이아웃 (AdminLayout 커스텀 구현)
- [x] 전체 회원 목록 및 상세 정보 조회
- [x] 방문 기록 / 구매 이력 수동 입력 및 조회
- [x] 쿠폰 관리 (발급, 사용 처리, 이력)
- [x] 데이터 분석 페이지 (통계, 세그먼트, 쿠폰 사용률)
- [x] 동의 기록 열람

## 디자인 & UX
- [x] 전체 디자인 시스템 (Elegant & Perfect 스타일, 라이트 테마)
- [x] 폰트 및 색상 팔레트 설정 (Noto Serif KR, Playfair Display, Gold 팔레트)
- [x] 반응형 레이아웃

## 테스트
- [x] 회원 가입 + 쿠폰 자동 발급 vitest
- [x] 쿠폰 사용 처리 vitest
- [x] 권한 분리 vitest

## 브랜드 수정 & 이메일 연동
- [x] 전체 브랜드명 NOBS → NOPS Steak House 수정 (UI, 메타, DB 데이터)
- [x] 폰트 Noto Serif KR + Playfair Display → Noto Sans KR 고딕체로 전환
- [x] 이메일 발송 연동 (가입 환영 이메일 + 쿠폰 코드 포함, 생일 쿠폰 이메일 포함)
- [x] 이메일 발송 vitest 추가 (4개 테스트 통과)
