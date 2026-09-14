export function canUseAdminAlimtalkTest(user: { role?: string } | null | undefined): boolean {
  return user?.role === "admin";
}
