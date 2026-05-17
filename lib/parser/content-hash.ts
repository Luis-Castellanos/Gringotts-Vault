// lib/parser/content-hash.ts
import { createHash } from 'node:crypto';
/**
 * The hash that anchors transaction-level idempotency.
 * MUST stay byte-identical to the function in scripts/load-master.ts —
 * if it diverges, dedup breaks across the parser/load-master boundary
 * during the side-by-side period.
 */
export function contentHash(
  accountId: string,
  date: string,
  amount: string,
  rawDescription: string,
): string {
  return createHash('sha256')
    .update(`${accountId}|${date}|${amount}|${rawDescription}`)
    .digest('hex');
}
