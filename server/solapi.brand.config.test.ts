import { describe, expect, it } from "vitest";
import { SolapiMessageService } from "solapi";

describe("SOLAPI 브랜드 템플릿 설정", () => {
  it("브랜드 템플릿 ID를 읽고 SOLAPI 계정에 읽기 전용으로 연결한다", async () => {
    const corkageTemplateId = process.env.SOLAPI_BRAND_TEMPLATE_CORKAGE;
    const anniversaryTemplateId = process.env.SOLAPI_BRAND_TEMPLATE_ANNIVERSARY;
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;

    expect(corkageTemplateId).toMatch(/^KA01BP/);
    expect(anniversaryTemplateId).toMatch(/^KA01BP/);
    expect(apiKey).toBeTruthy();
    expect(apiSecret).toBeTruthy();

    const client = new SolapiMessageService(apiKey!, apiSecret!);
    const balance = await client.getBalance();
    expect(balance).toBeDefined();
  }, 15_000);
});
