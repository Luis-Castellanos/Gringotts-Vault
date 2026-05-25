import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Shared property body schema for the create/update API routes. */
export const propertySchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  street: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(40).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  propertyType: z.string().max(40).default('single_family'),
  beds: z.number().int().min(0).max(100).optional().nullable(),
  baths: z.number().min(0).max(100).optional().nullable(),
  sqft: z.number().int().min(0).max(1_000_000).optional().nullable(),
  acquisitionDate: DATE.optional().nullable(),
  acquisitionPrice: z.number().nonnegative().optional().nullable(),
  landValuePct: z.number().min(0).max(100).optional().nullable(),
  marketValue: z.number().nonnegative().optional().nullable(),
  imageUrl: z.string().max(2000).optional().nullable(),
  mortgageAccountId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
