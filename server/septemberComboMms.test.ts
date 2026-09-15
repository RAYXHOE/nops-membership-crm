import { describe, expect, it } from "vitest";
import { renderSeptemberComboMmsText } from "../scripts/lib/september-combo-mms.mjs";

describe("September combo MMS personalization", () => {
  it("inlines the recipient name without leaving an unresolved variable", () => {
    const text = renderSeptemberComboMmsText("홍길동");

    expect(text.split("\n").slice(0, 2)).toEqual([
      "[멤버쉽 특전] 스테이크하우스 NOPS",
      "홍길동님, 9월 콤보 전 메뉴 10% 할인 쿠폰이 발급되었습니다.",
    ]);
    expect(text).toContain("홍길동님, 9월 콤보 전 메뉴 10% 할인 쿠폰이 발급되었습니다.");
    expect(text).not.toContain("#{이름}");
    expect(text).not.toMatch(/#\{[^}]+}/);
  });

  it("normalizes whitespace in a supplied recipient name", () => {
    const text = renderSeptemberComboMmsText("  홍\n길동  ");

    expect(text).toContain("홍 길동님");
    expect(text).not.toContain("\n길동님");
  });

  it("rejects a blank recipient name rather than sending an anonymous personalized message", () => {
    expect(() => renderSeptemberComboMmsText("   ")).toThrow("non-empty recipient name");
  });
});
