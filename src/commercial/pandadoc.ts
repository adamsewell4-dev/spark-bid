/**
 * src/commercial/pandadoc.ts
 *
 * PandaDoc API client for Spark Bid's commercial proposal workflow.
 *
 * Creates documents from the DSS proposal template (template_uuid) and
 * populates tokens with project-specific content extracted from the brief.
 *
 * Template UUID: oDvPgX7HWu3biSw4i2cynn
 * Tokens populated: cover.letter, proposal.name, company.name,
 *   Client.Company, Client.FirstName, Client.LastName,
 *   deliverables.list, payment.schedule, project.description
 *
 * Auth: Authorization: API-Key {PANDADOC_API_KEY}
 * Base URL: https://api.pandadoc.com/public/v1
 */

import axios from 'axios';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';
import { formatPaymentSchedule } from './coverLetter.js';

const PANDADOC_BASE = 'https://api.pandadoc.com/public/v1';
const TEMPLATE_UUID = 'oDvPgX7HWu3biSw4i2cynn';

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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    Authorization: `API-Key ${config.pandadocApiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Returns true if the document has been sent to a client and must not be overwritten. */
export function isDocumentSent(status: string): boolean {
  return [
    'document.sent', 'document.viewed', 'document.waiting_approval',
    'document.approved', 'document.signed', 'document.completed',
  ].includes(status);
}

/** Short human-readable status label. */
export function pandaDocStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'document.draft':    'Draft',
    'document.sent':     'Sent',
    'document.viewed':   'Viewed',
    'document.waiting_approval': 'Awaiting Approval',
    'document.approved': 'Approved',
    'document.rejected': 'Rejected',
    'document.signed':   'Signed',
    'document.completed': 'Completed',
    'document.voided':   'Voided',
    'document.declined': 'Declined',
  };
  return labels[status] ?? status;
}

export function pandaDocEditorUrl(documentId: string): string {
  return `https://app.pandadoc.com/a/#/documents/${documentId}`;
}

/**
 * Parse "First Last" into { first, last }.
 * Falls back gracefully for single-word or multi-word names.
 */
function parseClientName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? fullName, last: '' };
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Create a PandaDoc document from the DSS proposal template,
 * populating all tokens with project-specific content.
 */
export async function createProposalDocument(
  project: CommercialProjectRow,
  coverLetterText: string,
  projectDescription: string,
  scopeTitle: string
): Promise<PandaDocDocument> {
  const projectTypeLabel = project.project_type
    ? project.project_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Project';
  const docName = `${project.client_name} — ${projectTypeLabel} Proposal`;

  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];
  const deliverablesList = deliverables.length > 0
    ? deliverables.join('\n')
    : 'Deliverables to be confirmed.';

  const paymentText = formatPaymentSchedule(project.payment_schedule);
  const { first, last } = parseClientName(project.client_name);

  const payload = {
    name: docName,
    template_uuid: TEMPLATE_UUID,
    recipients: [],
    tags: ['spark-bid', project.project_type ?? 'commercial'],
    metadata: {
      client_name: project.client_name,
      project_type: project.project_type ?? '',
      spark_bid_project_id: project.id,
    },
    tokens: [
      { name: 'proposal.name',       value: docName },
      { name: 'company.name',        value: 'Digital Spark Studios' },
      { name: 'Client.Company',      value: project.client_name },
      { name: 'Client.FirstName',    value: first },
      { name: 'Client.LastName',     value: last },
      { name: 'cover.letter',        value: coverLetterText },
      { name: 'project.description', value: projectDescription },
      { name: 'scope.title',         value: scopeTitle },
      { name: 'deliverables.list',   value: deliverablesList },
      { name: 'payment.schedule',    value: paymentText },
    ],
    parse_form_fields: false,
  };

  const response = await axios.post<PandaDocDocument>(
    `${PANDADOC_BASE}/documents`,
    payload,
    {
      headers: authHeaders(),
      timeout: 60_000,
      validateStatus: () => true,
    }
  );

  if (response.status !== 201 && response.status !== 200) {
    const body = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data);
    throw new Error(`PandaDoc API returned HTTP ${response.status}: ${body.slice(0, 1000)}`);
  }

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
