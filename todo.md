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

## 결혼기념일 기능
- [x] members 테이블 anniversaryDate 콜럼 추가
- [x] 쿠폰 템플릿 anniversary 타입 추가 (15% 할인)
- [x] coupons 테이블 type enum에 anniversary 추가
- [x] 결혼기념일 쿠폰 자동 발급 DB 헬퍼
- [x] heartbeat 핸들러: /api/scheduled/anniversary-coupons
- [x] 결혼기념일 이메일/알림톡 템플릿
- [x] 가입 페이지 결혼기념일 입력 필드 추가 (선택)
- [x] vitest: 결혼기념일 쿠폰 발급 테스트 (기존 테스트 커버)

## 2026년 8월 Manus 데이터 분리 대응
- [x] 영향 범위 점검: 멤버십 CRM 코드·DB·도메인·스케줄러·시크릿·연동 설정
- [ ] 백업 기간 중 최신 Task Data 내보내기 및 최종 스냅샷 보관
- [x] 8월 23일~25일 SGT 서비스 중단 및 8월 25일 복구 절차 운영 계획 수립

## 회원 CSV 내보내기
- [x] 회원 관리 페이지에 2026-08-13 이후 가입 회원 CSV 내보내기 추가 (이름·이메일·전화번호·생년월일·가입일·마케팅 동의·방문 매장)

## 발송 연동 점검
- [x] SOLAPI 알림톡 템플릿 내용·환경변수·최근 발송 성공/실패 로그 점검
- [x] Resend 이메일 템플릿 코드·발송 키 제한 상태 점검
- [ ] Resend 이메일 발송 결과 영속 로그 또는 조회 근거 추가 후 최근 성공/실패 현황 점검
- [ ] SOLAPI 운영 이슈 조치: 환영 템플릿의 30일 문구 불일치, 생일·적립금 만료 템플릿 용도 불일치, 결혼기념일·콜키지 템플릿 ID 미존재
- [ ] 알림톡 테스트가 운영 DB 로그에 남지 않도록 kakao.test.ts의 DB 로깅 모킹 추가

## SOLAPI 템플릿 및 가입 데이터 품질
- [ ] SOLAPI 승인용 신규 템플릿 문구 작성 (환영·생일·결혼기념일·콜키지 재발급·적립금 만료 D-30)
- [ ] 신규 SOLAPI 템플릿 ID를 위한 환경변수·안전한 발송 매핑 코드 정비
- [ ] 가입 폼과 서버에서 이메일·전화번호·생년월일·이름 데이터 검증 강화

## 운영 상태 점검
- [ ] 고객 가입·관리자 API·자동화·발송 연동의 현재 정상화 여부 점검
- [ ] Heartbeat 자동화 404 장애 진단 및 경로·핸들러 복구
- [ ] 기존 10개 Heartbeat 작업을 현재 배포 대상으로 재연결하고 최신 실행 성공 여부 확인
- [ ] Manus Heartbeat 플랫폼 실행 중단(새 작업도 실행 0건) 지원 요청 및 복구 확인
- [ ] Heartbeat 복구 전 쿠폰 만료 D-7 알림 5건을 수동 운영 처리
