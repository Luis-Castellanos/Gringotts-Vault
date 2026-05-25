import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Shared body schema for the custom-report run + save routes. */
export const queryDefSchema = z.object({
  groupBy: z.enum(['category', 'merchant', 'account', 'month']),
  flow: z.enum(['outflow', 'inflow', 'all']),
  from: DATE.nullable(),
  to: DATE.nullable(),
  minAmount: z.number().nonnegative().nullable(),
  maxAmount: z.number().nonnegative().nullable(),
});
