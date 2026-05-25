import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const leaseSchema = z.object({
  propertyId: z.string().uuid(),
  unit: z.string().max(40).optional().nullable(),
  tenantName: z.string().max(160).optional().nullable(),
  tenantContact: z.string().max(200).optional().nullable(),
  rentAmount: z.number().nonnegative().optional().nullable(),
  depositAmount: z.number().nonnegative().optional().nullable(),
  startDate: DATE.optional().nullable(),
  endDate: DATE.optional().nullable(),
  status: z.enum(['active', 'upcoming', 'past', 'vacant']).default('active'),
  notes: z.string().max(2000).optional().nullable(),
});
