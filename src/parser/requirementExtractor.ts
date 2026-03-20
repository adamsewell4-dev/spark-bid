/**
 * src/parser/requirementExtractor.ts
 *
 * Uses the Anthropic Claude API to extract structured compliance requirements
 * from the combined text of all RFP documents for an opportunity.
 *
 * Requirements are saved to the `requirements` table in SQLite.
 *
 * Only runs when ANTHROPIC_API_KEY is configured — returns [] with a
 * warning log if the key is missing.
 *
 * Log format: [TIMESTAMP] [parser] [extractor] [STATUS]
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExtractedRequirement {
  text: string;
  category: 'mandatory' | 'submission' | 'evaluation' | 'concern';
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

const VALID_CATEGORIES = new Set<string>([
  'mandatory',
  'submission',
  'evaluation',
  'concern',
]);

function isValidCategory(
  value: string
): value is ExtractedRequirement['category'] {
  return VALID_CATEGORIES.has(value);
}

// ─────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────

function buildPrompt(fullText: string): string {
  return `You are a government contracting specialist reviewing an RFP on behalf of Digital Spark Studios (DSS), a video production company (NAICS 512110) based in Charlotte, NC.

Your task is to extract structured requirements from the RFP text below.

Classify each requirement into one of these four categories:

1. **mandatory** — Requirements using SHALL, MUST, REQUIRED, or similarly binding language that the vendor must fulfill to be eligible.
2. **submission** — Requirements about how the proposal must be formatted or submitted (page limits, file formats, due dates, number of copies, font sizes, etc.).
3. **evaluation** — Criteria the government will use to score or rank proposals (technical approach, past performance, price, etc.).
4. **concern** — Any requirement that Digital Spark Studios may have difficulty meeting (e.g., security clearances, specific certifications DSS does not hold, staffing minimums, geographic restrictions, or scope outside video production).

Return ONLY a JSON array. Each element must be an object with exactly two keys:
- "text": a concise, plain-English statement of the requirement (1–3 sentences max)
- "category": one of "mandatory", "submission", "evaluation", or "concern"

Do not include any explanation, preamble, or markdown — only the raw JSON array.

If there are no requirements in a given category, simply omit those items.

RFP TEXT:
---
${fullText.slice(0, 90_000)}
---`;
}

// ─────────────────────────────────────────────────────────────
// DB persistence
// ─────────────────────────────────────────────────────────────

const insertRequirement = db.prepare(`
  INSERT INTO requirements (id, opportunity_id, requirement_text, category, met, notes, created_at)
  VALUES (@id, @opportunity_id, @requirement_text, @category, @met, @notes, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  ON CONFLICT(id) DO NOTHING
`);

function saveRequirements(
  opportunityId: string,
  requirements: ExtractedRequirement[]
): void {
  const insert = db.transaction(() => {
    for (const req of requirements) {
      insertRequirement.run({
        id: randomUUID(),
        opportunity_id: opportunityId,
        requirement_text: req.text,
        category: req.category,
        met: 0,
        notes: null,
      });
    }
  });
  insert();
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Extract structured requirements from the full combined RFP text.
 *
 * Results are persisted to the `requirements` table.
 * Returns an empty array (with a warning) if ANTHROPIC_API_KEY is not set.
 *
 * @param opportunityId - Used for DB persistence and logging
 * @param fullText      - Combined text from all parsed RFP documents
 */
export async function extractRequirements(
  opportunityId: string,
  fullText: string
): Promise<ExtractedRequirement[]> {
  if (!config.anthropicApiKey) {
    console.warn(
      `[${ts()}] [parser] [extractor] [skipped — ANTHROPIC_API_KEY is not set. ` +
        `Add it to your .env file to enable requirement extraction.]`
    );
    return [];
  }

  if (fullText.trim().length === 0) {
    console.warn(
      `[${ts()}] [parser] [extractor] [skipped — no text to analyze for opportunity=${opportunityId}]`
    );
    return [];
  }

  console.log(
    `[${ts()}] [parser] [extractor] [starting — opportunity=${opportunityId} text=${fullText.length} chars]`
  );

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  let raw: string;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: buildPrompt(fullText),
        },
      ],
    });

    const firstBlock = message.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      throw new Error(
        'The AI response was empty or in an unexpected format. Please try again.'
      );
    }
    raw = firstBlock.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [parser] [extractor] [failed — Claude API error — ${message}]`
    );
    throw new Error(
      `Requirement extraction failed: ${message}. ` +
        `Check your ANTHROPIC_API_KEY and internet connection.`
    );
  }

  // Parse the JSON response
  let parsed: unknown;
  try {
    // Strip any accidental markdown code fences
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(
      `[${ts()}] [parser] [extractor] [failed — could not parse Claude response as JSON]`
    );
    throw new Error(
      'The AI returned an unreadable response. This is usually a temporary issue — please try again.'
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'The AI returned an unexpected response format. Please try again.'
    );
  }

  // Validate and filter each entry
  const requirements: ExtractedRequirement[] = [];

  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'text' in item &&
      'category' in item &&
      typeof (item as Record<string, unknown>)['text'] === 'string' &&
      typeof (item as Record<string, unknown>)['category'] === 'string' &&
      isValidCategory((item as Record<string, unknown>)['category'] as string)
    ) {
      const typed = item as { text: string; category: string };
      requirements.push({
        text: typed.text,
        category: typed.category as ExtractedRequirement['category'],
      });
    }
  }

  console.log(
    `[${ts()}] [parser] [extractor] [success — ${requirements.length} requirements extracted — opportunity=${opportunityId}]`
  );

  // Persist to database
  try {
    saveRequirements(opportunityId, requirements);
    console.log(
      `[${ts()}] [parser] [extractor] [saved ${requirements.length} requirements to database]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [parser] [extractor] [db write failed — ${message}]`
    );
    // Non-fatal: return requirements even if DB write fails
  }

  return requirements;
}
