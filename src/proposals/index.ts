/**
 * src/proposals/index.ts
 *
 * Public API surface for Module 4: Proposals.
 *
 * Re-exports the proposal generator and formatters.
 */

export { generateProposal } from './proposalGenerator.js';
export type { ProposalDraft } from './proposalGenerator.js';

export {
  formatProposalAsMarkdown,
  formatProposalAsTxt,
} from './proposalFormatter.js';
