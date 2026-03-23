/**
 * src/commercial/pandadoc.ts
 *
 * PandaDoc API client for Spark Bid's commercial proposal workflow.
 *
 * Responsibilities:
 *   1. Create proposal documents from confirmed project briefs
 *   2. Check document status before any sync operation
 *   3. Enforce the update-vs-new-version rule:
 *        - status = "draft"                    → update the existing document
 *        - status = "sent"|"viewed"|"signed"   → create a new version, flag for review
 *
 * Auth: Authorization: API-Key {PANDADOC_API_KEY}
 * Base URL: https://api.pandadoc.com/public/v1
 */

import axios from 'axios';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';
import { formatPaymentSchedule } from './coverLetter.js';

const PANDADOC_BASE = 'https://api.pandadoc.com/public/v1';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PandaDocStatus =
  | 'document.draft'
  | 'document.sent'
  | 'document.viewed'
  | 'document.waiting_approval'
  | 'document.approved'
  | 'document.rejected'
  | 'document.signed'
  | 'document.completed'
  | 'document.voided'
  | 'document.declined';

export interface PandaDocDocument {
  id: string;
  name: string;
  status: PandaDocStatus;
  date_created: string;
  date_modified: string;
  links: { rel: string; href: string }[];
}

// PandaDoc content block types
interface TextBlock {
  type: 'text';
  data: { text: string };
  style?: Record<string, unknown>;
}

interface HeadingBlock {
  type: 'heading';
  data: { text: string; level: number };
}

interface TableBlock {
  type: 'table';
  data: {
    headers: string[];
    rows: string[][];
  };
}

