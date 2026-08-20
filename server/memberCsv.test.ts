import { describe, expect, it } from "vitest";
import { buildMemberCsv } from "../shared/memberCsv";

describe("buildMemberCsv", () => {
  it("요청된 7개 열을 UTF-8 BOM CSV로 생성한다", () => {
    const csv = buildMemberCsv([{
      name: "김놉스",
      email: "nops@example.com",
      phone: "010-1234-5678",
      birthDate: "1990. 1. 2.",
      joinedAt: "2026. 8. 13.",
      marketingConsent: "동의",
      visitedBranch: "당산",
    }]);

    expect(csv).toContain("\uFEFF\"이름\",\"이메일\",\"전화번호\",\"생년월일\",\"가입일\",\"마케팅동의\",\"방문매장\"");
    expect(csv).toContain("\"김놉스\",\"nops@example.com\",\"010-1234-5678\",\"1990. 1. 2.\",\"2026. 8. 13.\",\"동의\",\"당산\"");
  });

  it("줄바꿈과 스프레드시트 수식 시작 문자를 안전하게 처리한다", () => {
    const csv = buildMemberCsv([{
      name: "=HYPERLINK(\"https://invalid.example\")\n테스트",
      email: "a@example.com",
      phone: "010-0000-0000",
      birthDate: "",
      joinedAt: "2026. 8. 13.",
      marketingConsent: "미동의",
      visitedBranch: "",
    }]);

    expect(csv).toContain("\"'=HYPERLINK(\"\"https://invalid.example\"\") 테스트\"");
  });
});
