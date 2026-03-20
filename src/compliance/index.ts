/**
 * src/compliance/index.ts
 *
 * Public API surface for Module 3: Compliance.
 *
 * Re-exports all types and functions, plus a formatChecklistAsText helper
 * for converting a ComplianceChecklist into readable plain text suitable
 * for display in the terminal or as context for AI prompts.
 */

export { generateChecklist } from './checklistGenerator.js';
export type { ChecklistItem, ComplianceChecklist } from './checklistGenerator.js';
export { STANDARD_COMPLIANCE_ITEMS } from './checklistTemplates.js';
export type { StandardComplianceItem } from './checklistTemplates.js';

import type { ChecklistItem, ComplianceChecklist } from './checklistGenerator.js';

// ─────────────────────────────────────────────────────────────
// Formatter
// ─────────────────────────────────────────────────────────────

function formatSection(title: string, items: ChecklistItem[]): string {
  if (items.length === 0) return '';

  const lines: string[] = [`## ${title} (${items.length})\n`];

  for (const item of items) {
    const status = item.met ? '[x]' : '[ ]';
    lines.push(`${status} ${item.requirementText}`);
    if (item.notes) {
      lines.push(`    Notes: ${item.notes}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a ComplianceChecklist as readable plain text.
 *
 * Suitable for terminal display or as context in an AI prompt.
 * Each item shows a checkbox-style indicator ([x] met / [ ] unmet)
 * followed by the requirement text and any notes.
 *
 * @param checklist - The checklist to format.
 * @returns Multi-line string representation of the checklist.
 */
export function formatChecklistAsText(checklist: ComplianceChecklist): string {
  const header = [
    `COMPLIANCE CHECKLIST`,
    `Opportunity: ${checklist.opportunityId}`,
    `Generated:   ${checklist.generatedAt}`,
    ``,
  ].join('\n');

  const sections = [
    formatSection('MANDATORY REQUIREMENTS', checklist.mandatory),
    formatSection('SUBMISSION REQUIREMENTS', checklist.submission),
    formatSection('EVALUATION CRITERIA', checklist.evaluation),
    formatSection('POTENTIAL CONCERNS', checklist.concern),
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const total =
    checklist.mandatory.length +
    checklist.submission.length +
    checklist.evaluation.length +
    checklist.concern.length;

  const metCount = [
    ...checklist.mandatory,
    ...checklist.submission,
    ...checklist.evaluation,
    ...checklist.concern,
  ].filter((i) => i.met).length;

  const footer = `\nTotal: ${total} items | Met: ${metCount} | Unmet/Unknown: ${total - metCount}`;

  return [header, sections, footer].join('\n');
}
