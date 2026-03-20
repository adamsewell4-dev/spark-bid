/**
 * src/proposals/proposalFolder.ts
 *
 * Generates consistent, human-readable folder names for proposal submissions.
 *
 * Format: YYYY-MM-DD — [Agency Short Name] — [Opportunity Title]
 * Example: 2026-03-20 — Library of Congress — Veterans History Project Anniversary Film
 */

import { join } from 'node:path';

const PROPOSALS_ROOT = 'data/proposals';
const MAX_SEGMENT_LENGTH = 60;

/**
 * Sanitize a string for use as a folder name component.
 * Removes filesystem-invalid characters and trims to a max length.
 */
function sanitize(str: string, maxLength = MAX_SEGMENT_LENGTH): string {
  return str
    .replace(/[/\\:*?"<>|]/g, '')   // remove filesystem-invalid chars
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
    .slice(0, maxLength)
    .trim();
}

/**
 * Extract the short agency name from a SAM.gov agency hierarchy string.
 * SAM.gov uses dot-separated hierarchy like:
 *   "DEPT OF DEFENSE.DEPT OF THE ARMY.NATIONAL GUARD BUREAU..."
 *
 * We use the last meaningful segment, title-cased.
 */
function agencyShortName(fullAgency: string): string {
  const segments = fullAgency.split('.').map((s) => s.trim()).filter(Boolean);

  // Prefer the second segment (agency level) if it's short enough
  const preferred = segments[1] ?? segments[0] ?? fullAgency;

  // Title-case it
  const titled = preferred
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bAnd\b/g, 'and');

  return sanitize(titled, 40);
}

/**
 * Generate a folder name for a proposal.
 *
 * @param title - The opportunity title
 * @param agency - The full SAM.gov agency string
 * @param date - ISO date string or Date object (defaults to today)
 */
export function proposalFolderName(
  title: string,
  agency: string,
  date?: string | Date
): string {
  const d = date ? new Date(date) : new Date();
  const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD

  const agencyStr = agencyShortName(agency);
  const titleStr = sanitize(title, 60);

  return `${dateStr} — ${agencyStr} — ${titleStr}`;
}

/**
 * Get the full absolute folder path for a proposal.
 */
export function proposalFolderPath(
  title: string,
  agency: string,
  date?: string | Date,
  projectRoot = process.cwd()
): string {
  return join(projectRoot, PROPOSALS_ROOT, proposalFolderName(title, agency, date));
}
