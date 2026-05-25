import { z } from 'zod';

/** Shared goal body schema for the create/update API routes. */
export const goalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  type: z.enum(['save_up', 'pay_down']).default('save_up'),
  targetAmount: z.number().nonnegative().optional().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  monthlyContribution: z.number().nonnegative().optional().nullable(),
  icon: z.string().max(8).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  accountIds: z.array(z.string().uuid()).optional(),
});
