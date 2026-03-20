/**
 * src/proposals/docxExporter.ts
 *
 * Converts a generated proposal (markdown string) into a submission-ready
 * Microsoft Word (.docx) document with proper government proposal formatting.
 *
 * Output format:
 *  - Cover page with solicitation number, company info, and date
 *  - 1-inch margins, 12pt Times New Roman body text
 *  - Numbered section headers
 *  - Compliance matrix as a formatted table
 *  - Page numbers in footer
 */

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
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  BorderStyle,
  WidthType,
  ShadingType,
  TableLayoutType,
  convertInchesToTwip,
} from 'docx';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExportOptions {
  opportunityId: string;
  title: string;
  agency: string;
  solicitationNumber: string;
  responseDeadline?: string;
  markdownContent: string;
  outputPath: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DSS_NAME = 'Digital Spark Studios';
const DSS_ADDRESS = 'Charlotte, NC';
const DSS_GSA_SIN = 'GSA Schedule SIN 512110';
const DSS_POC = 'Joshua Hieber, Executive Director';
const BODY_FONT = 'Times New Roman';
const BODY_SIZE = 24; // half-points (12pt)
const HEADING_FONT = 'Times New Roman';

// Indigo color for section headers
const HEADER_COLOR = '1e3a5f';
const TABLE_HEADER_BG = '1e3a5f';
const TABLE_ALT_BG = 'f0f4f8';

// ─────────────────────────────────────────────────────────────
// Cover page builder
// ─────────────────────────────────────────────────────────────

function buildCoverPage(opts: ExportOptions): Paragraph[] {
  const submissionDate = opts.responseDeadline
    ? new Date(opts.responseDeadline).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return [
    // Top spacing
    new Paragraph({ text: '', spacing: { after: 800 } }),

    // Company name — large
    new Paragraph({
      children: [
        new TextRun({
          text: DSS_NAME.toUpperCase(),
          bold: true,
          size: 52,
          font: HEADING_FONT,
          color: HEADER_COLOR,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // GSA Schedule line
    new Paragraph({
      children: [
        new TextRun({
          text: DSS_GSA_SIN,
          size: 22,
          font: HEADING_FONT,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
    }),

    // Horizontal rule simulation
    new Paragraph({
      border: { bottom: { color: HEADER_COLOR, size: 12, style: BorderStyle.SINGLE } },
      spacing: { after: 800 },
    }),

    // "PROPOSAL FOR" label
    new Paragraph({
      children: [
        new TextRun({
          text: 'PROPOSAL FOR',
          size: 22,
          font: HEADING_FONT,
          color: '888888',
          allCaps: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Opportunity title
    new Paragraph({
      children: [
        new TextRun({
          text: opts.title,
          bold: true,
          size: 36,
          font: HEADING_FONT,
          color: '1a1a1a',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),

    // Agency
    new Paragraph({
      children: [
        new TextRun({
          text: opts.agency.split('.').pop() ?? opts.agency,
          size: 24,
          font: HEADING_FONT,
          color: '444444',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1600 },
    }),

    // Solicitation number
    new Paragraph({
      children: [
        new TextRun({
          text: 'Solicitation Number: ',
          bold: true,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
        new TextRun({
          text: opts.solicitationNumber || 'See RFP',
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),

    // Submission date
    new Paragraph({
      children: [
        new TextRun({
          text: 'Submission Date: ',
          bold: true,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
        new TextRun({
          text: submissionDate,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),

    // POC
    new Paragraph({
      children: [
        new TextRun({
          text: 'Point of Contact: ',
          bold: true,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
        new TextRun({
          text: DSS_POC,
          size: BODY_SIZE,
          font: BODY_FONT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),

    // Address
    new Paragraph({
      children: [
        new TextRun({
          text: DSS_ADDRESS,
          size: BODY_SIZE,
          font: BODY_FONT,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1600 },
    }),

    // Confidentiality notice
    new Paragraph({
      children: [
        new TextRun({
          text: 'This proposal contains proprietary information and is submitted in response to the above solicitation. The information herein is confidential and shall not be disclosed outside the Government.',
          size: 18,
          font: BODY_FONT,
          color: '888888',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),

    // Page break after cover
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ─────────────────────────────────────────────────────────────
// Markdown parser → DOCX elements
// ─────────────────────────────────────────────────────────────

function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Handle **bold** and *italic* inline
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|[^*]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const part = match[0];
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: BODY_SIZE, font: BODY_FONT }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, size: BODY_SIZE, font: BODY_FONT }));
    } else {
      runs.push(new TextRun({ text: part, size: BODY_SIZE, font: BODY_FONT }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, size: BODY_SIZE, font: BODY_FONT })];
}

function buildTableFromMarkdown(tableLines: string[]): Table {
  const rows: TableRow[] = [];
  let isHeader = true;

  for (const line of tableLines) {
    if (line.match(/^\|[-| :]+\|$/)) {
      // Separator row — skip
      isHeader = false;
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

    const tableCells = cells.map(
      (cellText, idx) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText.replace(/\*\*/g, ''),
                  bold: isHeader,
                  size: isHeader ? 20 : 18,
                  font: BODY_FONT,
                  color: isHeader ? 'FFFFFF' : '1a1a1a',
                }),
              ],
              spacing: { before: 60, after: 60 },
            }),
          ],
          shading: isHeader
            ? { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG }
            : rows.length % 2 === 0
            ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG }
            : { type: ShadingType.CLEAR, fill: 'FFFFFF' },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          width: idx === 0
            ? { size: 40, type: WidthType.PERCENTAGE }
            : idx === 1
            ? { size: 45, type: WidthType.PERCENTAGE }
            : { size: 15, type: WidthType.PERCENTAGE },
        })
    );

    rows.push(new TableRow({ children: tableCells }));
    if (isHeader) isHeader = false;
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

type DocxBlock = Paragraph | Table;

function parseMarkdownToDocx(markdown: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip the metadata header at the top (lines starting with | or > before first ##)
    if (line.startsWith('| ') || line.startsWith('> ') || line === '---' || line === '') {
      i++;
      continue;
    }

    // H1 — document title (skip — already on cover page)
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      i++;
      continue;
    }

    // H2 — section header
    if (line.startsWith('## ')) {
      const text = line.replace(/^##\s+/, '');
      // Skip if it's a meta header like "Veterans History Project Anniversary Film"
      if (!text.match(/^\d+\.\s/)) {
        i++;
        continue;
      }
      blocks.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: true,
              size: 28,
              font: HEADING_FONT,
              color: HEADER_COLOR,
              allCaps: true,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 160 },
          border: { bottom: { color: HEADER_COLOR, size: 6, style: BorderStyle.SINGLE } },
        })
      );
      i++;
      continue;
    }

    // H3 — sub-section header
    if (line.startsWith('### ')) {
      const text = line.replace(/^###\s+/, '');
      blocks.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: true,
              size: 24,
              font: HEADING_FONT,
              color: HEADER_COLOR,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 320, after: 120 },
        })
      );
      i++;
      continue;
    }

    // Bold standalone line (often a sub-heading)
    if (line.startsWith('**') && line.endsWith('**') && !line.includes('|')) {
      const text = line.slice(2, -2);
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: BODY_SIZE, font: HEADING_FONT, color: '333333' })],
          spacing: { before: 240, after: 80 },
        })
      );
      i++;
      continue;
    }

    // Table — collect all table lines
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        blocks.push(buildTableFromMarkdown(tableLines));
        blocks.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      }
      continue;
    }

    // Bullet list item
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const text = line.replace(/^[-•]\s+/, '');
      blocks.push(
        new Paragraph({
          children: parseInlineMarkdown(text),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      i++;
      continue;
    }

    // Non-empty paragraph
    if (line.trim()) {
      blocks.push(
        new Paragraph({
          children: parseInlineMarkdown(line),
          spacing: { after: 160 },
        })
      );
    }

    i++;
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────
// Footer builder
// ─────────────────────────────────────────────────────────────

function buildFooter(title: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `${DSS_NAME} — ${title}    |    Page `,
            size: 16,
            font: BODY_FONT,
            color: '888888',
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 16,
            font: BODY_FONT,
            color: '888888',
          }),
          new TextRun({
            text: ' of ',
            size: 16,
            font: BODY_FONT,
            color: '888888',
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: 16,
            font: BODY_FONT,
            color: '888888',
          }),
          new TextRun({
            text: `    |    Proprietary & Confidential`,
            size: 16,
            font: BODY_FONT,
            color: '888888',
          }),
        ],
        alignment: AlignmentType.CENTER,
        border: { top: { color: 'cccccc', size: 4, style: BorderStyle.SINGLE } },
      }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Export a proposal as a submission-ready .docx file.
 * Returns the absolute path to the written file.
 */
export async function exportProposalToDocx(opts: ExportOptions): Promise<string> {
  const coverPage = buildCoverPage(opts);
  const proposalBody = parseMarkdownToDocx(opts.markdownContent);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-bullet',
          levels: [
            {
              level: 0,
              format: NumberFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } },
                run: { font: 'Symbol', size: BODY_SIZE },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
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
        headers: {
          default: new Header({
            children: [new Paragraph({ text: '' })],
          }),
        },
        footers: {
          default: buildFooter(opts.title),
        },
        children: [...coverPage, ...proposalBody],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, buffer);

  return opts.outputPath;
}
