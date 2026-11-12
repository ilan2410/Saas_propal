/** One canonical amount for Stripe and credits; never coerce request JSON. */
export function creditPurchase(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 10 || value > 10000) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) return null;
  const amount = cents / 100;
  const bonusPercent = cents >= 100000 ? 20 : cents >= 50000 ? 15 : cents >= 25000 ? 10 : cents >= 10000 ? 5 : 0;
  // Preserve the published whole-euro bonus rule.
  const bonus = Math.round(amount * bonusPercent / 100);
  return { cents, amount, bonusPercent, bonus, credits: amount + bonus };
}
