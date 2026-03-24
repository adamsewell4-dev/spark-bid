-- Spark Bid SQLite Schema
-- Run via: npm run db:migrate

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- opportunities
-- Stores RFPs discovered on SAM.gov and GSA eBuy
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
  id                   TEXT PRIMARY KEY,           -- SAM.gov noticeId (or generated UUID)
  notice_id            TEXT,                        -- SAM.gov noticeId
  title                TEXT NOT NULL,
  solicitation_number  TEXT,
  agency               TEXT,                        -- fullParentPathName from SAM.gov
  naics_code           TEXT,
  type                 TEXT,                        -- Presolicitation, Solicitation, etc.
  posted_date          TEXT,                        -- ISO 8601
  response_deadline    TEXT,                        -- ISO 8601
  archive_date         TEXT,                        -- ISO 8601
  description          TEXT,
  active               INTEGER NOT NULL DEFAULT 1,  -- 1 = active, 0 = archived
  url                  TEXT,                        -- Link to the full notice on SAM.gov
  attachments_json     TEXT,                        -- JSON array of attachment URLs/names
  raw_json             TEXT,                        -- Full raw API response for auditing
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- proposals
-- Generated and submitted proposals for opportunities
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN ('draft', 'review', 'submitted')) DEFAULT 'draft',
  content_json     TEXT,   -- JSON object with section keys: executive_summary, technical_approach, etc.
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- templates
-- Reusable boilerplate text for proposal sections
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  section    TEXT NOT NULL,  -- executive_summary, technical_approach, past_performance, etc.
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- deadlines
-- Tracks submission deadlines and alert status
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deadlines (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  deadline_date    TEXT NOT NULL,  -- ISO 8601
  alert_sent       INTEGER NOT NULL DEFAULT 0,  -- 1 = alert has been sent
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- requirements
-- Extracted compliance items from each RFP
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requirements (
  id                TEXT PRIMARY KEY,
  opportunity_id    TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  requirement_text  TEXT NOT NULL,
  category          TEXT,           -- technical, administrative, pricing, certifications, etc.
  met               INTEGER NOT NULL DEFAULT 0,  -- 1 = DSS can meet this requirement
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- past_performance
-- Verified reference library for proposal generation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS past_performance (
  id           TEXT PRIMARY KEY,
  client_name  TEXT NOT NULL,
  project_name TEXT NOT NULL,
  value_usd    INTEGER,          -- Contract value in US dollars (whole number)
  start_date   TEXT,             -- ISO 8601 date (YYYY-MM-DD)
  end_date     TEXT,             -- ISO 8601 date (YYYY-MM-DD)
  description  TEXT,
  naics_code   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- commercial_projects
-- Projects sourced from Fireflies discovery call transcripts.
-- Drives the commercial proposal workflow (brief → PandaDoc → Saturation).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commercial_projects (
  id                      TEXT PRIMARY KEY,
  fireflies_transcript_id TEXT UNIQUE,           -- Fireflies transcript ID
  client_name             TEXT NOT NULL,
  project_type            TEXT,                  -- brand_commercial | product_launch | corporate_story | training_video
  project_description     TEXT,
  deliverables            TEXT,                  -- JSON array of strings
  timeline                TEXT,
  budget_signal           TEXT,                  -- What was said on the call, verbatim
  tone                    TEXT,                  -- Creative direction / tone descriptors
  cover_letter_seeds      TEXT,                  -- JSON array of user-confirmed seed phrases
  suggested_seeds         TEXT,                  -- JSON array of AI-suggested phrases from transcript (read-only suggestions)
  case_study_match        TEXT,                  -- Suggested past performance references
  payment_schedule        TEXT,                  -- 'option_a' | 'option_b'
  discovery_notes         TEXT,                  -- Free-text notes from the person on the discovery call
  status                  TEXT NOT NULL DEFAULT 'brief_pending',
    -- brief_pending → brief_confirmed → generating → draft → sent → revised → signed
  saturation_project_id   TEXT,
  pandadoc_document_id    TEXT,
  pandadoc_status         TEXT,                  -- draft | sent | viewed | approved | rejected | signed
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- proposal_versions
-- Tracks each PandaDoc document version per commercial project.
-- Required because sent/viewed/signed docs must never be overwritten —
-- a new version must be created and flagged for review instead.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_versions (
  id                      TEXT PRIMARY KEY,
  commercial_project_id   TEXT NOT NULL REFERENCES commercial_projects(id) ON DELETE CASCADE,
  pandadoc_document_id    TEXT NOT NULL,
  version_number          INTEGER NOT NULL DEFAULT 1,
  status                  TEXT,                  -- mirrors PandaDoc document status
  needs_review            INTEGER NOT NULL DEFAULT 0,  -- 1 = flagged "Revised Version — review before sending"
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ─────────────────────────────────────────────────────────────
-- Indexes for common query patterns
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_opportunities_naics      ON opportunities(naics_code);
CREATE INDEX IF NOT EXISTS idx_opportunities_active     ON opportunities(active);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline   ON opportunities(response_deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_posted     ON opportunities(posted_date);
CREATE INDEX IF NOT EXISTS idx_proposals_opportunity    ON proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status         ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_deadlines_opportunity    ON deadlines(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date           ON deadlines(deadline_date);
CREATE INDEX IF NOT EXISTS idx_requirements_opportunity  ON requirements(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_commercial_status         ON commercial_projects(status);
CREATE INDEX IF NOT EXISTS idx_commercial_client         ON commercial_projects(client_name);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_project ON proposal_versions(commercial_project_id);
