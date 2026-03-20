/**
 * src/compliance/checklistTemplates.ts
 *
 * Standard government compliance items that apply to ALL federal solicitations
 * regardless of RFP content. These are automatically prepended to every
 * checklist generated for any opportunity.
 *
 * These items reflect standing FAR/GSA obligations for DSS and do not require
 * extraction from individual RFP documents.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface StandardComplianceItem {
  text: string;
  category: 'mandatory' | 'submission';
}

// ─────────────────────────────────────────────────────────────
// Standard items
// ─────────────────────────────────────────────────────────────

export const STANDARD_COMPLIANCE_ITEMS: readonly StandardComplianceItem[] = [
  {
    text: 'SAM.gov registration must be active at time of award.',
    category: 'mandatory',
  },
  {
    text: 'Annual representations and certifications must be current in SAM.gov.',
    category: 'mandatory',
  },
  {
    text: 'Subcontractors must perform less than 50% of total work (FAR 52.219-14).',
    category: 'mandatory',
  },
  {
    text: 'Offeror must hold the applicable GSA Schedule SIN or be eligible for the contract vehicle.',
    category: 'mandatory',
  },
  {
    text: 'All pricing must be fair and reasonable per FAR Part 15.',
    category: 'mandatory',
  },
  {
    text: 'Proposal must be submitted by the stated deadline in the correct format.',
    category: 'submission',
  },
  {
    text: 'Past performance references must cover work performed within the last 3 years.',
    category: 'submission',
  },
  {
    text: 'Technical proposal and price proposal must be submitted as separate volumes if required.',
    category: 'submission',
  },
] as const;
