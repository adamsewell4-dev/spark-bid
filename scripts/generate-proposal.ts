/**
 * scripts/generate-proposal.ts
 *
 * End-to-end proposal generation script for Spark Bid.
 *
 * Usage:
 *   npx tsx scripts/generate-proposal.ts [opportunityId]
 *
 * If no opportunity ID is provided, the script finds the first opportunity
 * in the database that has extracted requirements and uses that.
 *
 * Output:
 *   - Prints the first 2000 characters of the proposal to the terminal
 *   - Prints the total tokens used
 *   - Saves the full proposal markdown to: data/proposals/{opportunityId}.md
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db/index.js';
import { getOpportunity } from '../src/db/index.js';
import { generateChecklist } from '../src/compliance/index.js';
import { generateProposal, formatProposalAsMarkdown } from '../src/proposals/index.js';
import { proposalFolderPath } from '../src/proposals/proposalFolder.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─────────────────────────────────────────────────────────────
// Find first opportunity with requirements
// ─────────────────────────────────────────────────────────────

function findFirstOpportunityWithRequirements(): string | undefined {
  const stmt = db.prepare<[], { opportunity_id: string }>(`
    SELECT DISTINCT opportunity_id
    FROM requirements
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const row = stmt.get();
  return row?.opportunity_id;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Resolve opportunity ID ────────────────────────────────
  let opportunityId = process.argv[2];

  if (!opportunityId) {
    console.log(
      `[${ts()}] [generate-proposal] [init] [no opportunity ID provided — searching for first with requirements]`
    );
    opportunityId = findFirstOpportunityWithRequirements();

    if (!opportunityId) {
      console.error(
        `[${ts()}] [generate-proposal] [init] [error — no opportunities with requirements found]\n` +
          `\nTo fix this:\n` +
          `  1. Make sure you have run the SAM.gov monitor:  npm run monitor\n` +
          `  2. Parse an opportunity's RFP documents:        npx tsx scripts/parse-opportunity.ts <id>\n` +
          `  3. Then run this script again.\n`
      );
      process.exit(1);
    }

    console.log(
      `[${ts()}] [generate-proposal] [init] [using opportunity=${opportunityId}]`
    );
  }

  console.log(
    `[${ts()}] [generate-proposal] [start] [opportunity=${opportunityId}]`
  );

  // ── Step 1: Generate checklist (validates requirements exist) ──
  console.log(`[${ts()}] [generate-proposal] [checklist] [generating...]`);

  try {
    const checklist = generateChecklist(opportunityId);
    const total =
      checklist.mandatory.length +
      checklist.submission.length +
      checklist.evaluation.length +
      checklist.concern.length;
    console.log(
      `[${ts()}] [generate-proposal] [checklist] [success — ${total} items across all categories]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [generate-proposal] [checklist] [error — ${message}]`
    );
    process.exit(1);
  }

  // ── Step 2: Generate proposal ─────────────────────────────
  console.log(`[${ts()}] [generate-proposal] [proposal] [generating — this may take 30–60 seconds...]`);

  let draft;
  try {
    draft = await generateProposal(opportunityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [generate-proposal] [proposal] [error — ${message}]`
    );
    process.exit(1);
  }

  // ── Step 3: Save to organized folder ─────────────────────
  const opportunity = getOpportunity(opportunityId);
  const folderPath = proposalFolderPath(
    draft.title,
    opportunity?.agency ?? 'Unknown Agency',
    draft.generatedAt,
    PROJECT_ROOT
  );
  const outputPath = join(folderPath, 'proposal.md');

  console.log(`[${ts()}] [generate-proposal] [save] [writing to ${outputPath}]`);

  try {
    await mkdir(folderPath, { recursive: true });
    const markdown = formatProposalAsMarkdown(draft);
    await writeFile(outputPath, markdown, 'utf-8');
    console.log(
      `[${ts()}] [generate-proposal] [save] [success — saved to ${outputPath}]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [generate-proposal] [save] [error — could not write file — ${message}]`
    );
    // Non-fatal — still print the preview below
  }

  // ── Step 4: Print preview ─────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('PROPOSAL PREVIEW (first 2000 characters)');
  console.log('='.repeat(72));
  console.log(draft.content.slice(0, 2000));

  if (draft.content.length > 2000) {
    console.log(`\n... [${(draft.content.length - 2000).toLocaleString()} more characters]`);
  }

  console.log('='.repeat(72));
  console.log(`Tokens used : ${draft.tokensUsed.toLocaleString()}`);
  console.log(`Generated   : ${draft.generatedAt}`);
  console.log(`Folder      : ${folderPath}`);
  console.log('='.repeat(72) + '\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${ts()}] [generate-proposal] [fatal] [${message}]`);
  process.exit(1);
});
