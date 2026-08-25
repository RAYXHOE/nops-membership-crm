import { describe, expect, it } from "vitest";
import { validateSolapiApiKey } from "./kakao";

describe("SOLAPI 운영 연동", () => {
  it("설정된 API 키로 읽기 전용 잔액 조회에 성공한다", async () => {
    await expect(validateSolapiApiKey()).resolves.toBe(true);
  }, 20_000);
});
