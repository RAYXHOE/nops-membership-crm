# NOPS CRM DB 복원 절차 (비전공자 기준)

> 이 문서는 백업 파일로 데이터베이스를 복원하는 방법을 단계별로 설명합니다.  
> 복원은 데이터 손실 발생 시에만 실행하며, 반드시 Manus 지원팀과 함께 진행하는 것을 권장합니다.

---

## 복원 전 반드시 확인할 것

- [ ] 복원할 백업 파일의 날짜를 확인했는가?
- [ ] 현재 DB에 보존해야 할 최신 데이터가 있는가? (있다면 먼저 현재 DB 백업)
- [ ] 암호화 키(`BACKUP_ENCRYPTION_KEY`)를 안전한 곳에서 꺼낼 수 있는가?

---

## 필요한 준비물

| 항목 | 설명 |
|------|------|
| **암호화 키** | `BACKUP_ENCRYPTION_KEY` 값 (64자리 hex 문자열) |
| **R2 접속 정보** | Cloudflare R2 버킷 접속 정보 |
| **복원 대상 날짜** | 어느 날짜 백업으로 복원할지 |

---

## 1단계 — 백업 파일 다운로드

**Cloudflare R2 대시보드에서:**

1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인
2. 좌측 메뉴 **R2 Object Storage** 클릭
3. **nops-crm-backup** 버킷 클릭
4. `backups/YYYY-MM-DD/` 폴더에서 복원할 날짜 선택
5. `nops-crm-YYYY-MM-DDTHH-MM-SS.sql.gz.enc` 파일 다운로드
6. 같은 폴더의 `.meta.json` 파일도 다운로드 (IV 값 필요)

---

## 2단계 — 복호화 (암호화 해제)

**컴퓨터에 Node.js가 설치되어 있어야 합니다.**

1. 다운로드한 `.enc` 파일과 `.meta.json` 파일을 같은 폴더에 놓습니다.

2. `.meta.json` 파일을 메모장으로 열어 `encryptionIV` 값을 복사합니다.
   ```json
   {
     "encryptionIV": "714113d557e72172a96ca332c220c71e"
   }
   ```

3. 아래 명령어를 터미널에서 실행합니다:
   ```bash
   node -e "
   const { createDecipheriv } = require('crypto');
   const { createReadStream, createWriteStream } = require('fs');
   const { createGunzip } = require('zlib');
   const { pipeline } = require('stream/promises');
   
   const key = Buffer.from('여기에_암호화_키_입력', 'hex');
   const iv = Buffer.from('여기에_IV_값_입력', 'hex');
   const decipher = createDecipheriv('aes-256-cbc', key, iv);
   
   pipeline(
     createReadStream('백업파일명.sql.gz.enc'),
     decipher,
     createGunzip(),
     createWriteStream('복원파일.sql')
   ).then(() => console.log('복호화 완료: 복원파일.sql'));
   "
   ```

4. `복원파일.sql` 파일이 생성되면 복호화 성공입니다.

---

## 3단계 — DB 복원

### 방법 A: Manus 대시보드 Import (권장)

1. Manus 대시보드 → **Database** 탭
2. 하단 **Import** 버튼 클릭
3. `복원파일.sql` 업로드
4. 실행 확인

### 방법 B: Manus 지원팀 요청

대규모 복원이나 문제 발생 시:
- [help.manus.im](https://help.manus.im) 에서 티켓 제출
- "DB 복원 요청" 제목으로 백업 날짜 명시

### 방법 C: 특정 테이블만 복원

`복원파일.sql`을 메모장으로 열어 해당 테이블의 `INSERT INTO` 구문만 복사하여 Manus Database 탭에서 직접 실행합니다.

---

## 4단계 — 복원 후 검증

복원 완료 후 다음을 확인합니다:

1. **회원 수 확인**
   - Manus Database 탭에서 실행: `SELECT COUNT(*) FROM members;`
   - 백업 메타데이터의 `rowCounts.members` 값과 일치해야 함

2. **쿠폰 수 확인**
   - `SELECT COUNT(*) FROM coupons;`
   - 백업 메타데이터의 `rowCounts.coupons` 값과 일치해야 함

3. **서비스 정상 확인**
   - [membership.nops.kr](https://membership.nops.kr) 접속 테스트
   - 마이페이지에서 이메일 조회 테스트

---

## 백업 파일 위치 (Cloudflare R2)

```
nops-crm-backup/
└── backups/
    └── YYYY-MM-DD/
        ├── nops-crm-YYYY-MM-DDTHH-MM-SS.sql.gz.enc  (암호화된 백업)
        └── nops-crm-YYYY-MM-DDTHH-MM-SS.meta.json   (메타데이터: IV, 행 수 등)
```

---

## 문의

복원 과정에서 문제가 발생하면:
- Manus 지원: [help.manus.im](https://help.manus.im)
- 담당자: RAY Choi (spvltm@gmail.com)

---

*최종 업데이트: 2026-07-05*
