/**
 * src/parser/index.ts
 *
 * Parser orchestrator for Spark Bid — Module 2.
 *
 * Steps for each opportunity:
 *   1. Load opportunity record from the database
 *   2. Parse attachments_json to get attachment URLs
 *   3. Download all attachment files (PDF, DOCX)
 *   4. Extract text from each file based on type
 *   5. Combine all extracted text
 *   6. Run AI-powered requirement extraction
 *   7. Return a ParseResult summary
 *
 * Log format: [TIMESTAMP] [parser] [ACTION] [STATUS]
 */

import path from 'node:path';
import { getOpportunity } from '../db/index.js';
import { downloadAttachments } from './documentDownloader.js';
import { parsePdf } from './pdfParser.js';
import { parseDocx } from './docxParser.js';
import { extractRequirements } from './requirementExtractor.js';
import type { DownloadedFile } from './documentDownloader.js';
import type { ExtractedRequirement } from './requirementExtractor.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ParseResult {
  opportunityId: string;
  filesProcessed: number;
  totalText: string;
  requirements: ExtractedRequirement[];
  errors: string[];
}

// Re-export for consumers
export type { ExtractedRequirement };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

/**
 * Detect file type from magic bytes in the buffer.
 * SAM.gov always returns application/octet-stream so we can't trust the MIME type.
 *   PDF:  starts with %PDF  → bytes 25 50 44 46
 *   DOCX: starts with PK    → bytes 50 4B (ZIP format)
 */
function detectFileTypeFromBytes(buffer: Buffer): 'pdf' | 'docx' | null {
  if (buffer.length < 4) return null;

  // PDF magic bytes: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }

  // ZIP/DOCX magic bytes: PK (DOCX is a ZIP)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'docx';
  }

  return null;
}

/**
 * Decide which parser to use — first by magic bytes, then MIME type, then extension.
 * Returns 'pdf', 'docx', or null (unsupported).
 */
function resolveFileType(
  mimeType: string,
  filename: string,
  buffer: Buffer
): 'pdf' | 'docx' | null {
  // Magic bytes are most reliable (SAM.gov always sends application/octet-stream)
  const detected = detectFileTypeFromBytes(buffer);
  if (detected !== null) return detected;

  const mime = mimeType.toLowerCase();
  const ext = path.extname(filename).toLowerCase();

  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  ) {
    return 'docx';
  }

  return null;
}

/**
 * Parse attachments_json into an array of URL strings.
 * Handles both plain string arrays and SAM.gov resource link objects ({ url: string }).
 * Returns [] on any parse error.
 */
function parseAttachmentUrls(attachmentsJson: string | null): string[] {
  if (!attachmentsJson || attachmentsJson.trim() === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(attachmentsJson);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const urls: string[] = [];

  for (const item of parsed) {
    if (typeof item === 'string' && item.trim() !== '') {
      urls.push(item.trim());
    } else if (
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      typeof (item as Record<string, unknown>)['url'] === 'string'
    ) {
      const url = ((item as Record<string, unknown>)['url'] as string).trim();
      if (url !== '') urls.push(url);
    }
  }

  return urls;
}

// ─────────────────────────────────────────────────────────────
// File text extraction
// ─────────────────────────────────────────────────────────────

async function extractTextFromFile(
  file: DownloadedFile,
  errors: string[]
): Promise<string> {
  const fileType = resolveFileType(file.mimeType, file.filename, file.buffer);

  if (fileType === null) {
    const msg = `Skipped "${file.filename}" — unsupported file type (${file.mimeType}). Only PDF and DOCX files are supported.`;
    console.warn(`[${ts()}] [parser] [extract] [skipped — ${msg}]`);
    errors.push(msg);
    return '';
  }

  try {
    if (fileType === 'pdf') {
      const result = await parsePdf(file.buffer, file.filename);
      return result.text;
    } else {
      const result = await parseDocx(file.buffer, file.filename);
      return result.text;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const msg = `Could not read "${file.filename}": ${message}`;
    console.error(`[${ts()}] [parser] [extract] [failed — ${msg}]`);
    errors.push(msg);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Parse all RFP documents for a given opportunity.
 *
 * Loads the opportunity from the database, downloads all attachments,
 * extracts text, runs AI requirement extraction, and returns a summary.
 *
 * @param opportunityId - The primary key of the opportunity in the database
 */
export async function parseOpportunity(
  opportunityId: string
): Promise<ParseResult> {
  const errors: string[] = [];

  console.log(
    `[${ts()}] [parser] [parseOpportunity] [starting — opportunity=${opportunityId}]`
  );

  // ── Step 1: Load opportunity from DB ──────────────────────
  const opportunity = getOpportunity(opportunityId);

  if (!opportunity) {
    throw new Error(
      `Opportunity "${opportunityId}" was not found in the database. ` +
        `Make sure the monitor has run and the ID is correct.`
    );
  }

  console.log(
    `[${ts()}] [parser] [parseOpportunity] [loaded — "${opportunity.title}"]`
  );

  // ── Step 2: Parse attachment URLs ─────────────────────────
  const urls = parseAttachmentUrls(opportunity.attachments_json);

  console.log(
    `[${ts()}] [parser] [parseOpportunity] [found ${urls.length} attachment URL(s)]`
  );

  if (urls.length === 0) {
    console.warn(
      `[${ts()}] [parser] [parseOpportunity] [no attachments — opportunity=${opportunityId}. ` +
        `No documents to parse.]`
    );
  }

  // ── Step 3: Download all attachments ──────────────────────
  const downloaded = await downloadAttachments(opportunityId, urls);

  // ── Step 4 & 5: Parse each file and combine text ──────────
  const textParts: string[] = [];
  let filesProcessed = 0;

  for (const file of downloaded) {
    const text = await extractTextFromFile(file, errors);
    if (text.trim().length > 0) {
      textParts.push(`\n\n=== ${file.filename} ===\n\n${text}`);
      filesProcessed++;
    }
  }

  const totalText = textParts.join('\n').trim();

  console.log(
    `[${ts()}] [parser] [parseOpportunity] [extracted text from ${filesProcessed} file(s) — ${totalText.length} total chars]`
  );

  // ── Step 6: Extract requirements via AI ───────────────────
  let requirements: ExtractedRequirement[] = [];

  try {
    requirements = await extractRequirements(opportunityId, totalText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Requirement extraction failed: ${message}`);
    console.error(
      `[${ts()}] [parser] [parseOpportunity] [extractor error — ${message}]`
    );
  }

  // ── Step 7: Return result ─────────────────────────────────
  const result: ParseResult = {
    opportunityId,
    filesProcessed,
    totalText,
    requirements,
    errors,
  };

  console.log(
    `[${ts()}] [parser] [parseOpportunity] [complete — ` +
      `files=${filesProcessed} requirements=${requirements.length} errors=${errors.length} — ` +
      `opportunity=${opportunityId}]`
  );

  return result;
}
