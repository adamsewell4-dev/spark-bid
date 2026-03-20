/**
 * src/proposals/proposalGenerator.ts
 *
 * AI proposal drafting engine for Spark Bid.
 *
 * Loads the opportunity, compliance requirements, and past performance from
 * the database, then calls the Anthropic Claude API to generate a full
 * government-contractor proposal for Digital Spark Studios.
 *
 * The generated proposal is saved to the `proposals` table with status='draft'.
 *
 * Log format: [TIMESTAMP] [proposals] [ACTION] [STATUS]
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { db, getOpportunity } from '../db/index.js';
import type { OpportunityRow, PastPerformanceRow } from '../db/index.js';
import { generateChecklist } from '../compliance/index.js';
import { formatChecklistAsText } from '../compliance/index.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ProposalDraft {
  opportunityId: string;
  title: string;
  content: string;
  generatedAt: string;
  tokensUsed: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
// DSS Company Profile (hardcoded — do not read files at runtime)
// ─────────────────────────────────────────────────────────────

const DSS_SYSTEM_PROMPT = `You are a senior proposal writer for Digital Spark Studios (DSS), a professional video production company and active GSA Schedule holder. You write winning federal government proposals in a professional, confident, government-contractor register.

## Company Profile — Digital Spark Studios (DSS)

**Identity**
- Company: Digital Spark Studios | Est. 2015 | Charlotte, NC area
- Founders: Adam Sewell (Executive Producer), Joshua Hieber (Executive Director)
- W2 Staff: 3 full-time employees + vetted freelance network
- GSA Schedule SIN: 512110 — Motion Picture and Video Production (NAICS 512110)

**Core Services**
- Pre-production: concept development, scriptwriting, storyboarding, location scouting
- Production: HD/4K filming, drone cinematography (FAA Part 107 certified), live-action
- Post-production: editing, color grading, sound design, motion graphics
- Animation: 2D and 3D (Adobe After Effects, Cinema 4D, 3DS MAX)
- Training & Educational Video: instructional content, curriculum-based modules
- Documentary & Storytelling: brand anthems, narrative campaigns

**Tools & Technology**
- Editing: Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro
- Animation: Adobe After Effects, Cinema 4D, 3DS MAX
- Project Management: ClickUp | Finance: QuickBooks Online

**Competitive Differentiators**
- End-to-end production (ideation through delivery — no handoffs)
- Award-winning directors, cinematographers, and editors
- FAA Part 107 certified drone operators on staff
- 50+ years combined team experience
- Adobe Certified Professionals on staff
- Subcontractors perform less than 50% of work (FAR 52.219-14 compliant)

**Verified Past Performance References**
1. Carnegie Mellon University — Brand Anthem campaign — $436,390 — March–July 2023
2. Atlas Copco — Training and product video retainer — $120,000 — May–November 2022
3. SleepMe — Commercial advertising spots — $137,000 — April–June 2024
4. Qworky — Training video modules (on-location) — $80,065 — February–April 2023

**Quality Control Process**
- Pre-Production: client consultation, script/storyboard approval, equipment readiness checks
- Production: on-set supervisors, regular footage review, lighting/audio/framing checks
- Post-Production: multi-cycle editing review, color grading + audio mastering, client approval before delivery
- Responsible personnel: Joshua Hieber (Executive Director) + Adam Sewell (Executive Producer)

**Key Personnel**
- Joshua Hieber — Executive Director (Primary Point of Contact for all federal engagements)
- Adam Sewell — Executive Producer (Backup Point of Contact)

**Compliance Standing**
- SAM.gov registration: active
- Annual representations and certifications: current
- Subcontractor limitation: compliant with FAR 52.219-14 (subcontractors perform <50% of work)

## Proposal Writing Rules

- Write in first-person plural: "Digital Spark Studios will deliver..."
- Professional, confident, government-contractor register
- Avoid marketing hyperbole — GSA reviewers respond to specifics
- Define acronyms on first use (FAR, NAICS, SOW, PWS, etc.)
- Never invent capabilities or certifications DSS does not hold
- Never fabricate past performance — use only the four verified references above
- Flag any requirement DSS cannot meet — do not fabricate coverage
- Include the subcontractor note when relevant: "Subcontractors will perform less than 50% of total work in compliance with FAR 52.219-14"
- FAA Part 107 drone certification applies only when aerial work is in scope

## Required Proposal Sections (produce in this exact order)

1. **Executive Summary** — 1–2 paragraphs restating the requirement and DSS's fit
2. **Technical Approach** — How DSS will execute the specific work requested
3. **Management Plan** — Joshua Hieber as Primary POC, Adam Sewell as backup; quality control process
4. **Past Performance** — Draw from the four verified references; match to the RFP type
5. **Pricing Narrative** — Structure and approach only; never include dollar amounts
6. **Compliance Matrix** — One row per stated RFP mandatory requirement, with DSS response`;

// ─────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────

function buildUserPrompt(
  opportunity: OpportunityRow,
  checklistText: string,
  pastPerformance: PastPerformanceRow[]
): string {
  const ppSummary = pastPerformance
    .map(
      (p) =>
        `- ${p.client_name}: ${p.project_name}` +
        (p.value_usd !== null ? ` ($${p.value_usd.toLocaleString()})` : '') +
        (p.start_date && p.end_date ? ` | ${p.start_date} – ${p.end_date}` : '') +
        (p.description ? ` | ${p.description}` : '')
    )
    .join('\n');

  return `Generate a complete federal government proposal for the following opportunity.

## OPPORTUNITY DETAILS

Title: ${opportunity.title}
Solicitation Number: ${opportunity.solicitation_number ?? 'Not provided'}
Agency: ${opportunity.agency ?? 'Not provided'}
NAICS Code: ${opportunity.naics_code ?? 'Not provided'}
Posted Date: ${opportunity.posted_date ?? 'Not provided'}
Response Deadline: ${opportunity.response_deadline ?? 'Not provided'}
Description:
${opportunity.description ?? 'No description available.'}

## PAST PERFORMANCE REFERENCES (from database)

${ppSummary.length > 0 ? ppSummary : 'No past performance records found.'}

## COMPLIANCE CHECKLIST

${checklistText}

## INSTRUCTIONS

Write a complete, professional proposal following all required sections in order:
1. Executive Summary
2. Technical Approach
3. Management Plan
4. Past Performance
5. Pricing Narrative (structure only — no dollar amounts)
6. Compliance Matrix

For the Compliance Matrix, produce a table (or clearly formatted list) with one row per mandatory requirement from the checklist above, showing: Requirement | DSS Response | Met (Yes/No/Partial).

Tailor the Technical Approach and Past Performance sections specifically to the opportunity described above. Do not use generic filler language.`;
}

// ─────────────────────────────────────────────────────────────
// DB persistence
// ─────────────────────────────────────────────────────────────

function saveProposalToDB(
  opportunityId: string,
  content: string,
  title: string
): string {
  const id = randomUUID();
  const contentJson = JSON.stringify({
    sections: content,
    raw: content,
  });

  const stmt = db.prepare(`
    INSERT INTO proposals (id, opportunity_id, status, content_json, created_at, updated_at)
    VALUES (
      @id,
      @opportunity_id,
      'draft',
      @content_json,
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
  `);

  stmt.run({ id, opportunity_id: opportunityId, content_json: contentJson });
  return id;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a full proposal draft for the given opportunity using the
 * Anthropic Claude API.
 *
 * Steps:
 *  1. Validate ANTHROPIC_API_KEY is present.
 *  2. Load the opportunity from the database.
 *  3. Generate the compliance checklist (requires parser to have run first).
 *  4. Load all past performance references from the database.
 *  5. Call Claude API (claude-sonnet-4-20250514, max_tokens=8000).
 *  6. Persist the draft to the `proposals` table.
 *  7. Return the ProposalDraft.
 *
 * @param opportunityId - Primary key of the opportunity to generate a proposal for.
 */
