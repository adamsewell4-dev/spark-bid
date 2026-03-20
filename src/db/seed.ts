/**
 * src/db/seed.ts
 *
 * Seeds the past_performance table with Digital Spark Studios' four verified
 * reference projects. Safe to run multiple times — uses upsert semantics.
 *
 * Run via: npm run db:seed
 */

import { savePastPerformance } from './index.js';

interface SeedRecord {
  id: string;
  client_name: string;
  project_name: string;
  value_usd: number;
  start_date: string;
  end_date: string;
  description: string;
  naics_code: string;
}

const VERIFIED_REFERENCES: SeedRecord[] = [
  {
    id: 'pp-carnegie-mellon-2023',
    client_name: 'Carnegie Mellon University',
    project_name: 'Brand Anthem Campaign',
    value_usd: 436390,
    start_date: '2023-03-01',
    end_date: '2023-07-31',
    description:
      'Full-scale brand anthem video campaign for Carnegie Mellon University. ' +
      'Services included pre-production concept development, scriptwriting, storyboarding, ' +
      'location scouting, HD/4K live-action production, post-production editing, ' +
      'color grading, sound design, and motion graphics.',
    naics_code: '512110',
  },
  {
    id: 'pp-atlas-copco-2022',
    client_name: 'Atlas Copco',
    project_name: 'Training and Product Videos Retainer',
    value_usd: 120000,
    start_date: '2022-05-01',
    end_date: '2022-11-30',
    description:
      'Six-month retainer producing training and product demonstration videos for Atlas Copco, ' +
      'a global industrial equipment manufacturer. Work included scripting, on-location production, ' +
      'post-production editing, and final delivery of instructional content for internal training ' +
      'and customer-facing marketing use.',
    naics_code: '512110',
  },
  {
    id: 'pp-sleepme-2024',
    client_name: 'SleepMe',
    project_name: 'Commercial Advertising Spots',
    value_usd: 137000,
    start_date: '2024-04-01',
    end_date: '2024-06-30',
    description:
      'Production of commercial advertising spots for SleepMe, a consumer sleep technology company. ' +
      'Scope included concept development, talent coordination, studio and location production, ' +
      'color grading, audio mastering, and delivery of broadcast-ready 30-second and 60-second spots.',
    naics_code: '512110',
  },
  {
    id: 'pp-qworky-2023',
    client_name: 'Qworky',
    project_name: 'Training Video Modules (On-Location)',
    value_usd: 80065,
    start_date: '2023-02-01',
    end_date: '2023-04-30',
    description:
      'On-location production of training video modules for Qworky. ' +
      'Work included curriculum-based scriptwriting, on-location filming at client facilities, ' +
      'post-production editing, motion graphics, and delivery of complete instructional video modules ' +
      'for employee onboarding and skills development programs.',
    naics_code: '512110',
  },
];

function seed(): void {
  console.log(`[${new Date().toISOString()}] [seed] Starting past_performance seed...`);

  let seeded = 0;
  let failed = 0;

  for (const record of VERIFIED_REFERENCES) {
    try {
      savePastPerformance(record);
      console.log(
        `[${new Date().toISOString()}] [seed] Upserted: ${record.client_name} — ${record.project_name}`
      );
      seeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[${new Date().toISOString()}] [seed] Failed to seed "${record.project_name}": ${message}`
      );
      failed++;
    }
  }

  console.log(
    `[${new Date().toISOString()}] [seed] Complete — ${seeded} records seeded, ${failed} failed.`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

seed();
