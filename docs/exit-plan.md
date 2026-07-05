# NOPS CRM — Manus 외부 배포 계획 (Exit Plan)

이 문서는 NOPS CRM을 Manus 플랫폼 외부 서버에서 독립적으로 운영하기 위한 요소를 정리합니다.

---

## 1. 현재 DB 구성

| 항목 | 내용 |
|------|------|
| **DB 엔진** | TiDB Cloud Serverless v8.5.3 (MySQL 8.0 호환) |
| **호스트** | `gateway06.us-east-1.prod.aws.tidbcloud.com:4000` |
| **관리 주체** | Manus 플랫폼 (직접 관리 불가) |
| **외부 배포 시** | 직접 소유한 MySQL/TiDB 인스턴스로 교체 필요 |

---

## 2. 필요한 환경변수 전체 목록

외부 서버 배포 시 아래 환경변수를 모두 설정해야 합니다.

### 필수 — 직접 설정

| 환경변수 | 설명 | 대체 방법 |
|---------|------|---------|
| `DATABASE_URL` | MySQL 연결 문자열 | 직접 소유한 MySQL/TiDB 인스턴스 |
| `JWT_SECRET` | 세션 쿠키 서명 시크릿 | 임의 랜덤 64자 문자열 생성 |
| `RESEND_API_KEY` | 이메일 발송 API 키 | Resend 계정 유지 |
| `EMAIL_FROM` | 발신자 이메일 | 동일 (`NOPS Steak House <noreply@nops.kr>`) |
| `SOLAPI_API_KEY` | 카카오 알림톡 API 키 | Solapi 계정 유지 |
| `SOLAPI_API_SECRET` | Solapi API 시크릿 | 동일 |
| `SOLAPI_SENDER_PHONE` | 발신 전화번호 | 동일 |
| `SOLAPI_KAKAO_PFID` | 카카오 채널 PFID | 동일 |
| `SOLAPI_TEMPLATE_*` | 알림톡 템플릿 ID (5개) | 동일 |
| `R2_ACCOUNT_ID` | Cloudflare R2 계정 ID | 동일 |
| `R2_ACCESS_KEY_ID` | R2 Access Key | 동일 |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Key | 동일 |
| `R2_BUCKET_NAME` | R2 버킷 이름 | 동일 |
| `R2_ENDPOINT` | R2 엔드포인트 URL | 동일 |
| `BACKUP_ENCRYPTION_KEY` | DB 백업 암호화 키 | 동일 |

### Manus 전용 — 대체 필요

| 환경변수 | 현재 역할 | 외부 배포 시 대체 방법 |
|---------|---------|------------------|
| `VITE_APP_ID` | Manus OAuth 앱 ID | Google OAuth Client ID로 교체 |
| `OAUTH_SERVER_URL` | Manus OAuth 서버 URL | Google OAuth 엔드포인트로 교체 |
| `VITE_OAUTH_PORTAL_URL` | Manus 로그인 포털 | 자체 로그인 페이지로 교체 |
| `OWNER_OPEN_ID` | 오너 Manus OpenID | 자체 관리자 ID 시스템으로 교체 |
| `OWNER_NAME` | 오너 이름 | 환경변수로 직접 설정 |
| `BUILT_IN_FORGE_API_URL` | Manus 내장 API URL | 각 기능별 외부 서비스로 교체 |
| `BUILT_IN_FORGE_API_KEY` | Manus 내장 API 키 | 각 기능별 외부 서비스로 교체 |

---

## 3. Manus 전용 기능 4가지와 대체 방법

### 기능 1 — OAuth 로그인 (영향도: 높음)

**현재:** Manus OAuth → Google 계정으로 관리자 로그인  
**문제:** Manus 플랫폼 없이는 로그인 불가  
**대체 방법:**
- **옵션 A:** Google OAuth 직접 구현 (`passport-google-oauth20` npm 패키지)
- **옵션 B:** NextAuth.js 또는 Auth.js 사용
- **옵션 C:** 이메일+비밀번호 로그인으로 교체 (bcrypt + JWT)

**예상 작업량:** 2~3일

---

### 기능 2 — Heartbeat 스케줄러 (영향도: 높음)

**현재:** Manus Heartbeat → 7개 자동화 스케줄러 실행  
**문제:** Manus 플랫폼 없이는 스케줄러 실행 불가  
**대체 방법:**
- **옵션 A:** Linux crontab (서버에 직접 등록)
  ```bash
  # 매월 1일 오전 9시 KST
  0 0 1 * * node /app/scripts/birthday-coupons.mjs
  # 매일 자정 KST
  0 15 * * * node /app/scripts/corkage-reissue.mjs
  ```
- **옵션 B:** GitHub Actions scheduled workflows
- **옵션 C:** node-cron npm 패키지로 앱 내 스케줄러 구현

**예상 작업량:** 1일

---

### 기능 3 — 운영자 알림 (영향도: 중간)

**현재:** `notifyOwner()` → Manus 플랫폼 내부 알림  
**사용 위치:** `check-missing-coupons` 스케줄러에서 미발급 감지 시 알림  
**대체 방법:**
- Resend 이메일로 교체 (이미 Resend가 연동되어 있음)
- Slack webhook으로 교체
- 코드 변경 최소화: `notifyOwner()` 함수를 이메일 발송으로 재구현

**예상 작업량:** 2시간

---

### 기능 4 — 내장 S3 파일 스토리지 (영향도: 없음)

**현재:** `storagePut/Get` → Manus 내장 S3  
**사용 여부:** 현재 이 앱에서 **미사용** (파일 업로드 기능 없음)  
**대체 방법:** 불필요 (사용 시 Cloudflare R2 또는 AWS S3로 교체)

---

## 4. 외부 배포 권장 스택

| 구성 요소 | 권장 서비스 | 비용 |
|---------|-----------|------|
| **서버** | Railway, Render, Fly.io | $5~20/월 |
| **DB** | TiDB Cloud Serverless (무료 티어) 또는 PlanetScale | 무료~$10/월 |
| **파일 스토리지** | Cloudflare R2 (이미 사용 중) | 무료~소액 |
| **이메일** | Resend (이미 사용 중) | 무료~소액 |
| **알림톡** | Solapi (이미 사용 중) | 건당 과금 |

---

## 5. 외부 배포 예상 소요 시간

| 작업 | 예상 시간 |
|------|---------|
| OAuth 로그인 교체 | 2~3일 |
| Heartbeat → crontab 교체 | 1일 |
| notifyOwner → 이메일 교체 | 2시간 |
| 환경변수 설정 및 배포 | 2~4시간 |
| **총합** | **약 4~5일** |

---

*최종 업데이트: 2026-07-05*  
*작성: NOPS Steak House CRM 운영팀*