export async function generateProposal(
  opportunityId: string
): Promise<ProposalDraft> {
  // ── Step 1: Validate API key ──────────────────────────────
  if (!config.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Please add it to your .env file. ' +
        'You can get an API key at https://console.anthropic.com/.'
    );
  }

  console.log(
    `[${ts()}] [proposals] [generate] [starting — opportunity=${opportunityId}]`
  );

  // ── Step 2: Load opportunity ──────────────────────────────
  console.log(`[${ts()}] [proposals] [load-opportunity] [fetching from DB]`);

  const opportunity = getOpportunity(opportunityId);
  if (!opportunity) {
    throw new Error(
      `Opportunity "${opportunityId}" was not found in the database. ` +
        `Make sure you have run the SAM.gov monitor to fetch this opportunity first.`
    );
  }

  console.log(
    `[${ts()}] [proposals] [load-opportunity] [found: "${opportunity.title}"]`
  );

  // ── Step 3: Generate compliance checklist ─────────────────
  console.log(
    `[${ts()}] [proposals] [load-checklist] [generating compliance checklist]`
  );

  let checklistText: string;
  try {
    const checklist = generateChecklist(opportunityId);
    checklistText = formatChecklistAsText(checklist);
    console.log(
      `[${ts()}] [proposals] [load-checklist] [success — checklist generated]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not generate compliance checklist: ${message} ` +
        `Run the parser before generating a proposal.`
    );
  }

  // ── Step 4: Load past performance ─────────────────────────
  console.log(
    `[${ts()}] [proposals] [load-past-performance] [fetching all references from DB]`
  );

  const ppStmt = db.prepare<[], PastPerformanceRow>(
    'SELECT * FROM past_performance ORDER BY value_usd DESC'
  );
  const pastPerformance = ppStmt.all();

  console.log(
    `[${ts()}] [proposals] [load-past-performance] [found ${pastPerformance.length} references]`
  );

  // ── Step 5: Call Claude API ───────────────────────────────
  console.log(
    `[${ts()}] [proposals] [claude-api] [calling claude-sonnet-4-20250514 — max_tokens=8000]`
  );

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  let content: string;
  let tokensUsed: number;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      stream: false,
      system: DSS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(opportunity, checklistText, pastPerformance),
        },
      ],
    });

    const firstBlock = message.content[0];
    if (!firstBlock || firstBlock.type !== 'text') {
      throw new Error(
        'The AI returned an empty or unexpected response. Please try again.'
      );
    }

    content = firstBlock.text;
    tokensUsed =
      (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);

    console.log(
      `[${ts()}] [proposals] [claude-api] [success — ${tokensUsed} tokens used ` +
        `(${message.usage.input_tokens} in / ${message.usage.output_tokens} out)]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [proposals] [claude-api] [failed — ${message}]`
    );
    throw new Error(
      `Proposal generation failed: ${message}. ` +
        `Check your ANTHROPIC_API_KEY and internet connection, then try again.`
    );
  }

  // ── Step 6: Save to database ──────────────────────────────
  console.log(
    `[${ts()}] [proposals] [save-to-db] [persisting draft proposal]`
  );

  let proposalId: string;
  try {
    proposalId = saveProposalToDB(opportunityId, content, opportunity.title);
    console.log(
      `[${ts()}] [proposals] [save-to-db] [success — proposal id=${proposalId} status=draft]`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${ts()}] [proposals] [save-to-db] [failed — ${message}]`
    );
    // Non-fatal: return the draft even if DB write fails
    console.warn(
      `[${ts()}] [proposals] [save-to-db] [warning — draft not persisted to DB but returning content]`
    );
    proposalId = randomUUID();
  }

  const draft: ProposalDraft = {
    opportunityId,
    title: opportunity.title,
    content,
    generatedAt: new Date().toISOString(),
    tokensUsed,
  };

  console.log(
    `[${ts()}] [proposals] [generate] [complete — proposal ready for opportunity=${opportunityId}]`
  );

  return draft;
}
