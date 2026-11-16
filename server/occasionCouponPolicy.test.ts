import { describe, expect, it } from "vitest";
import { COUPON_VALIDITY_DAYS, getCouponExpiryAt } from "@shared/couponPolicy";
import {
  OCCASION_LEAD_DAYS,
  OCCASION_POLICY_START_DATE,
  getDueOccasion,
  getKstDateKey,
  getOccasionForYear,
  occasionGrantKey,
  type OccasionType,
} from "@shared/occasionCouponPolicy";

// 테스트 입력은 오프셋을 명시하여 서버 로컬 시간대에 의존하지 않는다.
const kst = (date: string, time = "12:00:00.000") => new Date(`${date}T${time}+09:00`);

const invalidDates: (Date | string | null)[] = [
  null,
  new Date(NaN),
  "",
  "not-a-date",
  "1990-2-03",
  "1990-02-3",
  "02-03",
  "1990/02/03",
  " 1990-02-03",
  "1990-02-03 ",
  "1990-02-03T00:00:00.000Z",
  "0000-01-01",
  "10000-01-01",
  "-001-01-01",
  "1990-00-01",
  "1990-13-01",
  "1990-01-00",
  "1990-01-32",
  "1990-04-31",
  "1990-02-29",
  "2000-02-30",
  "2100-02-29",
  new Date("0000-01-01T00:00:00.000Z"),
  new Date("+010000-01-01T00:00:00.000Z"),
];

const invalidYears = [0, -1, 10000, 2027.5, NaN, Infinity, -Infinity];

