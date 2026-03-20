/**
 * scripts/export-proposal-docx.ts
 *
 * Export a saved proposal as both a .docx (for editing) and .pdf (for submission).
 * Always saves into an organized named folder under data/proposals/.
 *
 * Usage:
 *   npx tsx scripts/export-proposal-docx.ts <opportunity-id>
 */

import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { db } from '../src/db/index.js';
import type { OpportunityRow } from '../src/db/index.js';
import { exportProposalToDocx } from '../src/proposals/docxExporter.js';
import { exportProposalToPdf } from '../src/proposals/pdfExporter.js';
import { proposalFolderName } from '../src/proposals/proposalFolder.js';

const arg = process.argv[2];

if (!arg) {
  console.error('Usage: npx tsx scripts/export-proposal-docx.ts <opportunity-id>');
  process.exit(1);
}

// ── Find the proposal markdown ────────────────────────────────────────────────

function findMarkdown(opportunityId: string): string | null {
  const root = resolve('data/proposals');

  // 1. New structure: subfolder containing proposal.md that mentions the ID
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mdPath = join(root, entry.name, 'proposal.md');
      if (existsSync(mdPath) && readFileSync(mdPath, 'utf-8').includes(opportunityId)) {
        return mdPath;
      }
    }
  }

  // 2. Legacy flat file
  const legacy = resolve(`data/proposals/${opportunityId}.md`);
  if (existsSync(legacy)) return legacy;

  return null;
}

const mdPath = findMarkdown(arg);

if (!mdPath) {
  console.error(`No proposal found for opportunity: ${arg}`);
  console.error('Run first: npx tsx scripts/generate-proposal.ts ' + arg);
  process.exit(1);
}

const markdown = readFileSync(mdPath, 'utf-8');

// ── Look up opportunity from DB for folder naming ─────────────────────────────

const opp = db.prepare<[string], OpportunityRow>(
  'SELECT * FROM opportunities WHERE id = ?'
).get(arg) as OpportunityRow | undefined;

// Fall back to extracting from markdown if DB is empty
const titleFromMd = markdown.match(/^## (.+)$/m)?.[1]?.trim()
  ?? markdown.match(/^# Digital Spark Studios Proposal\n## (.+)$/m)?.[1]?.trim();
const agencyFromMd = markdown.match(/\*\*(LIBRARY|DEPT|VETERANS|HEALTH|STATE|INTERIOR|HOMELAND)[^*]+\*\*/i)?.[1];

const title = opp?.title ?? titleFromMd ?? arg;
const agency = opp?.agency ?? agencyFromMd ?? 'Federal Agency';
const createdAt = new Date().toISOString();

// ── Build the organized folder ────────────────────────────────────────────────

const folderName = proposalFolderName(title, agency, createdAt);
const folderPath = resolve('data/proposals', folderName);
mkdirSync(folderPath, { recursive: true });

// ── Extract solicitation number from markdown ─────────────────────────────────

const solMatch = markdown.match(/\*\*Solicitation Number:\*\*\s*(.+)/);
const solicitationNumber = solMatch?.[1]?.trim() ?? 'See RFP';

const docxPath = join(folderPath, 'proposal.docx');
const pdfPath = join(folderPath, 'proposal.pdf');
const mdDestPath = join(folderPath, 'proposal.md');

// Copy proposal.md into the folder if it isn't there already
if (resolve(mdPath) !== resolve(mdDestPath)) {
  mkdirSync(folderPath, { recursive: true });
  const { copyFileSync } = await import('node:fs');
  copyFileSync(mdPath, mdDestPath);
}

console.log(`\nExporting proposal:`);
console.log(`  Title:  ${title}`);
console.log(`  Sol #:  ${solicitationNumber}`);
console.log(`  Folder: ${folderPath}\n`);

async function run() {
  process.stdout.write('  Generating Word document (.docx)...     ');
  await exportProposalToDocx({
    opportunityId: arg,
    title,
    agency,
    solicitationNumber,
    markdownContent: markdown,
    outputPath: docxPath,
  });
  console.log('done');

  process.stdout.write('  Generating PDF (~10 seconds)...         ');
  await exportProposalToPdf({
    title,
    agency,
    solicitationNumber,
    markdownContent: markdown,
    outputPath: pdfPath,
  });
  console.log('done');

  console.log('\n────────────────────────────────────────────────────');
  console.log('Exports complete:');
  console.log(`  Word (edit/review): proposal.docx`);
  console.log(`  PDF  (submission):  proposal.pdf`);
  console.log(`\n  Folder: ${folderPath}`);
  console.log('────────────────────────────────────────────────────\n');
  console.log('Review the Word doc, make any edits, then submit the PDF.');
}

run().catch((err) => {
  console.error('\nExport failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
