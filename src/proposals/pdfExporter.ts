/**
 * src/proposals/pdfExporter.ts
 *
 * Converts a proposal markdown string into a submission-ready PDF.
 * Uses puppeteer (headless Chromium) to render a styled HTML template.
 *
 * Output: Professionally formatted PDF with cover page, page numbers,
 * headers, compliance table, and DSS branding.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PdfExportOptions {
  title: string;
  agency: string;
  solicitationNumber: string;
  responseDeadline?: string;
  markdownContent: string;
  outputPath: string;
}

// ─────────────────────────────────────────────────────────────
// Markdown → HTML converter
// ─────────────────────────────────────────────────────────────

function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Strip metadata table lines at the top and draft note
  html = html.replace(/^\|.*\|.*$/gm, '');
  html = html.replace(/^>.*$/gm, '');

  // Remove top-level # heading (already on cover page)
  html = html.replace(/^# .+$/m, '');

  // ## Section headings → styled h2
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // ### Sub-headings → h3
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Tables — convert markdown table to HTML table
  html = html.replace(
    /((?:\|.+\|\n)+)/g,
    (tableBlock: string) => {
      const rows = tableBlock.trim().split('\n');
      const headerRow = rows[0];
      const dataRows = rows.slice(2); // skip separator row

      const headerCells = headerRow
        .split('|')
        .slice(1, -1)
        .map((c) => `<th>${c.trim().replace(/\*\*/g, '')}</th>`)
        .join('');

      const bodyRows = dataRows
        .map((row, idx) => {
          const cells = row
            .split('|')
            .slice(1, -1)
            .map((c) => `<td>${c.trim()}</td>`)
            .join('');
          return `<tr class="${idx % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
        })
        .join('\n');

      return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
  );

  // Bullet lists — group consecutive - lines into <ul>
  html = html.replace(/((?:^- .+\n?)+)/gm, (block: string) => {
    const items = block
      .trim()
      .split('\n')
      .map((line) => `<li>${line.replace(/^- /, '').trim()}</li>`)
      .join('\n');
    return `<ul>${items}</ul>`;
  });

  // Paragraphs — wrap non-empty non-block lines
  const lines = html.split('\n');
  const processed: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      processed.push('');
    } else if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('</') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<hr') ||
      trimmed.startsWith('<tr') ||
      trimmed.startsWith('<td') ||
      trimmed.startsWith('<th') ||
      trimmed.startsWith('<thead') ||
      trimmed.startsWith('<tbody')
    ) {
      processed.push(trimmed);
    } else {
      processed.push(`<p>${trimmed}</p>`);
    }
  }

  return processed.join('\n');
}

// ─────────────────────────────────────────────────────────────
// HTML template builder
// ─────────────────────────────────────────────────────────────

function buildHtml(opts: PdfExportOptions): string {
  const bodyHtml = markdownToHtml(opts.markdownContent);
  const agencyShort = opts.agency.split('.').pop() ?? opts.agency;
  const submissionDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title} — Digital Spark Studios Proposal</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
  }

  /* ── Cover page ── */
  .cover {
    page-break-after: always;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 2in 1in 1in;
    text-align: center;
  }

  .cover-company {
    font-size: 28pt;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8pt;
  }

  .cover-gsa {
    font-size: 11pt;
    color: #666;
    margin-bottom: 40pt;
  }

  .cover-rule {
    width: 100%;
    border-top: 3px solid #1e3a5f;
    margin-bottom: 40pt;
  }

  .cover-label {
    font-size: 10pt;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 10pt;
  }

  .cover-title {
    font-size: 20pt;
    font-weight: bold;
    color: #1a1a1a;
    margin-bottom: 16pt;
    line-height: 1.3;
  }

  .cover-agency {
    font-size: 12pt;
    color: #444;
    margin-bottom: 60pt;
  }

  .cover-details {
    margin-bottom: 60pt;
    line-height: 2;
  }

  .cover-details strong { font-weight: bold; }

  .cover-disclaimer {
    font-size: 9pt;
    color: #888;
    font-style: italic;
    max-width: 5in;
    line-height: 1.5;
    margin-top: auto;
    padding-bottom: 0.5in;
  }

  /* ── Body content ── */
  .content {
    padding: 1in;
  }

  h2 {
    font-size: 14pt;
    font-weight: bold;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 30pt;
    margin-bottom: 10pt;
    padding-bottom: 4pt;
    border-bottom: 1.5px solid #1e3a5f;
  }

  h3 {
    font-size: 12pt;
    font-weight: bold;
    color: #333;
    margin-top: 18pt;
    margin-bottom: 6pt;
  }

  p {
    margin-bottom: 10pt;
    text-align: justify;
  }

  ul {
    margin: 8pt 0 10pt 20pt;
    padding: 0;
  }

  li {
    margin-bottom: 5pt;
  }

  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 20pt 0;
  }

  /* ── Compliance table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0 16pt;
    font-size: 10pt;
  }

  thead tr {
    background-color: #1e3a5f;
    color: white;
  }

  th {
    padding: 8pt 10pt;
    text-align: left;
    font-weight: bold;
  }

  td {
    padding: 7pt 10pt;
    border-bottom: 1px solid #e0e0e0;
    vertical-align: top;
  }

  tr.even td { background-color: #f0f4f8; }
  tr.odd td { background-color: #ffffff; }

  /* ── Page numbers (printed via @page) ── */
  @page {
    size: letter;
    margin: 1in;

    @bottom-center {
      content: "Digital Spark Studios  —  " attr(data-title) "    |    Page " counter(page) " of " counter(pages) "    |    Proprietary & Confidential";
      font-family: 'Times New Roman', Times, serif;
      font-size: 8pt;
      color: #888;
      border-top: 1px solid #ccc;
      padding-top: 4pt;
    }
  }

  @page :first {
    @bottom-center { content: none; }
  }

  /* ── Print-specific ── */
  @media print {
    .cover { height: 100vh; }
    h2 { page-break-before: avoid; }
    table { page-break-inside: avoid; }
  }
</style>
</head>
<body data-title="${opts.title}">

<!-- Cover Page -->
<div class="cover">
  <div class="cover-company">Digital Spark Studios</div>
  <div class="cover-gsa">GSA Schedule SIN 512110 — Motion Picture and Video Production</div>
  <div class="cover-rule"></div>
  <div class="cover-label">Proposal For</div>
  <div class="cover-title">${opts.title}</div>
  <div class="cover-agency">${agencyShort}</div>
  <div class="cover-details">
    <strong>Solicitation Number:</strong> ${opts.solicitationNumber || 'See RFP'}<br>
    <strong>Submission Date:</strong> ${submissionDate}<br>
    <strong>Point of Contact:</strong> Joshua Hieber, Executive Director<br>
    <span style="color:#666">Charlotte, NC</span>
  </div>
  <div class="cover-disclaimer">
    This proposal contains proprietary information and is submitted in response to the above
    solicitation. The information herein is confidential and shall not be disclosed outside
    the Government.
  </div>
</div>

<!-- Proposal Body -->
<div class="content">
${bodyHtml}
</div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Export a proposal as a submission-ready PDF.
 * Returns the absolute path to the written file.
 */
export async function exportProposalToPdf(opts: PdfExportOptions): Promise<string> {
  // Dynamic import — puppeteer is a large dependency
  const puppeteer = await import('puppeteer');

  const html = buildHtml(opts);
  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: opts.outputPath,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in',
      },
    });
  } finally {
    await browser.close();
  }

  return opts.outputPath;
}
