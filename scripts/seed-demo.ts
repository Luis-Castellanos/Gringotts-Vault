/**
 * Seed the DEMO database with sample data.
 *
 * DESTRUCTIVE — wipes the data tables of whatever DATABASE_URL points at, then
 * inserts the demo fixtures. Point DATABASE_URL at your *demo* Neon database
 * only, never your real one.
 *
 * Usage:
 *   DATABASE_URL=<demo-db-url> tsx scripts/seed-demo.ts --force
 */

import 'dotenv/config';
import { seedDemo } from '@/lib/demo/seed';

async function main() {
  if (!process.argv.includes('--force')) {
    console.error('Refusing to run without --force.\nThis WIPES the data tables of DATABASE_URL and reseeds them. Point it at your DEMO database only, then re-run with --force.');
    process.exit(1);
  }
  console.log('Seeding demo data into:', (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':****@'));
  const counts = await seedDemo();
  console.log('Done:', counts);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
