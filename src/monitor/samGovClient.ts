/**
 * src/monitor/samGovClient.ts
 *
 * SAM.gov Opportunities v2 API client for Spark Bid.
 *
 * API reference: https://open.gsa.gov/api/get-opportunities-public-api/
 * Rate limit: max 10 requests/second — enforced via p-throttle.
 *
 * All API calls are logged with timestamps for compliance audit trail.
 * Log format: [TIMESTAMP] [monitor] [sam.gov poll] [STATUS]
 */

import axios from 'axios';
import pThrottle from 'p-throttle';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────
// SAM.gov API response types (Opportunities v2)
// ─────────────────────────────────────────────────────────────

/** A single attachment/resource link on a SAM.gov notice */
export interface SamGovResourceLink {
  url: string;
  text?: string;
}

/** Point of contact entry on a SAM.gov notice */
export interface SamGovContact {
  type?: string;
  title?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  fax?: string;
}

/** Address structure used in place of performance */
export interface SamGovAddress {
  streetAddress?: string;
  city?: string;
  state?: { code?: string; name?: string };
  zip?: string;
  country?: { code?: string; name?: string };
}

/**
 * A single opportunity record as returned by the SAM.gov Opportunities v2 API.
 * Fields match the real API response shape documented at:
 * https://open.gsa.gov/api/get-opportunities-public-api/
 */
export interface SamGovOpportunity {
  /** Unique notice identifier assigned by SAM.gov */
  noticeId: string;

  /** Human-readable title of the solicitation */
  title: string;

  /** Official solicitation/RFP number */
  solicitationNumber?: string;

  /** Full agency hierarchy path, e.g. "DEPT OF DEFENSE > ARMY > MICC" */
  fullParentPathName?: string;

  /** Full agency hierarchy code */
  fullParentPathCode?: string;

  /** 6-digit NAICS code string */
  naicsCode?: string;

  /**
   * Notice type label, e.g.:
   * "Presolicitation", "Solicitation", "Sources Sought",
   * "Award Notice", "Special Notice", "Combined Synopsis/Solicitation"
   */
  type?: string;

  /**
   * Base notice type (underlying classification before amendments):
   * "p" = Presolicitation, "o" = Solicitation, "k" = Combined Synopsis, etc.
   */
  baseType?: string;

  /** ISO 8601 date string when the notice was posted */
  postedDate?: string;

  /** ISO 8601 datetime string for the response/proposal deadline */
  responseDeadLine?: string;

  /** ISO 8601 date string when the notice will be archived */
  archiveDate?: string;

  /** Short description text (may be truncated in search results) */
  description?: string;

  /** Whether the notice is currently active on SAM.gov */
  active?: string;

  /** Direct URL to the notice on SAM.gov */
  uiLink?: string;

  /** Array of attachment/document URLs associated with this notice */
  resourceLinks?: string[];

  /** Points of contact for this opportunity */
  pointOfContact?: SamGovContact[];

  /** Place of performance details */
  placeOfPerformance?: {
    streetAddress?: string;
    city?: { code?: string; name?: string };
    state?: { code?: string; name?: string };
    zip?: string;
    country?: { code?: string; name?: string };
  };

  /** Set-aside type code, e.g. "SBA", "8A", "SDVOSBC" */
  typeOfSetAside?: string;

  /** Human-readable set-aside description */
  typeOfSetAsideDescription?: string;

  /** Contract award amount (for award notices) */
  award?: {
    date?: string;
    number?: string;
    amount?: string;
    awardee?: {
      name?: string;
      ueiSAM?: string;
      location?: SamGovAddress;
    };
  };

  /** Additional classification codes */
  classificationCode?: string;

  /** Office address information */
  officeAddress?: {
    zipcode?: string;
    city?: string;
    countryCode?: string;
    state?: string;
  };
}

/** Shape of the SAM.gov Opportunities v2 search response envelope */
interface SamGovSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SamGovOpportunity[];
}

// ─────────────────────────────────────────────────────────────
// Throttle: max 10 requests per second (SAM.gov rate limit)
// ─────────────────────────────────────────────────────────────

const SAM_GOV_BASE_URL = 'https://api.sam.gov/opportunities/v2/search';
const PAGE_SIZE = 100;

function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Raw (un-throttled) function that fetches a single page of SAM.gov results.
 * Retries up to 3 times on 429 rate-limit responses with exponential backoff.
 */
async function fetchPage(
  postedFrom: Date,
  offset: number
): Promise<SamGovSearchResponse> {
  const postedFromStr = formatDateForSamGov(postedFrom);
  const today = formatDateForSamGov(new Date());

  const params: Record<string, string | number | boolean> = {
    api_key: config.samGovApiKey,
    naicsCode: config.naicsFilter,
    active: 'Yes',
    limit: PAGE_SIZE,
    offset,
    postedFrom: postedFromStr,
    postedTo: today,
    // Only return actionable solicitation types (matches SAM.gov website defaults):
    // p=Presolicitation, o=Solicitation, k=Combined Synopsis, r=Sources Sought
    ptype: 'p,o,k,r',
  };

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<SamGovSearchResponse>(SAM_GOV_BASE_URL, {
        params,
        timeout: 30_000,
      });
      return response.data;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const waitMs = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
        console.warn(
          `[${formatTimestamp()}] [monitor] [sam.gov poll] [rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}]`
        );
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Throttled version of fetchPage: max 10 calls per second.
 * p-throttle wraps the function to enforce rate limiting.
 */
const throttledFetchPage = pThrottle({ limit: 5, interval: 1000 })(fetchPage);

/**
 * Format a Date as MM/DD/YYYY for the SAM.gov API postedFrom/postedTo params.
 */
function formatDateForSamGov(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all SAM.gov opportunities posted since `postedFrom`, filtered by
 * the configured NAICS code. Handles pagination automatically.
 *
 * Logs every API call with timestamp and status.
 *
 * @param postedFrom - Only return opportunities posted on or after this date.
 * @returns Flat array of all SamGovOpportunity records found.
 */
export async function fetchOpportunities(
  postedFrom: Date
): Promise<SamGovOpportunity[]> {
  const all: SamGovOpportunity[] = [];
  let offset = 0;
  let totalRecords: number | null = null;

  console.log(
    `[${formatTimestamp()}] [monitor] [sam.gov poll] [starting — naics=${config.naicsFilter}, postedFrom=${formatDateForSamGov(postedFrom)}]`
  );

  do {
    let pageData: SamGovSearchResponse;

    try {
      pageData = await throttledFetchPage(postedFrom, offset);

      console.log(
        `[${formatTimestamp()}] [monitor] [sam.gov poll] [success — offset=${offset}, returned=${pageData.opportunitiesData?.length ?? 0}, totalRecords=${pageData.totalRecords}]`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[${formatTimestamp()}] [monitor] [sam.gov poll] [error — offset=${offset}, message="${message}"]`
      );
      throw new Error(
        `SAM.gov API request failed at offset ${offset}: ${message}. ` +
          `Please check your SAM_GOV_API_KEY and network connection.`
      );
    }

    const opportunities = pageData.opportunitiesData ?? [];
    all.push(...opportunities);

    // Set total on first page
    if (totalRecords === null) {
      totalRecords = pageData.totalRecords ?? 0;
    }

    offset += PAGE_SIZE;

    // Stop if we've collected everything
    if (opportunities.length < PAGE_SIZE || all.length >= totalRecords) {
      break;
    }
  } while (true);

  console.log(
    `[${formatTimestamp()}] [monitor] [sam.gov poll] [complete — total fetched=${all.length}]`
  );

  return all;
}
