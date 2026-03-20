/**
 * src/monitor/opportunityFilter.ts
 *
 * Filters SAM.gov opportunities down to those relevant for Digital Spark Studios
 * (GSA SIN 512110, NAICS 512110 — Motion Picture and Video Production).
 *
 * An opportunity is considered relevant if ANY of the following are true:
 *   1. The NAICS code matches the configured filter (default: 512110)
 *   2. The title or description contains video/production keywords
 *
 * Both conditions also require:
 *   - active = "Yes" or "yes" (case-insensitive)
 *   - responseDeadLine is in the future (or not set — we don't discard on missing deadline)
 */

import { config } from '../config.js';
import type { SamGovOpportunity } from './samGovClient.js';

// ─────────────────────────────────────────────────────────────
// Video production keyword list
// ─────────────────────────────────────────────────────────────

// Multi-word or specific phrases that strongly indicate video/media work
const VIDEO_PRODUCTION_KEYWORDS: readonly string[] = [
  'motion picture',
  'video production',
  'film production',
  'training video',
  'documentary',
  'cinematography',
  'videography',
  'audiovisual',
  'audio visual',
  'av production',
  'post-production',
  'post production',
  'multimedia production',
  'media production',
  'broadcast production',
  'event production',
  'photography services',
  'animation services',
];

// Single words that indicate video/media work ONLY when not excluded
const VIDEO_SINGLE_KEYWORDS: readonly string[] = [
  'videoscope',
  'filmmaking',
];

// Title/description fragments that disqualify an otherwise-matching opportunity
const EXCLUSION_KEYWORDS: readonly string[] = [
  'lubricant',
  'resistor',
  'transducer',
  'hull penetrator',
  'actuator',
  'missile',
  'munition',
  'ordnance',
  'ammunition',
  'railcar',
  'crypto',
  'superconducting',
  'thin film',
  'dryfilm',
  'dry film',
  'x-ray film',
  'broadcast seeding',
  'coal',
  'screwworm',
  'sterile',
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if the opportunity's NAICS code matches the configured filter.
 */
function matchesNaicsFilter(opportunity: SamGovOpportunity): boolean {
  return opportunity.naicsCode === config.naicsFilter;
}

/**
 * Returns true if the opportunity title or description contains at least one
 * video production keyword (case-insensitive), and no exclusion keywords.
 */
function containsVideoKeyword(opportunity: SamGovOpportunity): boolean {
  const searchText = [opportunity.title ?? '', opportunity.description ?? '']
    .join(' ')
    .toLowerCase();

  // Disqualify if any exclusion keyword is present
  if (EXCLUSION_KEYWORDS.some((kw) => searchText.includes(kw.toLowerCase()))) {
    return false;
  }

  return (
    VIDEO_PRODUCTION_KEYWORDS.some((kw) => searchText.includes(kw.toLowerCase())) ||
    VIDEO_SINGLE_KEYWORDS.some((kw) => searchText.includes(kw.toLowerCase()))
  );
}

/**
 * Returns true if the opportunity is marked active on SAM.gov.
 * The API returns the string "Yes" or "No" (sometimes lowercase).
 */
function isActive(opportunity: SamGovOpportunity): boolean {
  return opportunity.active?.toLowerCase() === 'yes';
}

/**
 * Returns true if the response deadline is in the future, or if no deadline
 * is set (we keep unknown-deadline items and let the user review manually).
 */
function hasOpenDeadline(opportunity: SamGovOpportunity): boolean {
  if (!opportunity.responseDeadLine) {
    // No deadline specified — keep it for manual review
    return true;
  }

  const deadline = new Date(opportunity.responseDeadLine);
  if (isNaN(deadline.getTime())) {
    // Unparseable date — keep for manual review
    return true;
  }

  return deadline > new Date();
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Determine whether a single SAM.gov opportunity is relevant for
 * Digital Spark Studios based on NAICS match or keyword presence,
 * combined with active status and open deadline checks.
 *
 * @param opportunity - A single SAM.gov opportunity record.
 * @returns true if DSS should review this opportunity.
 */
export function isRelevantOpportunity(opportunity: SamGovOpportunity): boolean {
  // Must be active and have an open deadline
  if (!isActive(opportunity) || !hasOpenDeadline(opportunity)) {
    return false;
  }

  const naics = opportunity.naicsCode ?? '';

  // Exact NAICS 512110 match — always include
  if (naics === config.naicsFilter) return true;

  // naicsCode not set in the API response — SAM.gov already filtered by
  // 512110, so trust it and include the opportunity
  if (naics === '') return true;

  // naicsCode is explicitly set to a non-media sector code — this is a
  // secondary-NAICS hit (e.g. a defense contractor also tagged 512110).
  // Exclude unless it has very specific video production keywords.
  if (!naics.startsWith('51')) {
    return containsVideoKeyword(opportunity) &&
      !EXCLUSION_KEYWORDS.some(kw => (opportunity.title ?? '').toLowerCase().includes(kw));
  }

  // NAICS is in the information sector (51xxxx) — use keyword filter
  return containsVideoKeyword(opportunity);
}

/**
 * Filter an array of SAM.gov opportunities down to those relevant for DSS.
 *
 * @param opportunities - Raw array of opportunities from the SAM.gov API.
 * @returns Filtered array of relevant opportunities.
 */
export function filterOpportunities(
  opportunities: SamGovOpportunity[]
): SamGovOpportunity[] {
  return opportunities.filter(isRelevantOpportunity);
}
