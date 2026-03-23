/**
 * src/commercial/fireflies.ts
 *
 * Fireflies.ai API client for Spark Bid's commercial proposal workflow.
 *
 * Responsibilities:
 *   1. Fetch the list of recent Fireflies transcripts
 *   2. Filter to transcripts prefixed "DISCOVERY -" (the DSS naming convention)
 *   3. Parse client name, description, and date from the structured title
 *   4. Fetch a full transcript (sentences + summary) by ID
 *   5. Use Claude to extract a structured ProjectBrief ready for dashboard review
 *
 * Title format: DISCOVERY - [Client Name] - [Project Description] - [YYYY-MM-DD]
 * Example:       DISCOVERY - SleepMe - Chilipad 2.0 Launch - 2026-03-15
 *
 * Auth: Authorization: Bearer {FIREFLIES_API_KEY}
 * Endpoint: https://api.fireflies.ai/graphql
 */

import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const FIREFLIES_ENDPOINT = 'https://api.fireflies.ai/graphql';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ProjectType =
  | 'brand_commercial'
  | 'product_launch'
  | 'corporate_story'
  | 'training_video'
  | 'unknown';

export type PaymentSchedule = 'option_a' | 'option_b' | null;

/** Speaker record from Fireflies (has the human-readable name) */
export interface FirefliesSpeaker {
  speaker_id: string;
  name: string;
}

/** A single sentence from the Fireflies transcript */
export interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time?: number;
}

/** Fireflies AI summary object */
export interface FirefliesSummary {
  keywords?: string[];
  action_items?: string;
  overview?: string;
  shorthand_bullet?: string;
  gist?: string;
}

/** Lightweight transcript record returned by the list query */
export interface FirefliesTranscriptSummary {
  id: string;
  title: string;
  date: number;           // Unix timestamp in ms
  participants: string[]; // Array of participant email addresses
  speakers: FirefliesSpeaker[];
  summary: FirefliesSummary | null;
}

/** Full transcript with sentences, returned by the single-record query */
export interface FirefliesTranscript extends FirefliesTranscriptSummary {
  sentences: FirefliesSentence[];
}

/**
 * A discovery call parsed from a Fireflies transcript title.
 * Used to populate the dashboard list before the full brief is extracted.
 */
export interface DiscoveryCall {
  transcriptId: string;
  title: string;
  clientName: string;
  projectDescription: string;
  callDate: string;       // ISO 8601 date string YYYY-MM-DD
  speakers: FirefliesSpeaker[];
}

/**
 * Structured project brief extracted from a Fireflies discovery call transcript.
 * Populated by Claude and presented in the dashboard for human review before
 * any proposal generation begins.
 */
