/**
 * src/db/migrate.ts
 *
 * Reads schema.sql and applies it to spark-bid.db.
 * Run via: npm run db:migrate
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function migrate(): void {
  const schemaPath = join(__dirname, 'schema.sql');

  console.log(`[${new Date().toISOString()}] [migrate] Reading schema from ${schemaPath}`);

  let schema: string;
  try {
    schema = readFileSync(schemaPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [migrate] Failed to read schema.sql — ${message}`);
    process.exit(1);
  }

  try {
    db.exec(schema);
    console.log(`[${new Date().toISOString()}] [migrate] Migration completed successfully.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [migrate] Migration failed — ${message}`);
    process.exit(1);
  }
}

migrate();
