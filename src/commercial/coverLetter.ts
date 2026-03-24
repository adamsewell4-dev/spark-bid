/**
 * src/commercial/coverLetter.ts
 *
 * Generates a cover letter for a commercial proposal using the confirmed
 * project brief. The letter is a soft welcome and overview — not a deep
 * dive into specifics. Tone is Spartan: clear, direct, no emotional flair.
 *
 * Structure: 3 paragraphs
 *   1. Warm welcome and acknowledgment of what was discussed
 *   2. Brief overview of the project and DSS's fit
 *   3. Forward-looking close / next step
 *
 * Output: starts with "Dear [Client] Team," — no date, no signature block
 * (both already present in the PandaDoc template).
 *
 * Rules: no em dashes, no clichés, no elaborate language.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';

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

  const systemPrompt = `You are Daniel Dougherty, Director of Partnerships at Digital Spark Studios (DSS), a video production company based in Charlotte, NC. You write proposal cover letters with a Spartan tone: clear, direct, and professional. Never emotional, never elaborate. No filler words, no superlatives, no clichés. Never use em dashes.

Digital Spark Studios:
- Founded 2015, Charlotte, NC
- Leadership: Adam Sewell (Executive Producer / CEO), Joshua Hieber (Executive Director)
- End-to-end video production from concept through delivery
- 50+ years combined team experience`;

  const userPrompt = `Write a cover letter for this proposal. The letter is a soft welcome and high-level overview only. Do not go deep into project specifics or deliverables. Reflect back what was discussed in the discovery conversation in a natural, grounded way.

Client: ${project.client_name}
Project Type: ${projectTypeLabel}
Project Description: ${project.project_description ?? 'Not specified'}
Tone / Creative Direction: ${project.tone ?? 'Not specified'}
${seeds.length > 0 ? `\nKey themes and language from the discovery call:\n${seeds.map((s) => `- "${s}"`).join('\n')}` : ''}

Format rules:
- Begin with: Dear ${project.client_name} Team,
- Then a blank line
- Write 3 short paragraphs separated by blank lines
- Paragraph 1: Warm, grounded acknowledgment of the conversation and the opportunity
- Paragraph 2: Brief overview of the project scope and why DSS is the right fit
- Paragraph 3: Simple forward-looking close, one to two sentences
- No date, no signature, no sign-off of any kind at the end
- No em dashes anywhere
- No elaborate language, no emotional flair
- Keep it under 200 words total`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

  // Normalize line endings and ensure paragraphs are separated clearly
  return text
    .replace(/—/g, '-')          // strip any em dashes Claude snuck in
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')  // collapse excess blank lines
    .trim();
}

/**
 * Build the payment schedule text for use in a PandaDoc document.
 */
export function formatPaymentSchedule(schedule: string | null): string {
  if (!schedule) return 'To be determined';
  return PAYMENT_SCHEDULE_LABELS[schedule] ?? schedule;
}
