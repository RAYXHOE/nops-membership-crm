import { describe, expect, it } from "vitest";
import { SolapiMessageService } from "solapi";

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

describe("SOLAPI sender configuration", () => {
  it("uses the approved NOPS sender and can access the account balance", async () => {
    const sender = String(process.env.SOLAPI_SENDER_PHONE ?? "").replace(/\D/g, "");
    expect(sender).toBe("025974030");

    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    expect(apiKey).toBeTruthy();
    expect(apiSecret).toBeTruthy();

    const client = new SolapiMessageService(apiKey!, apiSecret!);
    const balance = await withRetry(() => client.getBalance());
    expect(Number(balance.balance)).toBeGreaterThan(0);
  }, 15_000);

  it("uses an existing approved welcome alimtalk template", async () => {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const templateId = process.env.SOLAPI_TEMPLATE_WELCOME;
    expect(apiKey).toBeTruthy();
    expect(apiSecret).toBeTruthy();
    expect(templateId).toBeTruthy();

    const client = new SolapiMessageService(apiKey!, apiSecret!);
    const template = await withRetry(() => client.getKakaoAlimtalkTemplate(templateId!));
    expect(template.status).toBe("APPROVED");
    expect(template.name).toBe("NOPS 멤버십 가입 완료");
  }, 15_000);
});
