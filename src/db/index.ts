/**
 * src/db/index.ts
 *
 * SQLite database layer for Spark Bid.
 * Uses better-sqlite3 (synchronous API — no async/await needed).
 * All query helpers are exported as named exports.
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// DATABASE_PATH env var lets Railway (or any host) point to a persistent volume.
// Falls back to the project-root db file for local development.
const DB_PATH = process.env['DATABASE_PATH'] ?? join(__dirname, '..', '..', 'spark-bid.db');

// Ensure the directory exists before opening (needed when DATABASE_PATH points to a volume mount)
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OpportunityRow {
  id: string;
  notice_id: string | null;
  title: string;
  solicitation_number: string | null;
  agency: string | null;
  naics_code: string | null;
  type: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  archive_date: string | null;
  description: string | null;
  active: number;
  url: string | null;
  attachments_json: string | null;
  raw_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertOpportunityInput {
  id: string;
  notice_id?: string | null;
  title: string;
  solicitation_number?: string | null;
  agency?: string | null;
  naics_code?: string | null;
  type?: string | null;
  posted_date?: string | null;
  response_deadline?: string | null;
  archive_date?: string | null;
  description?: string | null;
  active?: number;
  url?: string | null;
  attachments_json?: string | null;
  raw_json?: string | null;
}

export interface ProposalRow {
  id: string;
  opportunity_id: string;
  status: 'draft' | 'review' | 'submitted';
  content_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface PastPerformanceRow {
  id: string;
  client_name: string;
  project_name: string;
  value_usd: number | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  naics_code: string | null;
  created_at: string;
}

export interface SavePastPerformanceInput {
  id: string;
  client_name: string;
  project_name: string;
  value_usd?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  naics_code?: string | null;
}

export interface DeadlineRow {
  id: string;
  opportunity_id: string;
  deadline_date: string;
  alert_sent: number;
  notes: string | null;
  created_at: string;
}

export interface ListOpportunitiesOptions {
  activeOnly?: boolean;
  naicsCode?: string;
  limit?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────
// Opportunity helpers
// ─────────────────────────────────────────────────────────────

/**
 * Fetch a single opportunity by its primary key.
 * Returns undefined if not found.
 */
export function getOpportunity(id: string): OpportunityRow | undefined {
  const stmt = db.prepare<[string], OpportunityRow>(
    'SELECT * FROM opportunities WHERE id = ?'
  );
  return stmt.get(id);
}

/**
 * Insert or update an opportunity record.
 * Updates updated_at on conflict.
 */
export function upsertOpportunity(input: UpsertOpportunityInput): void {
  const stmt = db.prepare(`
    INSERT INTO opportunities (
      id, notice_id, title, solicitation_number, agency, naics_code,
      type, posted_date, response_deadline, archive_date, description,
      active, url, attachments_json, raw_json, updated_at
    ) VALUES (
      @id, @notice_id, @title, @solicitation_number, @agency, @naics_code,
      @type, @posted_date, @response_deadline, @archive_date, @description,
      @active, @url, @attachments_json, @raw_json, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
    ON CONFLICT(id) DO UPDATE SET
      notice_id            = excluded.notice_id,
      title                = excluded.title,
      solicitation_number  = excluded.solicitation_number,
      agency               = excluded.agency,
      naics_code           = excluded.naics_code,
      type                 = excluded.type,
      posted_date          = excluded.posted_date,
      response_deadline    = excluded.response_deadline,
      archive_date         = excluded.archive_date,
      description          = excluded.description,
      active               = excluded.active,
      url                  = excluded.url,
      attachments_json     = excluded.attachments_json,
      raw_json             = excluded.raw_json,
      updated_at           = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `);

  stmt.run({
    id: input.id,
    notice_id: input.notice_id ?? null,
    title: input.title,
    solicitation_number: input.solicitation_number ?? null,
    agency: input.agency ?? null,
    naics_code: input.naics_code ?? null,
    type: input.type ?? null,
    posted_date: input.posted_date ?? null,
    response_deadline: input.response_deadline ?? null,
    archive_date: input.archive_date ?? null,
    description: input.description ?? null,
    active: input.active ?? 1,
    url: input.url ?? null,
    attachments_json: input.attachments_json ?? null,
    raw_json: input.raw_json ?? null,
  });
}

