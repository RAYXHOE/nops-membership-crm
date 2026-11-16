export type OccasionType = "birthday" | "anniversary";

/** 생일·결혼기념일 쿠폰 발급 및 안내는 해당일의 정확히 30일 전이다. */
export const OCCASION_LEAD_DAYS = 30;

/** KST 날짜 기준 적용 시작일. 이 날짜 이전에 놓친 D-30은 소급하지 않는다. */
export const OCCASION_POLICY_START_DATE = "2026-11-16";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1 && year <= 9999;
}

/** Date.UTC의 0~99년 → 1900~1999년 보정을 피한다. */
function utcCalendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function utcDateKey(date: Date): string | null {
  if (!Number.isFinite(date.getTime()) || !isValidYear(date.getUTCFullYear())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function kstDateKey(now: Date): string | null {
  if (!(now instanceof Date)) return null;
  // KST는 UTC+09:00 고정이다. 실행 환경의 로컬 시간대는 사용하지 않는다.
  return utcDateKey(new Date(now.getTime() + KST_OFFSET_MS));
}

/** 주어진 시각의 KST YYYY-MM-DD. 유효하지 않거나 범위 밖이면 RangeError. */
export function getKstDateKey(now: Date): string {
  const dateKey = kstDateKey(now);
  if (dateKey === null) throw new RangeError("유효한 KST 날짜가 필요합니다 (1~9999년).");
  return dateKey;
}

function parseOccasionDate(
  dateValue: Date | string | null,
): { month: number; day: number } | null {
  let year: number;
  let month: number;
  let day: number;

  if (dateValue instanceof Date) {
    if (!Number.isFinite(dateValue.getTime())) return null;
    // Drizzle/MySQL DATE는 UTC Date로 매핑된다. KST/로컬 날짜로 재해석하지 않는다.
    year = dateValue.getUTCFullYear();
    month = dateValue.getUTCMonth() + 1;
    day = dateValue.getUTCDate();
  } else if (typeof dateValue === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    return null;
  }

  if (!isValidYear(year)) return null;
  // 원본 연도에서 실재하는 날짜인지 먼저 검증한다. 미래 연도라도 동일하게 검증한다.
  const original = utcCalendarDate(year, month, day);
  if (
    original.getUTCFullYear() !== year ||
    original.getUTCMonth() + 1 !== month ||
    original.getUTCDate() !== day
  ) {
    return null;
  }
  return { month, day };
}

/** 원본 연도와 무관하게 지정 연도의 기념일을 계산한다. 평년의 2/29는 2/28. */
export function getOccasionForYear(
  dateValue: Date | string | null,
  year: number,
): string | null {
  if (!isValidYear(year)) return null;
  const original = parseOccasionDate(dateValue);
  if (!original) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const day = original.month === 2 && original.day === 29 && !leapYear
    ? 28
    : original.day;
  return utcDateKey(utcCalendarDate(year, original.month, day));
}

/**
 * 오늘(KST)+30일과 기념일이 일치할 때만 발급·안내 대상을 반환한다.
 * D-29 가입/재시도, D-31, 전환일 이전의 누락 건은 반환하지 않는다.
 * 날짜 판정만 수행하며 발급/발송/예약 및 만료일 계산은 하지 않는다.
 */
export function getDueOccasion(
  dateValue: Date | string | null,
  now: Date,
): { occasionDate: string; occasionYear: number; reminderDate: string } | null {
  const today = kstDateKey(now);
  if (today === null || today < OCCASION_POLICY_START_DATE) return null;

  // KST 날짜를 UTC 자정으로 나타낸 뒤 UTC 달력 일수만 더한다.
  const dueDate = new Date(`${today}T00:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + OCCASION_LEAD_DAYS);
  const occasionYear = dueDate.getUTCFullYear();
  const occasionDate = getOccasionForYear(dateValue, occasionYear);
  if (occasionDate === null || occasionDate !== utcDateKey(dueDate)) return null;

  return { occasionDate, occasionYear, reminderDate: today };
}

/**
 * 회원별·유형별·기념일 연도별 중복 방지 키 (DB grantKey의 64자 이내).
 * 기존 월초 발급분은 호출 측에서 type + birthdayYear도 대조해야 한다.
 */
export function occasionGrantKey(type: OccasionType, year: number): string {
  if (type !== "birthday" && type !== "anniversary") {
    throw new RangeError("지원하지 않는 기념일 유형입니다.");
  }
  if (!isValidYear(year)) throw new RangeError("기념일 연도는 1~9999년이어야 합니다.");
  return `occasion:${type}:${year}`;
}
