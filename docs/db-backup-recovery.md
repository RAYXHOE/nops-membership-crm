# NOPS Steak House CRM — DB 백업 및 복구 절차

> **중요:** 이 문서는 절차만 포함합니다. 백업 데이터 자체, 비밀번호, API 키는 포함되지 않습니다.

---

## 1. DB 구성 현황

| 항목 | 내용 |
|------|------|
| **DB 엔진** | TiDB Cloud Serverless v8.5.3 (MySQL 8.0 호환) |
| **호스팅** | Manus 플랫폼 내부 프로비저닝 |
| **접속 방법** | `DATABASE_URL` 환경변수 (Manus 자동 주입) |
| **외부 직접 접속** | 불가 (Manus 플랫폼 내부 네트워크 전용) |
| **테이블 수** | 13개 |
| **주요 데이터** | 회원(members), 쿠폰(coupons), 동의기록(consent_logs), 적립금(points), 방문/구매 이력 |

---

## 2. 백업 정책

### 백업 방식: 수동 백업 (Manus Management UI)

| 항목 | 내용 |
|------|------|
| **방식** | Manus 대시보드 → Database 탭 → Export |
| **주기** | 최소 **주 1회** 권장, 중요 데이터 변경 후 즉시 |
| **보관 기간** | 최소 **30일치** 보관 |
| **저장 위치** | 로컬 암호화 드라이브 또는 암호화된 클라우드 스토리지 |
| **파일 형식** | SQL 덤프 파일 (`.sql`) |

### 백업 파일 명명 규칙

```
nops-crm-backup-YYYY-MM-DD.sql
예: nops-crm-backup-2026-07-05.sql
```

### 암호화 방법 (백업 파일 보관 전 필수)

```bash
# macOS/Linux: openssl로 AES-256 암호화
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in nops-crm-backup-2026-07-05.sql \
  -out nops-crm-backup-2026-07-05.sql.enc

# 복호화 시
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in nops-crm-backup-2026-07-05.sql.enc \
  -out nops-crm-backup-2026-07-05.sql
```

> 암호화 비밀번호는 백업 파일과 **별도로** 안전한 비밀번호 관리자(1Password, Bitwarden 등)에 보관할 것.

---

## 3. 백업 실행 절차 (수동)

### Step 1 — Manus 대시보드 접속

1. [manus.im](https://manus.im) 로그인
2. 좌측 사이드바에서 **nobs-membership-crm** 프로젝트 선택
3. 우측 Management UI 패널에서 **Database** 탭 클릭

### Step 2 — Export 실행

1. Database 탭 하단 좌측 **Settings(⚙)** 아이콘 클릭
2. **Export** 또는 **Download** 버튼 클릭
3. SQL 형식 선택 후 다운로드

### Step 3 — 백업 파일 보관

1. 다운로드된 파일을 위 명명 규칙에 따라 이름 변경
2. `openssl` 명령으로 암호화
3. 암호화된 파일을 안전한 저장소에 업로드
4. 30일 초과 파일 삭제

---

## 4. 복구 절차

> 복구는 **데이터 손실 발생 시** 또는 **Manus 지원팀 요청 시**에만 실행합니다.  
> 복구 전 반드시 현재 DB 상태를 먼저 백업할 것.

### Step 1 — 백업 파일 복호화

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in nops-crm-backup-YYYY-MM-DD.sql.enc \
  -out nops-crm-backup-YYYY-MM-DD.sql
```

### Step 2 — 복구 대상 확인

복구 전 다음 사항을 확인합니다:

- [ ] 복구할 백업 파일의 날짜 및 내용 확인
- [ ] 현재 DB에 보존해야 할 신규 데이터 여부 확인
- [ ] 전체 복구 vs 특정 테이블만 복구 여부 결정

### Step 3 — 복구 실행 방법

**방법 A: Manus Management UI Import 기능 사용 (권장)**

1. Manus 대시보드 → Database 탭
2. **Import** 버튼 클릭
3. 복호화된 `.sql` 파일 업로드
4. 실행 확인

**방법 B: Manus 지원팀 요청**

Manus 플랫폼 내부 DB이므로 대규모 복구 시 Manus 지원팀에 요청:
- [help.manus.im](https://help.manus.im) 에서 티켓 제출
- 백업 파일과 복구 대상 날짜 명시

**방법 C: 특정 테이블만 부분 복구**

SQL 파일에서 해당 테이블 INSERT 구문만 추출하여 Manus DB 탭에서 직접 실행:

```sql
-- 예: members 테이블만 복구
-- 1. 기존 데이터 삭제 (주의: 되돌릴 수 없음)
DELETE FROM members WHERE id IN (...);

-- 2. 백업 파일에서 추출한 INSERT 구문 실행
INSERT INTO members (...) VALUES (...);
```

---

## 5. 복구 후 검증 체크리스트

복구 완료 후 다음 항목을 반드시 확인합니다:

- [ ] 회원 수가 예상과 일치하는지 확인 (`SELECT COUNT(*) FROM members`)
- [ ] 최근 가입 회원이 정상적으로 존재하는지 확인
- [ ] 쿠폰 데이터 정합성 확인 (발급/사용 상태)
- [ ] 적립금 잔액이 정상인지 확인
- [ ] 서비스 정상 작동 확인 (membership.nops.kr 접속 테스트)
- [ ] 알림톡/이메일 발송 테스트

---

## 6. 백업 이력 관리

백업 실행 시 아래 표에 기록합니다. (이 문서에 직접 편집하거나 별도 스프레드시트로 관리)

| 날짜 | 백업 파일명 | 실행자 | 저장 위치 | 비고 |
|------|-----------|--------|---------|------|
| 2026-07-05 | nops-crm-backup-2026-07-05.sql.enc | RAY Choi | - | 초기 백업 |

---

## 7. 비상 연락처

| 상황 | 연락처 |
|------|--------|
| Manus 플랫폼 장애 | [help.manus.im](https://help.manus.im) |
| DB 복구 지원 요청 | Manus 지원팀 티켓 |

---

*최종 업데이트: 2026-07-05*  
*작성: NOPS Steak House CRM 운영팀*
