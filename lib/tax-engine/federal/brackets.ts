import type { Bracket } from '../model';

/** Progressive tax on an amount over a bracket schedule. */
export function taxFromBrackets(amount: number, brackets: Bracket[]): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (amount <= prev) break;
    tax += (Math.min(amount, b.upTo) - prev) * b.rate;
    prev = b.upTo;
  }
  return tax;
}

/** The marginal rate an amount reaches. */
export function marginalRate(amount: number, brackets: Bracket[]): number {
  let rate = brackets[0]?.rate ?? 0;
  let prev = 0;
  for (const b of brackets) {
    if (amount > prev) rate = b.rate;
    prev = b.upTo;
  }
  return rate;
}