type ContentBlock = TextBlock | HeadingBlock | TableBlock;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    Authorization: `API-Key ${config.pandadocApiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Returns true if this PandaDoc status means the document has been sent to a client. */
export function isDocumentSent(status: string): boolean {
  return ['document.sent', 'document.viewed', 'document.waiting_approval',
    'document.approved', 'document.signed', 'document.completed'].includes(status);
}

/** Returns a short human-readable status label. */
export function pandaDocStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'document.draft':    'Draft',
    'document.sent':     'Sent',
    'document.viewed':   'Viewed',
    'document.waiting_approval': 'Awaiting Approval',
    'document.approved': 'Approved',
    'document.rejected': 'Rejected',
    'document.signed':   'Signed',
    'document.completed':'Completed',
    'document.voided':   'Voided',
    'document.declined': 'Declined',
  };
  return labels[status] ?? status;
}

const PROJECT_TYPE_PHASES: Record<string, string[]> = {
  brand_commercial: [
    'Creative Development & Pre-Production',
    'Production',
    'Post-Production',
  ],
  product_launch: [
    'Pre-Production & Production',
    'Post-Production',
    '3D Animation',
  ],
  corporate_story: [
    'Creative Development & Pre-Production',
    'Production',
    'Post-Production',
  ],
  training_video: [
    'Pre-Production',
    'Production',
    'Post-Production',
  ],
};

function getPhases(projectType: string | null): string[] {
  return PROJECT_TYPE_PHASES[projectType ?? ''] ?? [
    'Pre-Production',
    'Production',
    'Post-Production',
  ];
}

// ─────────────────────────────────────────────────────────────
// Document builder
// ─────────────────────────────────────────────────────────────

/**
 * Build the full PandaDoc content blocks for a commercial proposal.
 * Pricing is left as [TBD] — to be filled in PandaDoc or synced from Saturation.
 */
function buildProposalContent(
  project: CommercialProjectRow,
  coverLetterText: string
): ContentBlock[] {
  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];

  const phases = getPhases(project.project_type);
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const paymentText = formatPaymentSchedule(project.payment_schedule);

  const blocks: ContentBlock[] = [];

  // ── Cover page header ──────────────────────────────────────
  blocks.push({ type: 'heading', data: { text: 'Digital Spark Studios', level: 1 } });
  blocks.push({ type: 'text', data: { text: `Proposal for ${project.client_name}` } });
  blocks.push({ type: 'text', data: { text: `${project.project_description ?? ''}` } });
  blocks.push({ type: 'text', data: { text: today } });
  blocks.push({ type: 'text', data: { text: '' } });
  blocks.push({ type: 'text', data: { text: 'Adam Sewell — Executive Producer / Partner & CEO' } });
  blocks.push({ type: 'text', data: { text: 'Joshua Hieber — Executive Director' } });
  blocks.push({ type: 'text', data: { text: '9525 Monroe Rd, Ste 150 · Charlotte, NC 28270' } });
  blocks.push({ type: 'text', data: { text: 'www.digitalsparkstudios.com' } });

  // ── Cover letter ───────────────────────────────────────────
  blocks.push({ type: 'heading', data: { text: 'Cover Letter', level: 2 } });
  // Split the cover letter into individual paragraph blocks
  for (const paragraph of coverLetterText.split('\n\n')) {
    if (paragraph.trim()) {
      blocks.push({ type: 'text', data: { text: paragraph.trim() } });
    }
  }

  // ── Deliverables ───────────────────────────────────────────
  blocks.push({ type: 'heading', data: { text: 'Deliverables', level: 2 } });
  if (deliverables.length > 0) {
    blocks.push({
      type: 'table',
      data: {
        headers: ['Deliverable', 'Notes'],
        rows: deliverables.map((d) => [d, '']),
      },
    });
  } else {
    blocks.push({ type: 'text', data: { text: 'Deliverables to be confirmed.' } });
  }

  if (project.timeline) {
    blocks.push({ type: 'text', data: { text: `Estimated Timeline: ${project.timeline}` } });
  }

  // ── Investment Summary ─────────────────────────────────────
  blocks.push({ type: 'heading', data: { text: 'Investment Summary', level: 2 } });
  blocks.push({
    type: 'table',
    data: {
      headers: ['Phase', 'Scope of Work', 'Investment'],
      rows: phases.map((phase) => [phase, '', '[TBD]']),
    },
  });

  // ── Total & Payment Schedule ───────────────────────────────
  blocks.push({ type: 'heading', data: { text: 'Your Story, Strategically Told.', level: 2 } });
  blocks.push({ type: 'text', data: { text: 'Total Investment: [TBD — to be completed]' } });
  blocks.push({ type: 'heading', data: { text: 'Payment Schedule', level: 3 } });
  blocks.push({ type: 'text', data: { text: paymentText } });
  blocks.push({
    type: 'text',
    data: {
      text: 'Any work requested outside the original scope of this agreement will be addressed via a written change order, mutually agreed upon before work begins.',
    },
  });

  // ── Case Studies Note ──────────────────────────────────────
  if (project.case_study_match) {
    blocks.push({ type: 'heading', data: { text: 'Relevant Experience', level: 2 } });
    blocks.push({
      type: 'text',
      data: { text: `Recommended case studies for this proposal: ${project.case_study_match}` },
    });
  }

  // ── Closing ────────────────────────────────────────────────
  blocks.push({ type: 'heading', data: { text: `Thank You, ${project.client_name}`, level: 2 } });
  blocks.push({
    type: 'text',
    data: { text: `${project.client_name} × Digital Spark Studios` },
  });

  return blocks;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Create a new PandaDoc proposal document for a commercial project.
 * Returns the created document record.
 */
export async function createProposalDocument(
  project: CommercialProjectRow,
  coverLetterText: string
): Promise<PandaDocDocument> {
  const blocks = buildProposalContent(project, coverLetterText);

  const projectTypeLabel = project.project_type
    ? project.project_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Project';

  const docName = `${project.client_name} — ${projectTypeLabel} Proposal`;

  const payload = {
    name: docName,
    recipients: [],
    content: {
      sections: [
        {
          title: 'Proposal',
          body: blocks,
        },
      ],
    },
    metadata: {
      client_name: project.client_name,
      project_type: project.project_type ?? '',
      spark_bid_project_id: project.id,
    },
    tags: ['spark-bid', project.project_type ?? 'commercial'],
  };

  const response = await axios.post<PandaDocDocument>(
    `${PANDADOC_BASE}/documents`,
    payload,
    { headers: authHeaders(), timeout: 30_000 }
  );

  return response.data;
}

/**
 * Fetch the current status of a PandaDoc document.
 */
export async function getDocumentStatus(documentId: string): Promise<PandaDocDocument> {
  const response = await axios.get<PandaDocDocument>(
    `${PANDADOC_BASE}/documents/${documentId}`,
    { headers: authHeaders(), timeout: 15_000 }
  );
  return response.data;
}

/**
 * Get the direct PandaDoc editor URL for a document.
 */
export function pandaDocEditorUrl(documentId: string): string {
  return `https://app.pandadoc.com/a/#/documents/${documentId}`;
}
