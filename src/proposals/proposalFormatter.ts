/**
 * src/proposals/proposalFormatter.ts
 *
 * Formatting utilities for ProposalDraft objects.
 *
 * Provides two output modes:
 *  - formatProposalAsMarkdown — adds a structured header block for review/storage
 *  - formatProposalAsTxt     — plain text version suitable for copy/paste or email
 */

import type { ProposalDraft } from './proposalGenerator.js';

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Format a ProposalDraft as Markdown with a structured header block.
 *
 * The header includes the opportunity title, generated timestamp, and draft
 * status. The proposal body follows immediately after a horizontal rule.
 *
 * @param draft - The proposal draft to format.
 * @returns Markdown string ready for saving to a .md file or rendering in a UI.
 */
export function formatProposalAsMarkdown(draft: ProposalDraft): string {
  const header = [
    `# Proposal: ${draft.title}`,
    ``,
    `| Field             | Value                          |`,
    `|-------------------|--------------------------------|`,
    `| Opportunity ID    | \`${draft.opportunityId}\`          |`,
    `| Generated         | ${draft.generatedAt}           |`,
    `| Status            | Draft                          |`,
    `| Tokens Used       | ${draft.tokensUsed.toLocaleString()} |`,
    ``,
    `> **Note:** This is an AI-generated draft. Review all sections carefully`,
    `> before submission. Verify all facts, certifications, and pricing figures`,
    `> against current Digital Spark Studios capabilities and GSA Schedule rates.`,
    ``,
    `---`,
    ``,
  ].join('\n');

  return header + draft.content;
}

/**
 * Format a ProposalDraft as plain text.
 *
 * Suitable for copy/paste into a submission portal, email, or Word document.
 * All Markdown formatting characters are stripped from the header block;
 * the proposal body is included as-is (Claude typically outputs clean prose).
 *
 * @param draft - The proposal draft to format.
 * @returns Plain text string.
 */
export function formatProposalAsTxt(draft: ProposalDraft): string {
  const separator = '='.repeat(72);
  const thinSeparator = '-'.repeat(72);

  const header = [
    separator,
    `PROPOSAL — ${draft.title.toUpperCase()}`,
    separator,
    `Opportunity ID : ${draft.opportunityId}`,
    `Generated      : ${draft.generatedAt}`,
    `Status         : DRAFT`,
    `Tokens Used    : ${draft.tokensUsed.toLocaleString()}`,
    thinSeparator,
    `NOTE: AI-generated draft. Review all sections before submission.`,
    `      Verify facts, certifications, and pricing against current DSS`,
    `      capabilities and GSA Schedule rates.`,
    separator,
    ``,
  ].join('\n');

  // Strip common Markdown syntax for cleaner plain-text output
  const plainContent = draft.content
    .replace(/^#{1,6}\s+/gm, '')        // Remove heading markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')      // Remove italic
    .replace(/`([^`]+)`/g, '$1')        // Remove inline code
    .replace(/^\s*[-*]\s+/gm, '  - ')  // Normalise bullet points
    .replace(/\|/g, ' | ')              // Add spacing around table pipes
    .replace(/\n{3,}/g, '\n\n');        // Collapse excessive blank lines

  return header + plainContent;
}