/**
 * List opportunities with optional filters.
 */
export function listOpportunities(
  options: ListOpportunitiesOptions = {}
): OpportunityRow[] {
  const { activeOnly = true, naicsCode, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: Record<string, string | number> = { limit, offset };

  if (activeOnly) {
    conditions.push('active = 1');
  }
  if (naicsCode) {
    conditions.push('naics_code = @naicsCode');
    params['naicsCode'] = naicsCode;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare<typeof params, OpportunityRow>(`
    SELECT * FROM opportunities
    ${where}
    ORDER BY response_deadline ASC
    LIMIT @limit OFFSET @offset
  `);

  return stmt.all(params);
}

/**
 * Count total opportunities matching filters.
 */
export function countOpportunities(options: ListOpportunitiesOptions = {}): number {
  const { activeOnly = true, naicsCode } = options;

  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (activeOnly) {
    conditions.push('active = 1');
  }
  if (naicsCode) {
    conditions.push('naics_code = @naicsCode');
    params['naicsCode'] = naicsCode;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare<typeof params, { count: number }>(
    `SELECT COUNT(*) as count FROM opportunities ${where}`
  );
  const row = stmt.get(params);
  return row?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// Past Performance helpers
// ─────────────────────────────────────────────────────────────

/**
 * Insert or update a past performance reference record.
 */
export function savePastPerformance(input: SavePastPerformanceInput): void {
  const stmt = db.prepare(`
    INSERT INTO past_performance (
      id, client_name, project_name, value_usd,
      start_date, end_date, description, naics_code
    ) VALUES (
      @id, @client_name, @project_name, @value_usd,
      @start_date, @end_date, @description, @naics_code
    )
    ON CONFLICT(id) DO UPDATE SET
      client_name  = excluded.client_name,
      project_name = excluded.project_name,
      value_usd    = excluded.value_usd,
      start_date   = excluded.start_date,
      end_date     = excluded.end_date,
      description  = excluded.description,
      naics_code   = excluded.naics_code
  `);

  stmt.run({
    id: input.id,
    client_name: input.client_name,
    project_name: input.project_name,
    value_usd: input.value_usd ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    description: input.description ?? null,
    naics_code: input.naics_code ?? null,
  });
}

/**
 * Retrieve all past performance references, ordered by contract value descending.
 */
export function listPastPerformance(): PastPerformanceRow[] {
  const stmt = db.prepare<[], PastPerformanceRow>(
    'SELECT * FROM past_performance ORDER BY value_usd DESC'
  );
  return stmt.all();
}

/**
 * Retrieve a single past performance record by id.
 */
export function getPastPerformance(id: string): PastPerformanceRow | undefined {
  const stmt = db.prepare<[string], PastPerformanceRow>(
    'SELECT * FROM past_performance WHERE id = ?'
  );
  return stmt.get(id);
}

// ─────────────────────────────────────────────────────────────
// Deadline helpers
// ─────────────────────────────────────────────────────────────

/**
 * List all upcoming deadlines (deadline_date >= today) with alert_sent = 0.
 */
export function listPendingDeadlines(): DeadlineRow[] {
  const stmt = db.prepare<[], DeadlineRow>(`
    SELECT * FROM deadlines
    WHERE alert_sent = 0
      AND deadline_date >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    ORDER BY deadline_date ASC
  `);
  return stmt.all();
}

/**
 * Mark a deadline alert as sent.
 */
export function markDeadlineAlertSent(id: string): void {
  const stmt = db.prepare('UPDATE deadlines SET alert_sent = 1 WHERE id = ?');
  stmt.run(id);
}