export interface ProjectBrief {
  transcriptId: string;
  clientName: string;
  projectType: ProjectType;
  projectDescription: string;
  deliverables: string[];
  timeline: string;
  budgetSignal: string;
  tone: string;
  coverLetterSeeds: string[];   // Key phrases Daniel used — seed language for the cover letter
  caseStudyMatch: string;       // Suggested past performance references
  paymentSchedule: PaymentSchedule;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

/**
 * Post a GraphQL query to the Fireflies API.
 * Throws on HTTP errors or GraphQL error responses.
 */
async function firefliesQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await axios.post<{ data: T; errors?: { message: string }[] }>(
    FIREFLIES_ENDPOINT,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${config.firefliesApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );

  if (response.data.errors?.length) {
    throw new Error(
      `Fireflies GraphQL error: ${response.data.errors.map((e) => e.message).join('; ')}`
    );
  }

  return response.data.data;
}

/**
 * Parse a Fireflies title following the DSS naming convention:
 *   DISCOVERY - [Client Name] - [Project Description] - [YYYY-MM-DD]
 *
 * Returns null if the title doesn't match the expected format.
 */
export function parseDiscoveryTitle(title: string): {
  clientName: string;
  projectDescription: string;
  callDate: string;
} | null {
  if (!title.startsWith('DISCOVERY -')) return null;

  // Strip the "DISCOVERY - " prefix then split on " - "
  const body = title.slice('DISCOVERY - '.length);
  const parts = body.split(' - ').map((p) => p.trim());

  if (parts.length < 2) return null;

  // Last segment: try to parse as a date
  const lastPart = parts[parts.length - 1];
  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(lastPart);

  if (dateMatch && parts.length >= 3) {
    // Full format: Client - Description - Date
    const callDate = lastPart;
    const clientName = parts[0];
    const projectDescription = parts.slice(1, -1).join(' - ');
    return { clientName, projectDescription, callDate };
  }

  // Fallback: no date in title — use client + rest as description
  return {
    clientName: parts[0],
    projectDescription: parts.slice(1).join(' - '),
    callDate: new Date().toISOString().slice(0, 10),
  };
}

// ─────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────

/**
 * Fetch recent Fireflies transcripts and return only those matching
 * the DISCOVERY - naming convention.
 *
 * @param limit - Max transcripts to fetch from Fireflies (default 50)
 */
export async function fetchDiscoveryCalls(limit = 50): Promise<DiscoveryCall[]> {
  console.log(`[${ts()}] [commercial] [fireflies] [fetching transcript list, limit=${limit}]`);

  const query = `
    query ListTranscripts($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        participants
        speakers {
          speaker_id
          name
        }
      }
    }
  `;

  const data = await firefliesQuery<{ transcripts: FirefliesTranscriptSummary[] }>(
    query,
    { limit }
  );

  const transcripts = data.transcripts ?? [];

  const discoveryCalls: DiscoveryCall[] = [];

  for (const t of transcripts) {
    if (!t.title?.startsWith('DISCOVERY -')) continue;

    const parsed = parseDiscoveryTitle(t.title);
    if (!parsed) continue;

    discoveryCalls.push({
      transcriptId: t.id,
      title: t.title,
      clientName: parsed.clientName,
      projectDescription: parsed.projectDescription,
      callDate: parsed.callDate,
      speakers: t.speakers ?? [],
    });
  }

  console.log(
    `[${ts()}] [commercial] [fireflies] [found ${discoveryCalls.length} DISCOVERY calls from ${transcripts.length} total transcripts]`
  );

  return discoveryCalls;
}

/**
 * Fetch the full content of a single Fireflies transcript, including
 * all sentences with speaker attribution.
 */
export async function fetchTranscriptById(transcriptId: string): Promise<FirefliesTranscript> {
  console.log(`[${ts()}] [commercial] [fireflies] [fetching transcript id=${transcriptId}]`);

  const query = `
    query GetTranscript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        id
        title
        date
        participants
        speakers {
          speaker_id
          name
        }
        sentences {
          text
          speaker_name
          start_time
        }
        summary {
          keywords
          action_items
          overview
          shorthand_bullet
          gist
        }
      }
    }
  `;

  const data = await firefliesQuery<{ transcript: FirefliesTranscript }>(
    query,
    { transcriptId }
  );

  if (!data.transcript) {
    throw new Error(`Transcript not found: ${transcriptId}`);
  }

  return data.transcript;
}

// ─────────────────────────────────────────────────────────────
// Brief extraction
// ─────────────────────────────────────────────────────────────

/**
 * Maps a project type string returned by Claude to our typed union.
 */
function normalizeProjectType(raw: string): ProjectType {
  const map: Record<string, ProjectType> = {
    brand_commercial: 'brand_commercial',
    product_launch: 'product_launch',
    corporate_story: 'corporate_story',
    training_video: 'training_video',
  };
  return map[raw.toLowerCase().replace(/[\s-]+/g, '_')] ?? 'unknown';
}

/**
 * Maps project type to the recommended DSS past performance references.
 */
function suggestCaseStudies(projectType: ProjectType): string {
  switch (projectType) {
    case 'training_video':
      return 'Qworky (Training Video Modules, $80,065) + Atlas Copco (Training Retainer, $120,000)';
    case 'product_launch':
      return 'SleepMe (Chilipad 2.0 Launch, $137,000)';
    case 'brand_commercial':
      return 'Home Outlet / EC Barton (Brand Campaign, $98,900) + Carnegie Mellon (Brand Anthem, $436,390)';
    case 'corporate_story':
      return 'Carnegie Mellon University (Brand Anthem, $436,390)';
    default:
      return 'Carnegie Mellon University + SleepMe + Qworky';
  }
}

/**
 * Build the full transcript text, prioritising Daniel Dougherty's lines.
 * Returns a condensed string suitable for Claude's context window.
 */
function buildTranscriptContext(transcript: FirefliesTranscript): string {
  const sentences = transcript.sentences ?? [];

  // Identify Daniel Dougherty as primary DSS speaker
  const danielSentences = sentences.filter((s) => {
    const name = s.speaker_name?.toLowerCase() ?? '';
    return name.includes('daniel') || name.includes('dougherty');
  });
  const otherSentences = sentences.filter((s) => !danielSentences.includes(s));

  const format = (s: FirefliesSentence) => `[${s.speaker_name ?? 'Unknown'}]: ${s.text}`;

  // Include all Daniel lines + up to 150 other lines to stay within token budget
  const contextLines = [
    ...danielSentences.map(format),
    ...otherSentences.slice(0, 150).map(format),
  ];

  const header = [
    `Title: ${transcript.title}`,
    `Participants: ${(transcript.speakers ?? []).map((s) => s.name).join(', ')}`,
    transcript.summary?.gist ? `Summary: ${transcript.summary.gist}` : '',
    transcript.summary?.overview ? `Overview: ${transcript.summary.overview}` : '',
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n${contextLines.join('\n')}`;
}

/**
 * Use Claude to extract a structured ProjectBrief from a Fireflies transcript.
 *
 * The result is presented in the Spark Bid dashboard for human review and
 * confirmation before any proposal generation begins.
 *
 * @param transcript - Full Fireflies transcript with sentences and summary
 * @param parsedTitle - Pre-parsed title fields (client name, date, etc.)
 */
export async function extractProjectBrief(
  transcript: FirefliesTranscript,
  parsedTitle: { clientName: string; projectDescription: string; callDate: string }
): Promise<ProjectBrief> {
  console.log(
    `[${ts()}] [commercial] [fireflies] [extracting brief for "${parsedTitle.clientName}" via Claude]`
  );

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const transcriptContext = buildTranscriptContext(transcript);

  const systemPrompt = `You are a senior project strategist for Digital Spark Studios (DSS), a professional video production company based in Charlotte, NC. Your job is to read a discovery call transcript and extract a structured project brief.

DSS leadership:
- Adam Sewell — Executive Producer / Partner & CEO
- Joshua Hieber — Executive Director
- Daniel Dougherty — Director of Partnerships (leads discovery calls)

DSS project types:
- brand_commercial — Brand campaign spots, commercials, campaign content
- product_launch — Product reveal/launch videos with product-focused content
- corporate_story — Corporate brand storytelling, company culture, narrative content
- training_video — Employee training, instructional, educational content

Payment schedule options:
- option_a: 50% at kickoff / 25% at creative development completion / 25% at final delivery
- option_b: 25% at signing / 25% NET30 / 25% NET30 / 25% at completion

Your output must be valid JSON and nothing else. No markdown, no explanation.`;

  const userPrompt = `Extract a structured project brief from this discovery call transcript.

${transcriptContext}

Return a JSON object with exactly these fields:
{
  "projectType": "brand_commercial" | "product_launch" | "corporate_story" | "training_video" | "unknown",
  "projectDescription": "1-2 sentence summary of what is being produced",
  "deliverables": ["array", "of", "specific", "deliverable", "items"],
  "timeline": "Estimated timeline or deadline mentioned, or 'Not discussed'",
  "budgetSignal": "Any budget range, number, or signal mentioned verbatim, or 'Not discussed'",
  "tone": "Creative direction, tone descriptors, style references mentioned",
  "coverLetterSeeds": ["array of specific phrases, concepts, or language Daniel or the client used that should appear in the proposal cover letter"],
  "paymentSchedule": "option_a" | "option_b" | null
}

Guidelines:
- deliverables: be specific (e.g. "2x :30 broadcast spots", "1x 3-minute brand film", "6x social cut-downs")
- coverLetterSeeds: pull verbatim language from the call — the more specific the better
- paymentSchedule: suggest option_a (50/25/25) for standard projects, option_b (25/25/25/25) if client mentioned cash flow concerns or the project is large/long-running. Return null if unclear.
- If a field was not discussed, use "Not discussed" for string fields or [] for arrays`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText =
    message.content[0]?.type === 'text' ? message.content[0].text.trim() : '{}';

  let extracted: {
    projectType?: string;
    projectDescription?: string;
    deliverables?: string[];
    timeline?: string;
    budgetSignal?: string;
    tone?: string;
    coverLetterSeeds?: string[];
    paymentSchedule?: string | null;
  };

  try {
    extracted = JSON.parse(rawText) as typeof extracted;
  } catch {
    console.error(
      `[${ts()}] [commercial] [fireflies] [Claude returned non-JSON brief — raw: ${rawText.slice(0, 200)}]`
    );
    extracted = {};
  }

  const projectType = normalizeProjectType(extracted.projectType ?? 'unknown');

  const brief: ProjectBrief = {
    transcriptId: transcript.id,
    clientName: parsedTitle.clientName,
    projectType,
    projectDescription: extracted.projectDescription ?? parsedTitle.projectDescription,
    deliverables: extracted.deliverables ?? [],
    timeline: extracted.timeline ?? 'Not discussed',
    budgetSignal: extracted.budgetSignal ?? 'Not discussed',
    tone: extracted.tone ?? '',
    coverLetterSeeds: extracted.coverLetterSeeds ?? [],
    caseStudyMatch: suggestCaseStudies(projectType),
    paymentSchedule:
      extracted.paymentSchedule === 'option_a' || extracted.paymentSchedule === 'option_b'
        ? extracted.paymentSchedule
        : null,
  };

  console.log(
    `[${ts()}] [commercial] [fireflies] [brief extracted — client="${brief.clientName}", type="${brief.projectType}", deliverables=${brief.deliverables.length}]`
  );

  return brief;
}

/**
 * Convenience function: fetch a discovery transcript by ID and extract its brief
 * in a single call.
 */
export async function fetchAndExtractBrief(transcriptId: string): Promise<ProjectBrief> {
  const transcript = await fetchTranscriptById(transcriptId);

  const parsed = parseDiscoveryTitle(transcript.title);
  if (!parsed) {
    throw new Error(
      `Transcript "${transcript.title}" does not follow the DISCOVERY - naming convention.`
    );
  }

  return extractProjectBrief(transcript, parsed);
}
