/**
 * Preferential-rate tax on net long-term gains + qualified dividends. They stack
 * on top of ordinary taxable income: the 0% band fills first (up to zeroUpTo),
 * then 15% (up to fifteenUpTo), then 20%.
 */
export function capitalGainsTax(
  ordinaryTaxable: number,
  preferentialGains: number,
  band: { zeroUpTo: number; fifteenUpTo: number },
): number {
  if (preferentialGains <= 0) return 0;
  let remaining = preferentialGains;
  let tax = 0;

  // 0% band — the room left between ordinary income and the 0% ceiling.
  const zeroRoom = Math.max(0, band.zeroUpTo - ordinaryTaxable);
  remaining -= Math.min(remaining, zeroRoom);

  // 15% band — between max(ordinary, zero-ceiling) and the 15% ceiling.
  const fifteenRoom = Math.max(0, band.fifteenUpTo - Math.max(ordinaryTaxable, band.zeroUpTo));
  const at15 = Math.min(remaining, fifteenRoom);
  tax += at15 * 0.15;
  remaining -= at15;

  // 20% on whatever's left.
  tax += remaining * 0.2;
  return tax;
}
