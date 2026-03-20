/**
 * src/compliance/checklistGenerator.ts
 *
 * Generates a structured compliance checklist for a given opportunity by loading
 * extracted requirements from the `requirements` table and enriching them with
 * the standard government compliance items defined in checklistTemplates.ts.
 *
 * Log format: [TIMESTAMP] [compliance] [checklist] [STATUS]
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { STANDARD_COMPLIANCE_ITEMS } from './checklistTemplates.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  requirementText: string;
  category: string;
  met: boolean;
  notes: string | null;
}

export interface ComplianceChecklist {
  opportunityId: string;
  mandatory: ChecklistItem[];
  submission: ChecklistItem[];
  evaluation: ChecklistItem[];
  concern: ChecklistItem[];
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// DB row type
// ─────────────────────────────────────────────────────────────

interface RequirementRow {
  id: string;
  opportunity_id: string;
  requirement_text: string;
  category: string | null;
  met: number;
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function rowToItem(row: RequirementRow): ChecklistItem {
  return {
    id: row.id,
    requirementText: row.requirement_text,
    category: row.category ?? 'mandatory',
    met: row.met === 1,
    notes: row.notes,
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a compliance checklist for the given opportunity.
 *
 * Loads all requirements from the `requirements` table and groups them by
 * category. Standard government compliance items are prepended to the
 * mandatory and submission buckets automatically.
 *
 * Throws a human-readable error if no requirements exist yet (i.e., the
 * parser has not been run for this opportunity).
 *
 * @param opportunityId - The opportunity primary key to look up requirements for.
 */
export function generateChecklist(opportunityId: string): ComplianceChecklist {
  console.log(
    `[${ts()}] [compliance] [checklist] [loading requirements for opportunity=${opportunityId}]`
  );

  const stmt = db.prepare<[string], RequirementRow>(
    'SELECT * FROM requirements WHERE opportunity_id = ? ORDER BY created_at ASC'
  );
  const rows = stmt.all(opportunityId);

  if (rows.length === 0) {
    throw new Error(
      `No requirements found for opportunity "${opportunityId}". ` +
        `Please run the RFP parser first (npm run parse-opportunity -- ${opportunityId}) ` +
        `to extract requirements before generating a compliance checklist.`
    );
  }

  console.log(
    `[${ts()}] [compliance] [checklist] [found ${rows.length} requirements from DB]`
  );

  // Build the four category buckets from DB rows
  const mandatory: ChecklistItem[] = [];
  const submission: ChecklistItem[] = [];
  const evaluation: ChecklistItem[] = [];
  const concern: ChecklistItem[] = [];

  for (const row of rows) {
    const item = rowToItem(row);
    switch (row.category) {
      case 'mandatory':
        mandatory.push(item);
        break;
      case 'submission':
        submission.push(item);
        break;
      case 'evaluation':
        evaluation.push(item);
        break;
      case 'concern':
        concern.push(item);
        break;
      default:
        // Unknown category falls into mandatory as a safe default
        mandatory.push(item);
    }
  }

  // Prepend standard compliance items (they always get fresh UUIDs so they
  // don't conflict with DB-persisted rows)
  for (const standard of STANDARD_COMPLIANCE_ITEMS) {
    const item: ChecklistItem = {
      id: randomUUID(),
      requirementText: standard.text,
      category: standard.category,
      met: true, // DSS meets all standard items by default
      notes: 'Standard government compliance item — applies to all federal solicitations.',
    };
    if (standard.category === 'mandatory') {
      mandatory.unshift(item);
    } else {
      submission.unshift(item);
    }
  }

  const checklist: ComplianceChecklist = {
    opportunityId,
    mandatory,
    submission,
    evaluation,
    concern,
    generatedAt: new Date().toISOString(),
  };

  const total =
    mandatory.length + submission.length + evaluation.length + concern.length;

  console.log(
    `[${ts()}] [compliance] [checklist] [success — ${total} items total: ` +
      `${mandatory.length} mandatory, ${submission.length} submission, ` +
      `${evaluation.length} evaluation, ${concern.length} concern]`
  );

  return checklist;
}
