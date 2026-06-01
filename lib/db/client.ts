import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Keep production alive when a deploy adds small backward-compatible columns
// before the managed database has been pushed manually.
await pool.query(`
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS institution_domain text;
  ALTER TABLE imports ALTER COLUMN account_id DROP NOT NULL;
  ALTER TABLE transactions ALTER COLUMN account_id DROP NOT NULL;
`);

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export { schema };
