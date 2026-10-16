const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getMemberProfileEditAvailability(lastEditedAt: Date | string | null | undefined, now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS);
  const last = lastEditedAt ? new Date(lastEditedAt) : null;
  const canEdit = last === null || last.getTime() < monthStart.getTime();
  return { canEdit, nextAllowedAt: canEdit ? null : nextMonthStart, lastEditedAt: last };
}

export function getChangedMemberProfileFields(
  current: { phone: string; birthDate: Date | string },
  input: { phone?: string; birthDate?: string },
) {
  const changes: { phone?: string; birthDate?: Date } = {};
  if (input.phone !== undefined && input.phone.replace(/\D/g, "") !== current.phone.replace(/\D/g, "")) changes.phone = input.phone;
  const birthDate = new Date(current.birthDate).toISOString().slice(0, 10);
  if (input.birthDate !== undefined && input.birthDate !== birthDate) changes.birthDate = new Date(`${input.birthDate}T00:00:00.000Z`);
  return changes;
}
