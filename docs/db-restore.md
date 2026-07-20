# NOPS CRM DB 복원 절차 (비전공자 기준)

> 이 문서는 백업 파일로 데이터베이스를 복원하는 방법을 단계별로 설명합니다.  
> 복원은 데이터 손실 발생 시에만 실행하며, 반드시 담당자와 함께 진행하는 것을 권장합니다.

---

## 백업 형식 변경 이력

| 날짜 | 형식 | 파일 확장자 |
|------|------|------------|
| 2026-07-05 이전 | SQL (mysqldump) | `.sql.gz.enc` |
| **2026-07-20 이후** | **JSON (Node.js)** | **`.json.gz.enc`** |

> **2026-07-20 이후 백업 파일은 이 문서의 절차를 따르세요.**  
> 2026-07-05 이전 SQL 백업 파일 복원은 담당자에게 문의하세요.

---

## 복원 전 반드시 확인할 것

- [ ] 복원할 백업 파일의 날짜를 확인했는가?
- [ ] 현재 DB에 보존해야 할 최신 데이터가 있는가? (있다면 먼저 현재 DB 백업)
- [ ] 암호화 키(`BACKUP_ENCRYPTION_KEY`)를 안전한 곳에서 꺼낼 수 있는가?

---

## 필요한 준비물

| 항목 | 설명 |
|------|------|
| **Node.js 18 이상** | 로컬 PC에 설치 필요 |
| **암호화 키** | `BACKUP_ENCRYPTION_KEY` 값 (64자리 hex 문자열) |
| **R2 접속 정보** | Cloudflare R2 버킷 접속 정보 |
| **복원 대상 날짜** | 어느 날짜 백업으로 복원할지 |
| **DATABASE_URL** | 복원 대상 DB 연결 문자열 |

---

## 1단계 — 백업 파일 다운로드

**Cloudflare R2 대시보드에서:**

1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인
2. 좌측 메뉴 **R2 Object Storage** 클릭
3. **nops-crm-backup** 버킷 클릭
4. `backups/YYYY-MM-DD/` 폴더에서 복원할 날짜 선택
5. `nops-crm-YYYY-MM-DDTHH-MM-SS.json.gz.enc` 파일 다운로드
6. 같은 폴더의 `.meta.json` 파일도 다운로드 (IV 값 필요)

---

## 2단계 — 복호화 및 압축 해제

**컴퓨터에 Node.js가 설치되어 있어야 합니다.**

1. 다운로드한 `.enc` 파일과 `.meta.json` 파일을 같은 폴더에 놓습니다.

2. `.meta.json` 파일을 메모장으로 열어 `encryptionIV` 값을 복사합니다.
   ```json
   {
     "encryptionIV": "714113d557e72172a96ca332c220c71e"
   }
   ```

3. 아래 내용을 `decrypt.mjs` 파일로 저장합니다:
   ```javascript
   import { createDecipheriv } from 'crypto';
   import { gunzip } from 'zlib';
   import { promisify } from 'util';
   import { readFileSync, writeFileSync } from 'fs';

   const gunzipAsync = promisify(gunzip);

   // ① 아래 값을 실제 값으로 교체하세요
   const ENCRYPTION_KEY = '여기에_64자리_암호화_키_입력';
   const IV_HEX = '여기에_meta.json의_encryptionIV_값_입력';
   const INPUT_FILE = './nops-crm-YYYY-MM-DDTHH-MM-SS.json.gz.enc'; // 실제 파일명으로 교체

   const encrypted = readFileSync(INPUT_FILE);
   const key = Buffer.from(ENCRYPTION_KEY, 'hex');
   const iv = Buffer.from(IV_HEX, 'hex');
   const decipher = createDecipheriv('aes-256-cbc', key, iv);
   const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
   const decompressed = await gunzipAsync(decrypted);
   writeFileSync('./backup.json', decompressed);
   console.log('복호화 완료: backup.json 생성됨');
   ```

4. 터미널에서 실행합니다:
   ```bash
   node decrypt.mjs
   ```

5. `backup.json` 파일이 생성되면 복호화 성공입니다.

---

## 3단계 — 백업 내용 확인

`backup.json` 파일을 메모장이나 텍스트 편집기로 열어 구조를 확인합니다.

```json
{
  "backupDate": "2026-07-20T15:00:00.000Z",
  "tables": {
    "members": [ { "id": 1, "name": "홍길동", ... }, ... ],
    "coupons": [ ... ],
    ...
  }
}
```

`meta.json`의 `rowCounts`와 실제 데이터 건수를 대조합니다.

---

## 4단계 — DB 복원

아래 내용을 `import-table.mjs` 파일로 저장합니다:

```javascript
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const TABLE_NAME = process.argv[2]; // 복원할 테이블 이름
const backup = JSON.parse(readFileSync('./backup.json', 'utf-8'));
const rows = backup.tables[TABLE_NAME];

if (!rows || !TABLE_NAME) {
  console.error('사용법: DATABASE_URL=... node import-table.mjs <테이블명>');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
await conn.execute(`DELETE FROM \`${TABLE_NAME}\``);
console.log(`${TABLE_NAME}: 기존 데이터 삭제 완료`);

const BATCH = 50;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  for (const row of batch) {
    const cols = Object.keys(row).map(k => `\`${k}\``).join(', ');
    const placeholders = Object.keys(row).map(() => '?').join(', ');
    const vals = Object.values(row);
    await conn.execute(`INSERT INTO \`${TABLE_NAME}\` (${cols}) VALUES (${placeholders})`, vals);
  }
  console.log(`${TABLE_NAME}: ${Math.min(i + BATCH, rows.length)}/${rows.length} 행 복원`);
}
await conn.end();
console.log(`✅ ${TABLE_NAME} 복원 완료: ${rows.length}행`);
```

**복원 순서 (의존성 순서 준수):**

```bash
DATABASE_URL="mysql://..." node import-table.mjs coupon_templates
DATABASE_URL="mysql://..." node import-table.mjs members
DATABASE_URL="mysql://..." node import-table.mjs coupons
DATABASE_URL="mysql://..." node import-table.mjs consent_logs
DATABASE_URL="mysql://..." node import-table.mjs visits
DATABASE_URL="mysql://..." node import-table.mjs purchases
DATABASE_URL="mysql://..." node import-table.mjs points
DATABASE_URL="mysql://..." node import-table.mjs alimtalk_logs
DATABASE_URL="mysql://..." node import-table.mjs otp_codes
DATABASE_URL="mysql://..." node import-table.mjs branches
DATABASE_URL="mysql://..." node import-table.mjs inquiries
DATABASE_URL="mysql://..." node import-table.mjs users
```

---

## 5단계 — 복원 후 검증

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
        ├── nops-crm-YYYY-MM-DDTHH-MM-SS.json.gz.enc  (암호화된 JSON 백업)
        └── nops-crm-YYYY-MM-DDTHH-MM-SS.meta.json    (메타데이터: IV, 행 수 등)
```

---

## 문의

복원 과정에서 문제가 발생하면:
- Manus 지원: [help.manus.im](https://help.manus.im)
- 담당자: RAY Choi (spvltm@gmail.com)

---

*최종 업데이트: 2026-07-20 (JSON 덤프 방식으로 전면 개정)*
