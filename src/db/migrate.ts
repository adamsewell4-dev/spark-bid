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

  // Additive column migrations — safe to run repeatedly on existing databases
  const addColumns: { table: string; column: string; definition: string }[] = [
    { table: 'commercial_projects', column: 'discovery_notes', definition: 'TEXT' },
  ];

  for (const { table, column, definition } of addColumns) {
    const exists = (db.prepare(
      `SELECT COUNT(*) as n FROM pragma_table_info(?) WHERE name = ?`
    ).get(table, column) as { n: number }).n > 0;

    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[${new Date().toISOString()}] [migrate] Added column ${table}.${column}`);
    }
  }
}

migrate();
