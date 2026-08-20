export type MemberCsvRow = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  joinedAt: string;
  marketingConsent: string;
  visitedBranch: string;
};

export const MEMBER_CSV_HEADERS = [
  "이름",
  "이메일",
  "전화번호",
  "생년월일",
  "가입일",
  "마케팅동의",
  "방문매장",
];

function escapeCsvCell(value: unknown) {
  const normalized = String(value ?? "").replace(/[\r\n]+/g, " ");
  const formulaSafe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function buildMemberCsv(rows: MemberCsvRow[]) {
  const values = rows.map((member) => [
    member.name,
    member.email,
    member.phone,
    member.birthDate,
    member.joinedAt,
    member.marketingConsent,
    member.visitedBranch,
  ]);
  return "\uFEFF" + [MEMBER_CSV_HEADERS, ...values]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}
