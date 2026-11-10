/** Pure salary / advance / lateness calculations */

export function calcAssemblerEarnings(
  orderAmount: number,
  percent: number,
): number {
  return Math.round((orderAmount * percent) / 100);
}

export function calcMaxAdvance(earned: number, maxPercent: number): number {
  return Math.round((earned * maxPercent) / 100);
}

export function calcAvailableAdvance(
  earned: number,
  alreadyIssued: number,
  maxPercent: number,
): { maxAllowed: number; available: number } {
  const maxAllowed = calcMaxAdvance(earned, maxPercent);
  const available = Math.max(0, maxAllowed - alreadyIssued);
  return { maxAllowed, available };
}

export function canIssueAdvance(
  earned: number,
  alreadyIssued: number,
  requested: number,
  maxPercent: number,
): { ok: boolean; reason?: string; maxAllowed: number; available: number } {
  const { maxAllowed, available } = calcAvailableAdvance(
    earned,
    alreadyIssued,
    maxPercent,
  );
  if (requested <= 0) {
    return { ok: false, reason: "Сумма должна быть больше нуля", maxAllowed, available };
  }
  if (requested > available) {
    return {
      ok: false,
      reason: `Превышен лимит аванса. Доступно: ${available} ₸`,
      maxAllowed,
      available,
    };
  }
  return { ok: true, maxAllowed, available };
}

export function calcLateMinutes(
  checkInHours: number,
  checkInMinutes: number,
  workStart: string,
  thresholdMinutes: number,
): number {
  const [sh, sm] = workStart.split(":").map(Number);
  const start = sh * 60 + sm;
  const actual = checkInHours * 60 + checkInMinutes;
  const late = actual - start;
  if (late <= thresholdMinutes) return 0;
  return late;
}

export function calcLatePenalty(
  lateMinutes: number,
  penaltyAmount: number,
): number {
  return lateMinutes > 0 ? penaltyAmount : 0;
}
