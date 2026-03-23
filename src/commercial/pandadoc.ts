/**
 * src/commercial/pandadoc.ts
 *
 * PandaDoc API client for Spark Bid's commercial proposal workflow.
 *
 * PandaDoc requires a file upload (URL, file, or template_uuid) to create
 * a document — raw content blocks are not supported. This module:
 *   1. Builds a DOCX document in memory using the docx library
 *   2. Uploads it to PandaDoc via multipart/form-data
 *   3. Returns the created PandaDoc document record
 *
 * Sync logic (call getDocumentStatus before any update):
 *   - status = draft    → update existing document in place
 *   - status = sent / viewed / signed → create new version, flag for review
 *
 * Auth: Authorization: API-Key {PANDADOC_API_KEY}
 * Base URL: https://api.pandadoc.com/public/v1
 */

import axios from 'axios';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Footer,
  PageNumber,
  NumberFormat,
  BorderStyle,
  WidthType,
  ShadingType,
  TableLayoutType,
  convertInchesToTwip,
} from 'docx';
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

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const BODY_FONT = 'Calibri';
const BODY_SIZE = 22; // half-points = 11pt
const HEADING_FONT = 'Calibri';
const BRAND_COLOR = '1e1b4b'; // indigo-950
const ACCENT_COLOR = '4f46e5'; // indigo-600
const TABLE_HEADER_BG = '1e1b4b';
const TABLE_ALT_BG = 'f5f3ff';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `API-Key ${config.pandadocApiKey}` };
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

const PROJECT_TYPE_PHASES: Record<string, string[]> = {
  brand_commercial: ['Creative Development & Pre-Production', 'Production', 'Post-Production'],
  product_launch:   ['Pre-Production & Production', 'Post-Production', '3D Animation'],
  corporate_story:  ['Creative Development & Pre-Production', 'Production', 'Post-Production'],
  training_video:   ['Pre-Production', 'Production', 'Post-Production'],
};

function getPhases(projectType: string | null): string[] {
  return PROJECT_TYPE_PHASES[projectType ?? ''] ?? ['Pre-Production', 'Production', 'Post-Production'];
}

// ─────────────────────────────────────────────────────────────
// DOCX builders
// ─────────────────────────────────────────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 40, font: HEADING_FONT, color: BRAND_COLOR })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 200 },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: HEADING_FONT, color: ACCENT_COLOR })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 160 },
    border: { bottom: { color: 'e0e7ff', size: 6, style: BorderStyle.SINGLE } },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: HEADING_FONT, color: BRAND_COLOR })],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
  });
}

function body(text: string, opts: { italic?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({
      text,
      size: opts.size ?? BODY_SIZE,
      font: BODY_FONT,
      italics: opts.italic,
      color: opts.color ?? '374151',
    })],
    spacing: { after: 160 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ text: '', spacing: { after: 120 } });
}

function buildTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 20, font: BODY_FONT, color: 'FFFFFF' })],
          spacing: { before: 80, after: 80 },
        })],
        shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cell, size: 20, font: BODY_FONT, color: '374151' })],
            spacing: { before: 60, after: 60 },
          })],
          shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? 'FFFFFF' : TABLE_ALT_BG },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        })
      ),
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
  });
}

// ─────────────────────────────────────────────────────────────
// Commercial proposal DOCX builder
// ─────────────────────────────────────────────────────────────

