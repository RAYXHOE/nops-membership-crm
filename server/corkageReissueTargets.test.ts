import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = { select: vi.fn() };
const gteMock = vi.fn((column: unknown, value: unknown) => ({ column, value }));
const lteMock = vi.fn((column: unknown, value: unknown) => ({ column, value }));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  gte: gteMock,
  lte: lteMock,
}));

function rowsQuery<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function limitedRowsQuery<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe("getMembersForCorkageReissue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://test";
  });

  it("활성 회원 중 오늘 재발급되지 않은 정확한 사용 이력만 반환한다", async () => {
    mockDb.select
      .mockReturnValueOnce(rowsQuery([
        { memberId: 1, usedAt: new Date() },
        { memberId: 1, usedAt: new Date() },
        { memberId: 2, usedAt: new Date() },
        { memberId: 3, usedAt: new Date() },
      ]))
      .mockReturnValueOnce(limitedRowsQuery([{ id: 1, status: "active", name: "발급 대상" }]))
      .mockReturnValueOnce(limitedRowsQuery([]))
      .mockReturnValueOnce(limitedRowsQuery([]))
      .mockReturnValueOnce(limitedRowsQuery([]))
      .mockReturnValueOnce(limitedRowsQuery([{ id: 3, status: "active", name: "당일 발급됨" }]))
      .mockReturnValueOnce(limitedRowsQuery([{ id: 990, type: "corkage_free" }]));

    const { getMembersForCorkageReissue } = await import("./db");
    const targets = await getMembersForCorkageReissue();

    expect(targets).toEqual([{ id: 1, status: "active", name: "발급 대상" }]);
    expect(targets.filter((member) => member.id === 1)).toHaveLength(1);
    const usedCouponWindowStart = gteMock.mock.calls[0][1] as Date;
    const usedCouponWindowEnd = lteMock.mock.calls[0][1] as Date;
    const elapsedDays = Math.round((Date.now() - usedCouponWindowStart.getTime()) / (24 * 60 * 60 * 1000));

    expect(elapsedDays).toBe(30);
    expect(usedCouponWindowStart.getHours()).toBe(0);
    expect(usedCouponWindowEnd.getTime() - usedCouponWindowStart.getTime()).toBe(86_399_999);
  });
});
