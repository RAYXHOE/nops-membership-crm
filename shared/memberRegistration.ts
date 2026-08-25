import { z } from "zod";

const COMMON_EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "maver.com": "naver.com",
  "naver.con": "naver.com",
  "naver,com": "naver.com",
  "hanmail.con": "hanmail.net",
  "daum.con": "daum.net",
};

export function formatKoreanMobilePhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.startsWith("010")) {
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
}

function isValidCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const memberNameSchema = z
  .string()
  .trim()
  .min(2, "이름은 2자 이상 입력해 주세요.")
  .max(30, "이름은 30자 이내로 입력해 주세요.")
  .regex(/^[가-힣A-Za-z]+(?: [가-힣A-Za-z]+)*$/, "이름은 한글 또는 영문만 입력해 주세요.");

export const memberEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("올바른 이메일 형식이 아닙니다.")
  .max(320, "이메일 주소가 너무 깁니다.")
  .superRefine((value, ctx) => {
    const domain = value.split("@")[1];
    const suggestion = domain ? COMMON_EMAIL_DOMAIN_TYPOS[domain] : undefined;
    if (suggestion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `이메일 도메인을 확인해 주세요. ${suggestion}을 입력하려면 수정해 주세요.`,
      });
    }
  });

export const memberPhoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine(
    (digits) => /^01(?:0\d{8}|[16789]\d{7,8})$/.test(digits),
    "휴대폰 번호 10~11자리를 정확히 입력해 주세요."
  )
  .transform(formatKoreanMobilePhone);

export const memberBirthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일 형식: YYYY-MM-DD")
  .superRefine((value, ctx) => {
    const year = Number(value.slice(0, 4));
    const currentYear = new Date().getFullYear();
    if (!isValidCalendarDate(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "실제 존재하는 생년월일을 입력해 주세요." });
    } else if (year < 1900 || year > currentYear) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `생년은 1900년부터 ${currentYear}년 사이여야 합니다.` });
    }
  });

const optionalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식: YYYY-MM-DD")
  .refine(isValidCalendarDate, "실제 존재하는 날짜를 입력해 주세요.");

export const memberRegistrationSchema = z.object({
  name: memberNameSchema,
  email: memberEmailSchema,
  phone: memberPhoneSchema,
  birthDate: memberBirthDateSchema,
  anniversaryDate: optionalDateSchema.optional(),
  visitedBranch: z.string().trim().max(100).optional(),
  privacyConsent: z.boolean().refine((value) => value === true, "개인정보 수집 동의는 필수입니다."),
  marketingConsent: z.boolean(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().max(1000).optional(),
});

export type MemberRegistrationInput = z.infer<typeof memberRegistrationSchema>;
