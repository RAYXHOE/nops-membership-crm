import { describe, expect, it } from "vitest";
import { canUseAdminAlimtalkTest } from "./adminAlimtalkAuth";

describe("admin alimtalk test authorization", () => {
  it("allows only administrator accounts", () => {
    expect(canUseAdminAlimtalkTest({ role: "admin" })).toBe(true);
    expect(canUseAdminAlimtalkTest({ role: "staff" })).toBe(false);
    expect(canUseAdminAlimtalkTest({ role: "user" })).toBe(false);
    expect(canUseAdminAlimtalkTest(null)).toBe(false);
  });
});
