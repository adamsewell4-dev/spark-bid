/**
 * src/commercial/coverLetter.ts
 *
 * Generates a cover letter for a commercial proposal using the confirmed
 * project brief plus the full DSS company knowledge base.
 *
 * Knowledge base: all .md, .txt, and .pdf files in data/company-profile/
 * are loaded at generation time and injected into the system prompt so
 * Claude understands DSS's voice, services, and positioning.
 *
 * Cover letter structure: 4 paragraphs
 *   1. Warm acknowledgment of the conversation and the client's world
 *   2. What the client is working toward and why it matters
 *   3. Why DSS is the right fit for this specific project
 *   4. Simple forward-looking close
 *
 * Tone: Spartan. Direct, grounded, professional. No em dashes. No fluff.
 * Output: starts with salutation, no date, no signature block.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import pdfParse from 'pdf-parse';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, '../../data/company-profile');

const PAYMENT_SCHEDULE_LABELS: Record<string, string> = {
  option_a: '50% at kickoff, 25% at creative development completion, 25% at final delivery',
  option_b: '25% at signing, 25% NET30, 25% NET30, 25% at completion',
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  brand_commercial: 'brand commercial / campaign',
  product_launch: 'product launch video',
  corporate_story: 'corporate brand story',
  training_video: 'training and educational video',
};

// ─────────────────────────────────────────────────────────────
// Knowledge base loader
// ─────────────────────────────────────────────────────────────

/**
 * Load all .md, .txt, and .pdf files from data/company-profile/.
 * Returns a single concatenated string for injection into the system prompt.
 */
async function loadCompanyKnowledgeBase(): Promise<string> {
  let files: string[];
  try {
    files = await readdir(PROFILE_DIR);
  } catch {
    return ''; // directory doesn't exist yet
  }

  const sections: string[] = [];

  for (const file of files.sort()) {
    const ext = extname(file).toLowerCase();
    const filePath = join(PROFILE_DIR, file);

    try {
      if (ext === '.md' || ext === '.txt') {
        const text = await readFile(filePath, 'utf-8');
        sections.push(`--- ${file} ---\n${text.trim()}`);
      } else if (ext === '.pdf') {
        const buffer = await readFile(filePath);
        const parsed = await pdfParse(buffer);
        sections.push(`--- ${file} ---\n${parsed.text.trim()}`);
      }
    } catch {
      // skip unreadable files silently
    }
  }

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────────────────────
// Cover letter generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a cover letter draft for the given commercial project.
 * Returns plain text starting with the salutation. No date, no sign-off.
 */
export async function generateCoverLetter(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const seeds: string[] = project.cover_letter_seeds
    ? (JSON.parse(project.cover_letter_seeds) as string[])
    : [];

  const projectTypeLabel = PROJECT_TYPE_LABELS[project.project_type ?? ''] ?? 'video production';

  const knowledgeBase = await loadCompanyKnowledgeBase();

  const systemPrompt = `You are Daniel Dougherty, Director of Partnerships at Digital Spark Studios. You write proposal cover letters that are direct, grounded, and professional. Spartan tone only: no em dashes, no emotional flourishes, no filler language, no clichés.

Use the company knowledge base below to inform your understanding of DSS's voice, services, differentiators, and the language the team uses. Write from genuine familiarity with the company.

${knowledgeBase ? `DIGITAL SPARK STUDIOS KNOWLEDGE BASE:\n${knowledgeBase}` : ''}`;

  const userPrompt = `Write a cover letter for the following proposal. This is a soft welcome and overview — not a deep dive into deliverables or pricing. Reflect back what was discussed in the discovery conversation and frame why DSS is the right partner.

Client: ${project.client_name}
Project Type: ${projectTypeLabel}
Project Description: ${project.project_description ?? 'Not specified'}
Tone / Creative Direction: ${project.tone ?? 'Not specified'}
${project.discovery_notes ? `\nDiscovery call notes:\n${project.discovery_notes}` : ''}
${seeds.length > 0 ? `\nKey language and phrases from the call:\n${seeds.map((s) => `- "${s}"`).join('\n')}` : ''}

Requirements:
- Begin with: Dear ${project.client_name} Team,
- Follow with a blank line
- Write 4 paragraphs, each separated by a blank line
- Paragraph 1: Acknowledge the conversation and the client's world in a warm but grounded way
- Paragraph 2: Speak to what they are working toward and why it matters
- Paragraph 3: Explain why DSS is the right fit for this specific project — draw on real capabilities and experience
- Paragraph 4: A brief, forward-looking close. One to two sentences.
- Target 400 to 500 words total
- No em dashes anywhere
- No date, no signature, no sign-off of any kind`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

  return text
    .replace(/\u2014/g, '-')     // em dash → hyphen
    .replace(/\u2013/g, '-')     // en dash → hyphen
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Project description generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a 2-3 word scope title for the deliverables section.
 * Examples: "Residential Photography", "Product Launch Campaign", "Broadcast Comedy Spot"
 */
export async function generateScopeTitle(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];

  const projectTypeLabel = PROJECT_TYPE_LABELS[project.project_type ?? ''] ?? 'video production';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 20,
    system: 'You generate concise, creative 2-3 word titles for the deliverables section of video production proposals. Return only the title — nothing else.',
    messages: [{
      role: 'user',
      content: `Generate a 2-3 word scope title for this project.

Client: ${project.client_name}
Project Type: ${projectTypeLabel}
Description: ${project.project_description ?? 'Not specified'}
Deliverables: ${deliverables.length > 0 ? deliverables.join(', ') : 'Not specified'}
${project.discovery_notes ? `Discovery notes: ${project.discovery_notes}` : ''}

Examples of good titles: "Residential Photography", "Product Launch Campaign", "Cinematic Storytelling", "Broadcast Comedy Spot", "Training Video Series"

Return only the title, no punctuation.`,
    }],
  });

  const text =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-').trim();
}

