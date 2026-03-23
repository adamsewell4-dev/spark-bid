/**
 * src/commercial/coverLetter.ts
 *
 * Generates a personalized cover letter for a commercial proposal
 * in Daniel Dougherty's voice using the confirmed project brief.
 *
 * Structure: 4–5 paragraphs
 *   1. Enthusiasm for the opportunity
 *   2. Client's specific challenge or goal
 *   3. DSS's creative approach for this project
 *   4. Integrated leadership team and process
 *   5. Forward momentum close
 *
 * Signed off as: Daniel Dougherty, Director of Partnerships
 *
 * AI drafts first — human reviews and edits in PandaDoc before sending.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';

const PAYMENT_SCHEDULE_LABELS: Record<string, string> = {
  option_a: '50% at kickoff · 25% at creative development completion · 25% at final delivery',
  option_b: '25% at signing · 25% NET30 · 25% NET30 · 25% at completion',
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  brand_commercial: 'brand commercial / campaign',
  product_launch: 'product launch video',
  corporate_story: 'corporate brand story',
  training_video: 'training and educational video',
};

/**
 * Generate a cover letter draft for the given commercial project.
 * Returns the cover letter as a plain text string (markdown-compatible).
 */
export async function generateCoverLetter(project: CommercialProjectRow): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];

  const seeds: string[] = project.cover_letter_seeds
    ? (JSON.parse(project.cover_letter_seeds) as string[])
    : [];

  const projectTypeLabel = PROJECT_TYPE_LABELS[project.project_type ?? ''] ?? 'video production';

  const systemPrompt = `You are Daniel Dougherty, Director of Partnerships at Digital Spark Studios (DSS). You write proposal cover letters in a confident, cinematic, strategic voice — never salesy or generic. Your letters feel personal, specific, and forward-leaning. You never use clichés like "we are excited to submit" or "please find attached."

Digital Spark Studios:
- Founded 2015, Charlotte, NC (9525 Monroe Rd, Ste 150, Charlotte, NC 28270)
- Leadership: Adam Sewell (Executive Producer / Partner & CEO), Joshua Hieber (Executive Director)
- End-to-end video production: concept through delivery
- FAA Part 107 certified drone operators
- Adobe Certified Professionals on staff
- GSA Schedule SIN 512110 holder
- 50+ years combined team experience`;

  const userPrompt = `Write a proposal cover letter for the following project. Return only the letter body — no subject line, no "Dear [name]" salutation (that will be added separately), and no sign-off block (that will be added separately). Just the 4–5 paragraphs.

Client: ${project.client_name}
Project Type: ${projectTypeLabel}
Project Description: ${project.project_description ?? 'Not specified'}
Key Deliverables: ${deliverables.length > 0 ? deliverables.join(', ') : 'To be confirmed'}
Timeline: ${project.timeline ?? 'To be confirmed'}
Budget Signal: ${project.budget_signal ?? 'Not discussed'}
Tone / Creative Direction: ${project.tone ?? 'To be determined'}
Suggested Case Studies: ${project.case_study_match ?? 'TBD'}
${seeds.length > 0 ? `\nKey phrases and concepts from the discovery call to weave in naturally:\n${seeds.map((s) => `- "${s}"`).join('\n')}` : ''}

Structure:
1. Open with genuine enthusiasm for this specific opportunity and client (reference their brand or product specifically)
2. Speak directly to what the client is trying to achieve — their goal, challenge, or opportunity
3. Describe the specific creative approach DSS would bring to this project
4. Reference the integrated leadership team (Adam Sewell as Executive Producer, Joshua Hieber as Executive Director) and how the DSS process ensures quality
5. Close with forward momentum — next steps, excitement for the collaboration

Tone: confident, cinematic, strategic. Specific > generic. Write like someone who genuinely knows this client's world.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const body =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';

  // Assemble full letter with sign-off
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return [
    `${today}`,
    '',
    `Dear ${project.client_name} Team,`,
    '',
    body,
    '',
    'Warmly,',
    '',
    'Daniel Dougherty',
    'Director of Partnerships',
    'Digital Spark Studios',
    '9525 Monroe Rd, Ste 150 · Charlotte, NC 28270',
    'www.digitalsparkstudios.com',
  ].join('\n');
}

/**
 * Build the payment schedule text for use in a PandaDoc document.
 */
export function formatPaymentSchedule(schedule: string | null): string {
  if (!schedule) return 'To be determined';
  return PAYMENT_SCHEDULE_LABELS[schedule] ?? schedule;
}
