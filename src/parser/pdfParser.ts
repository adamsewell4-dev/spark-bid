/**
 * src/parser/pdfParser.ts
 *
 * Extracts plain text from a PDF buffer using the `pdf-parse` library.
 *
 * Log format: [TIMESTAMP] [parser] [pdf] [STATUS]
 */

import pdfParse from 'pdf-parse';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ParsedDocument {
  /** Full cleaned text extracted from the document */
  text: string;
  /** Number of pages (0 for DOCX — not applicable) */
  pageCount: number;
  /** Original source identifier (URL or filename) */
  source: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

/**
 * Clean extracted text:
 * - Normalize all line endings to \n
 * - Collapse runs of 3+ blank lines into a single blank line
 * - Trim leading/trailing whitespace on each line
 * - Trim the overall string
 */
function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Parse a PDF buffer and return structured text with metadata.
 *
 * @param buffer - Raw PDF file contents
 * @param source - URL or filename (used for logging and returned in result)
 */
export async function parsePdf(
  buffer: Buffer,
  source: string
): Promise<ParsedDocument> {
  console.log(`[${ts()}] [parser] [pdf] [parsing — ${source}]`);

  const result = await pdfParse(buffer);

  const text = cleanText(result.text);
  const pageCount = result.numpages;

  console.log(
    `[${ts()}] [parser] [pdf] [success — ${source} — ${pageCount} page(s) ${text.length} chars]`
  );

  return { text, pageCount, source };
}
