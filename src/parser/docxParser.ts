/**
 * src/parser/docxParser.ts
 *
 * Extracts plain text from a DOCX buffer using the `mammoth` library.
 *
 * Log format: [TIMESTAMP] [parser] [docx] [STATUS]
 */

import mammoth from 'mammoth';
import type { ParsedDocument } from './pdfParser.js';

export type { ParsedDocument };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

/**
 * Clean extracted text:
 * - Normalize line endings
 * - Collapse runs of blank lines
 * - Trim each line and the full string
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
 * Parse a DOCX buffer and return structured text.
 *
 * pageCount is always 0 for DOCX files — mammoth does not report pages.
 *
 * @param buffer - Raw DOCX file contents
 * @param source - URL or filename (used for logging and returned in result)
 */
export async function parseDocx(
  buffer: Buffer,
  source: string
): Promise<ParsedDocument> {
  console.log(`[${ts()}] [parser] [docx] [parsing — ${source}]`);

  // mammoth expects an object with a `buffer` property
  const result = await mammoth.extractRawText({ buffer });

  if (result.messages.length > 0) {
    for (const msg of result.messages) {
      console.warn(
        `[${ts()}] [parser] [docx] [warning — ${source} — ${msg.message}]`
      );
    }
  }

  const text = cleanText(result.value);

  console.log(
    `[${ts()}] [parser] [docx] [success — ${source} — ${text.length} chars]`
  );

  return { text, pageCount: 0, source };
}
