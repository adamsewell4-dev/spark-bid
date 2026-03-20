/**
 * src/monitor/index.ts
 *
 * Monitor orchestrator for Spark Bid.
 *
 * Coordinates the SAM.gov polling cycle:
 *   1. Fetch opportunities posted in the last N hours (POLL_INTERVAL_HOURS)
 *   2. Filter to relevant video production opportunities
 *   3. Upsert new/updated records into the local SQLite database
 *   4. Log a summary of the cycle
 *
 * Usage:
 *   - Import runMonitorCycle() into the cron scheduler (src/api/server.ts)
 *   - Run directly with: npm run monitor
 *
 * Log format: [TIMESTAMP] [monitor] [ACTION] [STATUS]
 */

import { fileURLToPath } from 'node:url';
import { fetchOpportunities } from './samGovClient.js';
import { filterOpportunities } from './opportunityFilter.js';
import { upsertOpportunity } from '../db/index.js';
import { config } from '../config.js';
import type { SamGovOpportunity } from './samGovClient.js';

function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Build the SAM.gov opportunity ID used as the primary key in our database.
 * We prefer noticeId from the API since it's the canonical SAM.gov identifier.
 * Falls back to solicitationNumber if noticeId is missing.
 */
function resolveOpportunityId(opportunity: SamGovOpportunity): string {
  if (opportunity.noticeId && opportunity.noticeId.trim() !== '') {
    return opportunity.noticeId.trim();
  }
  if (
    opportunity.solicitationNumber &&
    opportunity.solicitationNumber.trim() !== ''
  ) {
    return `sol-${opportunity.solicitationNumber.trim()}`;
  }
  // Last resort: build a deterministic ID from title + posted date
  const slug = (opportunity.title ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60);
  return `auto-${slug}-${opportunity.postedDate ?? 'nodate'}`;
}

/**
 * Run a single SAM.gov monitor cycle:
 *   - Fetch all opportunities posted in the last POLL_INTERVAL_HOURS hours
 *   - Filter to relevant video production items
 *   - Upsert each into the database
 *   - Return a summary of the results
 */
export async function runMonitorCycle(): Promise<{
  fetched: number;
  relevant: number;
  upserted: number;
  errors: number;
}> {
  const ts = formatTimestamp();
  console.log(
    `[${ts}] [monitor] [cycle start] [polling SAM.gov for last ${config.pollIntervalHours}h of opportunities]`
  );

  // Calculate the lookback window
  const postedFrom = new Date();
  postedFrom.setHours(postedFrom.getHours() - config.pollIntervalHours);

  // ── Step 1: Fetch from SAM.gov ────────────────────────────
  let rawOpportunities: SamGovOpportunity[];
  try {
    rawOpportunities = await fetchOpportunities(postedFrom);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${formatTimestamp()}] [monitor] [cycle error] [SAM.gov fetch failed: ${message}]`
    );
    throw err;
  }

  console.log(
    `[${formatTimestamp()}] [monitor] [fetch complete] [${rawOpportunities.length} raw opportunities retrieved]`
  );

  // ── Step 2: Filter to relevant opportunities ──────────────
  const relevant = filterOpportunities(rawOpportunities);

  console.log(
    `[${formatTimestamp()}] [monitor] [filter complete] [${relevant.length} of ${rawOpportunities.length} opportunities are relevant for DSS]`
  );

  // ── Step 3: Upsert each into the database ─────────────────
  let upserted = 0;
  let errors = 0;

  for (const opp of relevant) {
    const id = resolveOpportunityId(opp);

    try {
      upsertOpportunity({
        id,
        notice_id: opp.noticeId ?? null,
        title: opp.title,
        solicitation_number: opp.solicitationNumber ?? null,
        agency: opp.fullParentPathName ?? null,
        naics_code: opp.naicsCode ?? null,
        type: opp.type ?? null,
        posted_date: opp.postedDate ?? null,
        response_deadline: opp.responseDeadLine ?? null,
        archive_date: opp.archiveDate ?? null,
        description: opp.description ?? null,
        active: opp.active?.toLowerCase() === 'yes' ? 1 : 0,
        url: opp.uiLink ?? null,
        attachments_json:
          opp.resourceLinks && opp.resourceLinks.length > 0
            ? JSON.stringify(opp.resourceLinks)
            : null,
        raw_json: JSON.stringify(opp),
      });

      upserted++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[${formatTimestamp()}] [monitor] [upsert error] [id=${id}, title="${opp.title}", error="${message}"]`
      );
    }
  }

  // ── Step 4: Log summary ───────────────────────────────────
  const status =
    errors === 0
      ? `success — ${upserted} upserted`
      : `partial — ${upserted} upserted, ${errors} errors`;

  console.log(
    `[${formatTimestamp()}] [monitor] [cycle complete] [fetched=${rawOpportunities.length}, relevant=${relevant.length}, upserted=${upserted}, errors=${errors}] [${status}]`
  );

  return {
    fetched: rawOpportunities.length,
    relevant: relevant.length,
    upserted,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────
// Direct execution: npm run monitor
// ─────────────────────────────────────────────────────────────

// Check if this file is being run directly (not imported as a module)
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  console.log(
    `[${formatTimestamp()}] [monitor] [manual run] [starting one-shot monitor cycle]`
  );

  runMonitorCycle()
    .then((summary) => {
      console.log(
        `[${formatTimestamp()}] [monitor] [manual run] [done — ${JSON.stringify(summary)}]`
      );
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[${formatTimestamp()}] [monitor] [manual run] [fatal error — ${message}]`
      );
      process.exit(1);
    });
}