async function buildCommercialProposalDocx(
  project: CommercialProjectRow,
  coverLetterText: string,
  docName: string
): Promise<Buffer> {
  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];
  const phases = getPhases(project.project_type);
  const paymentText = formatPaymentSchedule(project.payment_schedule);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  type DocChild = Paragraph | Table;
  const children: DocChild[] = [];

  // ── Cover page ─────────────────────────────────────────────
  children.push(h1('Digital Spark Studios'));
  children.push(body('9525 Monroe Rd, Ste 150 · Charlotte, NC 28270 · www.digitalsparkstudios.com', { color: '6b7280', size: 18 }));
  children.push(spacer());
  children.push(new Paragraph({
    children: [new TextRun({ text: `Proposal for ${project.client_name}`, bold: true, size: 36, font: HEADING_FONT, color: BRAND_COLOR })],
    spacing: { before: 200, after: 120 },
  }));
  if (project.project_description) {
    children.push(body(project.project_description, { italic: true, color: '6b7280' }));
  }
  children.push(body(today, { color: '9ca3af', size: 18 }));
  children.push(spacer());
  children.push(body('Adam Sewell — Executive Producer / Partner & CEO', { size: 20 }));
  children.push(body('Joshua Hieber — Executive Director', { size: 20 }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Cover letter ───────────────────────────────────────────
  children.push(h2('Cover Letter'));
  for (const para of coverLetterText.split('\n\n')) {
    const trimmed = para.trim();
    if (trimmed) children.push(body(trimmed));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Deliverables ───────────────────────────────────────────
  children.push(h2('Deliverables'));
  if (deliverables.length > 0) {
    children.push(buildTable(
      ['Deliverable', 'Format / Notes'],
      deliverables.map((d) => [d, ''])
    ));
  } else {
    children.push(body('Deliverables to be confirmed.', { italic: true }));
  }
  if (project.timeline) {
    children.push(spacer());
    children.push(body(`Estimated Timeline: ${project.timeline}`));
  }

  // ── Investment Summary ─────────────────────────────────────
  children.push(h2('Investment Summary'));
  children.push(buildTable(
    ['Phase', 'Scope of Work', 'Investment'],
    phases.map((phase) => [phase, '', '[TBD — enter in PandaDoc]'])
  ));
  children.push(spacer());
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Your Story, Strategically Told.', bold: true, size: 28, font: HEADING_FONT, color: BRAND_COLOR })],
    spacing: { before: 240, after: 120 },
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Total Investment: ', bold: true, size: BODY_SIZE, font: BODY_FONT }),
      new TextRun({ text: '[TBD — enter in PandaDoc]', size: BODY_SIZE, font: BODY_FONT, color: '9ca3af' }),
    ],
    spacing: { after: 160 },
  }));

  // ── Payment Schedule ───────────────────────────────────────
  children.push(h3('Payment Schedule'));
  children.push(body(paymentText));
  children.push(body(
    'Any work requested outside the original scope of this agreement will be addressed via a written change order, mutually agreed upon before work begins.',
    { italic: true, color: '6b7280', size: 20 }
  ));

  // ── Relevant Experience ────────────────────────────────────
  if (project.case_study_match) {
    children.push(h2('Relevant Experience'));
    children.push(body(`Recommended case studies for this proposal: ${project.case_study_match}`));
  }

  // ── Closing ────────────────────────────────────────────────
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Thank You, ${project.client_name}`, bold: true, size: 36, font: HEADING_FONT, color: BRAND_COLOR })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${project.client_name} × Digital Spark Studios`, size: 24, font: BODY_FONT, color: '6b7280' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'www.digitalsparkstudios.com', size: 20, font: BODY_FONT, color: ACCENT_COLOR })],
    alignment: AlignmentType.CENTER,
  }));

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-bullet',
        levels: [{
          level: 0,
          format: NumberFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } },
            run: { font: 'Symbol', size: BODY_SIZE },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `Digital Spark Studios — ${docName}    |    Page `, size: 16, font: BODY_FONT, color: '9ca3af' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: BODY_FONT, color: '9ca3af' }),
            ],
            alignment: AlignmentType.CENTER,
            border: { top: { color: 'e5e7eb', size: 4, style: BorderStyle.SINGLE } },
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Build a DOCX and upload it to PandaDoc as a new document.
 */
export async function createProposalDocument(
  project: CommercialProjectRow,
  coverLetterText: string
): Promise<PandaDocDocument> {
  const projectTypeLabel = project.project_type
    ? project.project_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Project';
  const docName = `${project.client_name} — ${projectTypeLabel} Proposal`;

  const docxBuffer = await buildCommercialProposalDocx(project, coverLetterText, docName);

  // PandaDoc file upload requires multipart/form-data
  const formData = new FormData();
  const blob = new Blob([docxBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  formData.append('file', blob, `${docName}.docx`);
  formData.append('data', JSON.stringify({
    name: docName,
    recipients: [],
    tags: ['spark-bid', project.project_type ?? 'commercial'],
    metadata: {
      client_name: project.client_name,
      project_type: project.project_type ?? '',
      spark_bid_project_id: project.id,
    },
    parse_form_fields: false,
  }));

  const response = await axios.post<PandaDocDocument>(
    `${PANDADOC_BASE}/documents`,
    formData,
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
