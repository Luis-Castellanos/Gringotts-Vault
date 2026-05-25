import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const maintenanceSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  category: z.string().max(60).optional().nullable(),
  vendor: z.string().max(160).optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  openedAt: DATE.optional().nullable(),
  completedAt: DATE.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