/**
 * Generate a polished 1-2 sentence project description for the proposal.
 * This sits just above the deliverables table — a brief, creative summary
 * of the scope of work, neatly packaged.
 */
export async function generateProjectDescription(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];

  const projectTypeLabel = PROJECT_TYPE_LABELS[project.project_type ?? ''] ?? 'video production';
  const knowledgeBase = await loadCompanyKnowledgeBase();

  const systemPrompt = `You write concise, polished project descriptions for video production proposals at Digital Spark Studios. Your descriptions are crisp and purposeful. No em dashes. No filler. No clichés.

${knowledgeBase ? `DIGITAL SPARK STUDIOS KNOWLEDGE BASE:\n${knowledgeBase}` : ''}`;

  const userPrompt = `Write a 1-2 sentence project description for the following scope of work. This will appear directly above the deliverables table in a client proposal. It should summarize what the project is — briefly, creatively, and clearly. Think of it as the headline for the work.

Client: ${project.client_name}
Project Type: ${projectTypeLabel}
Raw Description: ${project.project_description ?? 'Not specified'}
Deliverables: ${deliverables.length > 0 ? deliverables.join(', ') : 'To be confirmed'}
${project.discovery_notes ? `Discovery notes: ${project.discovery_notes}` : ''}

Rules:
- 1 to 2 sentences maximum
- Describe the scope creatively but concisely
- No em dashes
- No sign-off, no intro preamble — just the description itself`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

  return text
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Investment page generators
// ─────────────────────────────────────────────────────────────

function buildInvestmentContext(project: CommercialProjectRow): string {
  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];
  const projectTypeLabel = PROJECT_TYPE_LABELS[project.project_type ?? ''] ?? 'video production';
  return [
    `Client: ${project.client_name}`,
    `Project Type: ${projectTypeLabel}`,
    `Deliverables: ${deliverables.length > 0 ? deliverables.join(', ') : 'To be confirmed'}`,
    project.discovery_notes ? `Discovery notes: ${project.discovery_notes}` : '',
    project.tone ? `Tone / Creative Direction: ${project.tone}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Large bold left-column headline for the Investment page.
 * One punchy sentence about DSS's approach to this specific project.
 * Example: "Strategically Executed In A Controlled Studio Environment To Optimize Efficiency."
 */
export async function generateInvestmentHeadline(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const context = buildInvestmentContext(project);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 60,
    system: 'You write bold, confident one-sentence headlines for the investment page of video production proposals at Digital Spark Studios. The headline appears large on the left side of the page. It speaks to how DSS will execute this specific project. No em dashes. No quotes. Return only the headline.',
    messages: [{
      role: 'user',
      content: `Write a single bold headline sentence about DSS's approach to executing this project. It should feel strategic and confident — like a statement of intent. 10 to 16 words.\n\n${context}`,
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/^["']|["']$/g, '').trim();
}

/**
 * Right-column subheading for the Investment page.
 * Short, confident title for the body copy block.
 * Example: "Built for Scale, Executed with Precision"
 */
export async function generateInvestmentSubheading(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const context = buildInvestmentContext(project);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 30,
    system: 'You write short subheadings for the investment page of video production proposals at Digital Spark Studios. 4 to 7 words. Confident and specific to the project. No em dashes. Return only the subheading.',
    messages: [{
      role: 'user',
      content: `Write a 4-7 word subheading for the investment page body copy. Examples: "Built for Scale, Executed with Precision", "Purpose-Built for This Production", "End-to-End Ownership, Start to Finish".\n\n${context}`,
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/^["']|["']$/g, '').trim();
}

/**
 * Right-column body copy for the Investment page.
 * 2 short paragraphs: why DSS is built for this project, and how the team is structured to deliver.
 * Mentions the client by name. Spartan tone. No em dashes.
 */
export async function generateInvestmentBody(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const context = buildInvestmentContext(project);
  const knowledgeBase = await loadCompanyKnowledgeBase();

  const systemPrompt = `You write the investment page body copy for video production proposals at Digital Spark Studios. Spartan tone: direct, confident, professional. No em dashes. No filler. Reference the client by name.

${knowledgeBase ? `DIGITAL SPARK STUDIOS KNOWLEDGE BASE:\n${knowledgeBase}` : ''}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Write 2 short paragraphs for the investment section body copy. Separated by a blank line.

Paragraph 1: Why DSS is purpose-built for a production of this scope — reference their experience, team structure, and workflow as they relate to this specific project and client.
Paragraph 2: How the project will be led and managed — reference the Executive Producer (Adam Sewell) and Executive Director (Joshua Hieber) and the cross-functional approach DSS brings.

Rules: mention the client by name in paragraph 1. No em dashes. No sign-off. Under 120 words total.

${context}`,
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
  return text
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Payment schedule helper
// ─────────────────────────────────────────────────────────────

/**
 * Build the payment schedule text for use in a PandaDoc document.
 */
export function formatPaymentSchedule(schedule: string | null): string {
  if (!schedule) return 'To be determined';
  return PAYMENT_SCHEDULE_LABELS[schedule] ?? schedule;
}
