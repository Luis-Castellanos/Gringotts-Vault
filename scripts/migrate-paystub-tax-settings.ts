/**
 * Adds the tax_settings (W-4 elections) jsonb column to paystubs.
 *   npx tsx scripts/migrate-paystub-tax-settings.ts
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

async function main() {
  await db.execute(sql`ALTER TABLE paystubs ADD COLUMN IF NOT EXISTS tax_settings jsonb`);
  console.log('  ✓ paystubs.tax_settings');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
