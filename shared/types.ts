// Shared types between client and server

export type CouponType = "discount_percent" | "corkage_free" | "birthday" | "anniversary" | "employee";
export type CouponStatus = "active" | "used" | "expired";
export type MemberStatus = "active" | "inactive" | "withdrawn";

export interface CouponData {
  id: number;
  memberId: number;
  templateId: number;
  code: string;
  type: CouponType;
  discountPercent: number | null;
  name: string;
  description: string | null;
  status: CouponStatus;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedByStaffId: number | null;
  usedNote: string | null;
  birthdayYear: number | null;
}