describe("기념일 쿠폰 D-30 정책", () => {
  it("D-30과 KST 전환일을 고정하고 기존 365일 유효기간은 유지한다", () => {
    expect(OCCASION_LEAD_DAYS).toBe(30);
    expect(OCCASION_POLICY_START_DATE).toBe("2026-11-16");
    expect(COUPON_VALIDITY_DAYS).toBe(365);
    const issuedAt = new Date("2026-11-16T03:00:00.000Z");
    expect(getCouponExpiryAt(issuedAt).toISOString()).toBe("2027-11-16T03:00:00.000Z");
    expect(issuedAt.toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });

  describe("KST 달력 날짜", () => {
    it("UTC 날짜가 같아도 KST 23:59에서 00:00으로 날짜가 바뀐다", () => {
      expect(getKstDateKey(new Date("2026-11-16T14:59:59.999Z"))).toBe("2026-11-16");
      expect(getKstDateKey(new Date("2026-11-16T15:00:00.000Z"))).toBe("2026-11-17");
    });

    it("KST 연말 자정의 연도 전환을 처리한다", () => {
      expect(getKstDateKey(new Date("2026-12-31T14:59:59.999Z"))).toBe("2026-12-31");
      expect(getKstDateKey(new Date("2026-12-31T15:00:00.000Z"))).toBe("2027-01-01");
    });

    it("유효한 1년과 9999년 날짜를 YYYY-MM-DD로 유지한다", () => {
      expect(getKstDateKey(kst("0001-01-01"))).toBe("0001-01-01");
      expect(getKstDateKey(kst("9999-12-31"))).toBe("9999-12-31");
    });

    it.each([
      new Date(NaN),
      new Date("0000-01-01T00:00:00.000Z"),
      new Date("9999-12-31T15:00:00.000Z"),
    ])("유효하지 않거나 범위를 벗어난 시각은 날짜 키로 만들지 않는다: %s", (now) => {
      expect(() => getKstDateKey(now)).toThrow(RangeError);
      expect(getDueOccasion("1990-01-01", now)).toBeNull();
    });
  });

  describe("원본 날짜와 기념일 연도", () => {
    it.each([
      ["1990-01-31", 2027, "2027-01-31"],
      ["1990-04-30", 2027, "2027-04-30"],
      ["1990-12-31", 2027, "2027-12-31"],
      ["0001-01-01", 1, "0001-01-01"],
      ["0099-12-31", 99, "0099-12-31"],
      ["9999-12-31", 9999, "9999-12-31"],
      ["2096-02-29", 2027, "2027-02-28"],
      ["9999-12-16", 2026, "2026-12-16"],
    ])("유효한 원본 %s를 %i년 기념일 %s로 계산한다", (value, year, expected) => {
      expect(getOccasionForYear(value, year)).toBe(expected);
      expect(getOccasionForYear(new Date(`${value}T00:00:00.000Z`), year)).toBe(expected);
    });

    it("Drizzle Date의 UTC 월·일을 읽고 KST/로컬 날짜로 바꾸지 않는다", () => {
      const value = new Date("1990-01-31T23:30:00.000Z");
      expect(getOccasionForYear(value, 2027)).toBe("2027-01-31");
      expect(value.toISOString()).toBe("1990-01-31T23:30:00.000Z");
    });

    it.each([
      [2027, "2027-02-28"],
      [2028, "2028-02-29"],
      [2100, "2100-02-28"],
      [2400, "2400-02-29"],
      [1, "0001-02-28"],
      [4, "0004-02-29"],
    ])("윤년 출생일 2/29를 %i년에 %s로 처리한다", (year, expected) => {
      expect(getOccasionForYear("2000-02-29", year)).toBe(expected);
      expect(getOccasionForYear(new Date("2000-02-29T00:00:00.000Z"), year)).toBe(expected);
    });

    it.each(invalidDates)("잘못된 원본 날짜를 자동 보정하지 않는다: %s", (value) => {
      // 대상 연도가 윤년이어도 원본 평년의 잘못된 2/29를 받아들이지 않는다.
      expect(getOccasionForYear(value, 2028)).toBeNull();
      expect(getDueOccasion(value, kst("2026-11-16"))).toBeNull();
    });

    it.each(invalidYears)("범위 밖 또는 정수가 아닌 대상 연도를 거부한다: %s", (year) => {
      expect(getOccasionForYear("1990-12-16", year)).toBeNull();
    });
  });

  describe("정확히 D-30일 때만 반환", () => {
    it.each(["00:00:00.000", "12:00:00.000", "23:59:59.999"])(
      "KST 당일 %s에 같은 D-30 결과를 반환한다",
      (time) => {
        expect(getDueOccasion("1990-12-16", kst("2026-11-16", time))).toEqual({
          occasionDate: "2026-12-16",
          occasionYear: 2026,
          reminderDate: "2026-11-16",
        });
      },
    );

    it("KST 23:59까지 D-30이고 00:00부터 D-29로 발급 대상에서 제외한다", () => {
      expect(getDueOccasion("1990-12-17", kst("2026-11-17", "23:59:59.999"))).toEqual({
        occasionDate: "2026-12-17",
        occasionYear: 2026,
        reminderDate: "2026-11-17",
      });
      expect(getDueOccasion("1990-12-17", kst("2026-11-18", "00:00:00.000"))).toBeNull();
    });

    it("전환일 이전 D-30은 발급하지 않고 전환일에 소급하지 않는다", () => {
      expect(getDueOccasion("1990-12-15", kst("2026-11-15", "23:59:59.999"))).toBeNull();
      expect(getDueOccasion("1990-12-15", kst("2026-11-16", "00:00:00.000"))).toBeNull();
      expect(getDueOccasion("1990-12-16", kst("2026-11-16", "00:00:00.000"))).toEqual({
        occasionDate: "2026-12-16",
        occasionYear: 2026,
        reminderDate: "2026-11-16",
      });
      expect(getDueOccasion("1990-12-15", kst("2027-11-15"))).toEqual({
        occasionDate: "2027-12-15",
        occasionYear: 2027,
        reminderDate: "2027-11-15",
      });
    });

    it("D-31은 아직 대상이 아니고 D-29 가입은 다음 해 D-30까지 기다린다", () => {
      expect(getDueOccasion("1990-12-20", kst("2026-11-19"))).toBeNull();
      expect(getDueOccasion("1990-12-20", kst("2026-11-20"))).toEqual({
        occasionDate: "2026-12-20",
        occasionYear: 2026,
        reminderDate: "2026-11-20",
      });
      expect(getDueOccasion("1990-12-20", kst("2026-11-21"))).toBeNull();
      expect(getDueOccasion("1990-12-20", kst("2026-12-20"))).toBeNull();
      expect(getDueOccasion("1990-12-20", kst("2027-11-20"))).toEqual({
        occasionDate: "2027-12-20",
        occasionYear: 2027,
        reminderDate: "2027-11-20",
      });
    });

    it.each([
      ["2026-12-02", "1990-01-01", "2027-01-01", 2027],
      ["2026-12-31", "1990-01-30", "2027-01-30", 2027],
      ["2027-01-01", "1990-01-31", "2027-01-31", 2027],
      ["2027-01-29", "2000-02-29", "2027-02-28", 2027],
      ["2028-01-30", "2000-02-29", "2028-02-29", 2028],
      ["2028-01-29", "1990-02-28", "2028-02-28", 2028],
      ["2028-02-01", "1990-03-02", "2028-03-02", 2028],
      ["2027-02-01", "1990-03-03", "2027-03-03", 2027],
      ["2100-01-29", "2000-02-29", "2100-02-28", 2100],
      ["2400-01-30", "2000-02-29", "2400-02-29", 2400],
    ])("%s의 30일 뒤 기념일을 %s에서 판정한다", (today, original, occasionDate, occasionYear) => {
      const expected = { occasionDate, occasionYear, reminderDate: today };
      expect(getDueOccasion(original, kst(today))).toEqual(expected);
      expect(getDueOccasion(new Date(`${original}T00:00:00.000Z`), kst(today))).toEqual(expected);
    });

    it("윤년 2/29는 2/28이 아니라 실제 2/29의 D-30에만 대상이다", () => {
      expect(getDueOccasion("2000-02-29", kst("2028-01-29"))).toBeNull();
      expect(getDueOccasion("2000-02-29", kst("2027-01-30"))).toBeNull();
    });

    it("9999년까지 계산하고 다음해 10000년으로 넘어가면 대상이 없다", () => {
      expect(getDueOccasion("1990-12-31", kst("9999-12-01"))).toEqual({
        occasionDate: "9999-12-31",
        occasionYear: 9999,
        reminderDate: "9999-12-01",
      });
      expect(getDueOccasion("1990-01-01", kst("9999-12-02"))).toBeNull();
    });

    it("원본 Date와 현재 시각을 변경하지 않고 같은 결과를 반복 반환한다", () => {
      const original = new Date("1990-01-01T00:00:00.000Z");
      const now = kst("2026-12-02");
      const originalTime = original.getTime();
      const nowTime = now.getTime();
      const first = getDueOccasion(original, now);
      expect(getDueOccasion(original, now)).toEqual(first);
      expect(original.getTime()).toBe(originalTime);
      expect(now.getTime()).toBe(nowTime);
    });
  });

  describe("유형·기념일 연도별 중복 방지 키", () => {
    it("생일과 결혼기념일 키는 같은 연도에도 다르다", () => {
      expect(occasionGrantKey("birthday", 2027)).toBe("occasion:birthday:2027");
      expect(occasionGrantKey("anniversary", 2027)).toBe("occasion:anniversary:2027");
      expect(occasionGrantKey("birthday", 2027)).not.toBe(occasionGrantKey("anniversary", 2027));
      expect(occasionGrantKey("birthday", 2027)).not.toBe(occasionGrantKey("birthday", 2028));
      expect(occasionGrantKey("birthday", 2027)).toBe(occasionGrantKey("birthday", 2027));
    });

    it("12월 발급 시 발급 연도가 아닌 다음해 기념일 연도로 키를 만든다", () => {
      const due = getDueOccasion("1990-01-01", kst("2026-12-02"));
      expect(due).not.toBeNull();
      expect(occasionGrantKey("birthday", due!.occasionYear)).toBe("occasion:birthday:2027");
      expect(occasionGrantKey("anniversary", due!.occasionYear)).toBe("occasion:anniversary:2027");
    });

    it.each<OccasionType>(["birthday", "anniversary"])("%s 키는 연도 범위 전체에서 64자 이내다", (type) => {
      for (let year = 1; year <= 9999; year++) {
        expect(occasionGrantKey(type, year).length).toBeLessThanOrEqual(64);
      }
    });

    it.each(invalidYears)("잘못된 연도로 중복 방지 키를 만들지 않는다: %s", (year) => {
      expect(() => occasionGrantKey("birthday", year)).toThrow(RangeError);
      expect(() => occasionGrantKey("anniversary", year)).toThrow(RangeError);
    });

    it("타입 검사를 우회한 잘못된 유형을 거부한다", () => {
      expect(() => occasionGrantKey("employee" as OccasionType, 2027)).toThrow(RangeError);
    });
  });
});
