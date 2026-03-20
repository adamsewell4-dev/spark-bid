# CLAUDE.md — Spark Bid
## GSA RFP Automation Platform for Digital Spark Studios

> Drop this file at the root of the `spark-bid/` project. Claude Code loads it
> automatically at the start of every session. Keep it under 200 lines.

---

## Project Identity

- **Software Name:** Spark Bid
- **Company:** Digital Spark Studios
- **Founded:** 2015 | **Founders:** Adam Sewell (Executive Producer) & Joshua Hieber (Executive Director)
- **GSA Schedule:** SIN 512110 — Motion Picture and Video Production
- **Purpose:** Automate the full RFP lifecycle on SAM.gov and GSA eBuy — discovery → parsing → proposal drafting → deadline tracking → submission

---

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript (strict mode always)
- **Frontend:** React 18 + Tailwind CSS
- **Backend:** Express.js REST API
- **Database:** SQLite via `better-sqlite3` (no external server required)
- **AI:** Anthropic Claude API — model `claude-sonnet-4-20250514`
- **PDF/Doc Parsing:** `pdf-parse` + `mammoth`
- **Scheduling:** `node-cron`
- **Testing:** Vitest

---

## Project Structure

```
spark-bid/
├── CLAUDE.md
├── README.md
├── .env                        ← secrets, never commit
├── .env.example
├── package.json
├── src/
│   ├── monitor/                ← Module 1: SAM.gov + GSA eBuy scanner
│   ├── parser/                 ← Module 2: RFP doc ingestion + extraction
│   ├── compliance/             ← Module 3: Compliance checklist generator
│   ├── proposals/              ← Module 4: AI proposal draft generator
│   ├── tracker/                ← Module 5: Deadline + submission tracker
│   ├── db/                     ← SQLite CRUD layer
│   ├── api/                    ← Express REST routes
│   ├── config.ts               ← All env vars accessed HERE only
│   └── ui/                     ← React dashboard
├── data/
│   ├── company-profile/        ← DSS capabilities, boilerplate text
│   └── past-proposals/         ← Stored past proposals for AI reuse
└── .claude/
    └── rules/
        ├── proposals.md        ← Proposal generation rules
        └── api.md              ← API response format rules
```

---

## Dev Commands

- `npm run dev` — Start API + UI in development mode
- `npm run monitor` — Manually trigger SAM.gov opportunity scan
- `npm run build` — Production build
- `npm run test` — Run all Vitest tests
- `npm run db:migrate` — Run SQLite migrations
- `npm run db:seed` — Seed company profile and past performance data

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=           # Claude API — proposal generation
SAM_GOV_API_KEY=             # Free key from sam.gov
POLL_INTERVAL_HOURS=6        # RFP scan frequency
NAICS_FILTER=512110          # Primary NAICS for DSS
PORT=3000
```
Never access `process.env` directly in modules — use `src/config.ts` only.

---

## Company Profile — Use in ALL Proposal Generation

Always load `data/company-profile/` before generating any proposal content.
Key facts to use verbatim:

**Identity**
- Company: Digital Spark Studios | Est. 2015 | Charlotte, NC area
- Founders: Adam Sewell (Executive Producer), Joshua Hieber (Executive Director)
- W2 Staff: 3 full-time + vetted freelance network
- GSA SIN: 512110 — Motion Picture and Video Production

**Core Services**
- Pre-production: concept development, scriptwriting, storyboarding, location scouting
- Production: HD/4K filming, drone cinematography (FAA Part 107 certified), live-action
- Post-production: editing, color grading, sound design, motion graphics
- Animation: 2D and 3D (After Effects, Cinema 4D, 3DS MAX)
- Training & Educational Video: instructional content, curriculum-based modules
- Documentary & Storytelling: brand anthems, narrative campaigns

**Tools**
- Editing: Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro
- Animation: Adobe After Effects, Cinema 4D, 3DS MAX
- Project Mgmt: ClickUp | Finance: QuickBooks Online | CPA: A. Quarles CPA

**Past Performance (use these real references)**
1. Carnegie Mellon University — Brand Anthem campaign — $436,390 — Mar–Jul 2023
2. Atlas Copco — Training/product videos retainer — $120,000 — May–Nov 2022
3. SleepMe — Commercial advertising spots — $137,000 — Apr–Jun 2024
4. Qworky — Training video modules (on-location) — $80,065 — Feb–Apr 2023

**Competitive Differentiators**
- End-to-end production (ideation through delivery)
- Award-winning directors, cinematographers, editors
- FAA Part 107 certified drone operators
- 50+ years combined team experience
- Adobe Certified Professionals on staff
- Subcontractors perform less than 50% of work (FAR 52.219-14 compliant)

---

## Proposal Generation Rules

- ALWAYS pull real company data from `data/company-profile/` — never invent capabilities
- ALWAYS reference actual past performance from the four clients listed above
- Standard proposal sections: Executive Summary → Technical Approach → Past Performance → Management Plan → Pricing Narrative → Compliance Matrix
- Tone: professional, confident, government-contractor register
- Flag any RFP requirement DSS cannot fulfill — never fabricate coverage
- Quality control leads: Joshua Hieber (Executive Director) + Adam Sewell (Executive Producer)

---

## Coding Conventions

- TypeScript strict — never use `any`
- `async/await` only — no raw `.then()` chains
- All API responses: `{ success: boolean, data?: unknown, error?: string }`
- Named exports everywhere — default exports only for React components
- Error messages must be human-readable (non-engineers use this tool)
- Log all SAM.gov API calls with timestamps for compliance audit trail
- SAM.gov rate limit: max 10 req/sec — always throttle

---

## Database Tables (SQLite)

| Table | Purpose |
|---|---|
| `opportunities` | RFPs from SAM.gov / GSA eBuy |
| `proposals` | Generated + submitted proposals |
| `templates` | Reusable proposal section templates |
| `deadlines` | Submission deadlines with alert flags |
| `requirements` | Extracted compliance items per RFP |
| `past_performance` | Reference library for proposal reuse |

---

## Key Constraints

- Never commit `.env` to git — add to `.gitignore`
- Never log full proposal text or pricing details
- Keep this file under 200 lines — move extended rules to `.claude/rules/`
- All `data/` file reads use relative paths only
