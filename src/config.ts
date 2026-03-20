/**
 * src/config.ts
 *
 * Centralized environment variable access for Spark Bid.
 * This is the ONLY place in the codebase that reads process.env.
 * All other modules import from here.
 */

import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please add it to your .env file. See .env.example for reference.`
    );
  }
  return value.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

function optionalEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') {
    return defaultValue;
  }
  const parsed = Number(raw.trim());
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a number, but got: "${raw}". ` +
        `Please correct your .env file.`
    );
  }
  return parsed;
}

export const config = {
  /** SAM.gov API key — required. Get a free key at https://sam.gov/content/entity-registration */
  samGovApiKey: requireEnv('SAM_GOV_API_KEY'),

  /** Anthropic Claude API key — required for proposal generation */
  anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY', ''),

  /** How often (in hours) to poll SAM.gov for new opportunities. Default: 2160 (90 days) */
  pollIntervalHours: optionalEnvNumber('POLL_INTERVAL_HOURS', 2160),

  /** Primary NAICS code to filter SAM.gov results. Default: 512110 (Motion Picture and Video Production) */
  naicsFilter: optionalEnv('NAICS_FILTER', '512110'),

  /** Express API server port. Default: 3000 */
  port: optionalEnvNumber('PORT', 3000),
} as const;

export type Config = typeof config;
