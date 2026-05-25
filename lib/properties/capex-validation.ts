import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const capexSchema = z.object({
  propertyId: z.string().uuid(),
  description: z.string().min(1, 'Description is required').max(200),
  cost: z.number().nonnegative(),
  placedInService: DATE.optional().nullable(),
  usefulLifeYears: z.number().int().min(1).max(50).default(5),
  notes: z.string().max(2000).optional().nullable(),
});
