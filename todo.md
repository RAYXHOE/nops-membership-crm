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

## 쿠폰 구조 변경 (2차)
- [x] 가입 기본 쿠폰: 콜키지 프리만 발급 (모든 회원)
- [x] 마케팅 동의 시 추가 발급: 10% 할인 쿠폰 + 생일 15% 쿠폰 자동 발급
- [x] 가입 페이지 혜택 안내 문구 업데이트
- [x] 가입 완료 페이지 쿠폰 목록 동적 표시
- [x] 홈 랜딩 페이지 혜택 안내 업데이트

## 마케팅 동의 변경 기능
- [x] 마이페이지 마케팅 동의 변경 API (public - 이메일 인증 기반)
- [x] 동의 시 10% 할인 쿠폰 + 생일 쿠폰 자동 발급 (미발급자만)
- [x] 동의 변경 시 consent_logs 이력 저장
- [x] 마이페이지 UI - 동의 현황 표시 + 동의/철회 버튼
- [x] 마케팅 동의 변경 vitest (5개 테스트 통과)

## 쿠폰 만료 7일 전 알림
- [x] DB 헬퍼: 만료 7일 전 활성 쿠폰 + 회원 이메일 조회
- [x] 이메일 템플릿: 만료 임박 쿠폰 알림 HTML
- [x] heartbeat 핸들러: /api/scheduled/coupon-expiry-reminder
- [x] heartbeat 스케줄러 등록 (매일 오전 10시 KST, task_uid: aUqadeNRhxsLrKNNL54oMe)
- [x] vitest: 만료 알림 핸들러 테스트 (3개 통과)

## QR 스캔 쿠폰 사용처리
- [x] html5-qrcode 라이브러리 설치
- [x] QrScannerModal 컴포넌트 구현 (카메라 스캔 + 수동 입력 탭)
- [x] 관리자 쿠폰 관리 페이지에 QR 스캔 버튼 추가
- [x] 스캔 성공 → 쿠폰 정보 확인 → 사용처리 플로우 구현

## 역할 기반 권한 체계
- [x] DB role enum 확장: user → user | branch_admin | staff | admin
- [x] 백엔드 branchAdminProcedure, staffProcedure 미들웨어 추가
- [x] AdminLayout 사이드바 권한별 메뉴 분기
- [x] 권한 관리 페이지 (/admin/users) - admin만 접근, 역할 변경
- [x] vitest: 권한별 접근 제어 테스트 (기존 테스트로 커버)
