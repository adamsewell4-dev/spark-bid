# Spark Bid
### GSA RFP Automation Platform — Digital Spark Studios

Spark Bid automates the end-to-end GSA RFP response workflow for Digital Spark Studios — a GSA Schedule vendor under SIN 512110 (Motion Picture and Video Production). It monitors SAM.gov and GSA eBuy for new opportunities, parses solicitation documents, generates AI-powered proposal drafts using real company data, and tracks deadlines through a web dashboard.

---

## Why This Exists

Responding to government RFPs is one of the most time-consuming parts of running a government contracting business. For each opportunity, a vendor must:

1. Find relevant solicitations across multiple platforms
2. Read and extract hundreds of compliance requirements
3. Write a full proposal that references past performance and capabilities
4. Track submission deadlines across multiple active bids

Spark Bid automates steps 1–3 entirely and makes step 4 visual and manageable.

---

## Features

| Module | What It Does |
|---|---|
| **Monitor** | Polls SAM.gov API + GSA eBuy every 6 hours for new NAICS 512110 opportunities |
| **Parser** | Downloads RFP attachments (PDF/DOCX) and extracts structured requirements |
| **Compliance** | Generates a checklist of every mandatory requirement from the solicitation |
| **Proposals** | Drafts full proposals using the Claude API, seeded with DSS company data |
| **Tracker** | Dashboard showing all active bids, deadlines, and submission status |

---

## Quick Start

### Prerequisites
- Node.js 20+
- A free [SAM.gov API key](https://sam.gov/content/entity-registration) (register at sam.gov)
- An Anthropic API key (for proposal generation)

### Install

```bash
git clone https://github.com/your-org/spark-bid.git
cd spark-bid
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` to access the dashboard.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```bash
ANTHROPIC_API_KEY=sk-ant-...       # From console.anthropic.com
SAM_GOV_API_KEY=...                # Free from sam.gov
POLL_INTERVAL_HOURS=6              # How often to scan (default: 6)
NAICS_FILTER=512110                # NAICS code filter
PORT=3000
```

---

## Project Structure

```
spark-bid/
├── CLAUDE.md                      ← Claude Code project memory (read this!)
├── src/
│   ├── monitor/
│   │   ├── samGovClient.ts        ← SAM.gov API polling
│   │   ├── gsaEbuyClient.ts       ← GSA eBuy scraper/feed reader
│   │   └── opportunityFilter.ts   ← NAICS + keyword filtering logic
│   ├── parser/
│   │   ├── documentDownloader.ts  ← Fetch RFP attachments
│   │   ├── pdfParser.ts           ← Extract text from PDFs
│   │   └── requirementExtractor.ts ← AI-powered requirement parsing
│   ├── compliance/
│   │   ├── checklistGenerator.ts  ← Build compliance matrix per RFP
│   │   └── checklistTemplates.ts  ← Standard government compliance items
│   ├── proposals/
│   │   ├── proposalGenerator.ts   ← Main AI proposal drafting engine
│   │   ├── sectionBuilders/       ← One file per proposal section
│   │   │   ├── executiveSummary.ts
│   │   │   ├── technicalApproach.ts
│   │   │   ├── pastPerformance.ts
│   │   │   ├── managementPlan.ts
│   │   │   └── pricingNarrative.ts
│   │   └── proposalFormatter.ts   ← Output to DOCX/PDF
│   ├── tracker/
│   │   ├── deadlineMonitor.ts     ← Alert engine for upcoming deadlines
│   │   └── submissionTracker.ts   ← Track bid status per opportunity
│   ├── db/
│   │   ├── schema.sql             ← SQLite schema
│   │   ├── migrations/            ← Versioned migrations
│   │   └── index.ts               ← better-sqlite3 connection + queries
│   ├── api/
│   │   ├── routes/
│   │   │   ├── opportunities.ts   ← GET /api/opportunities
│   │   │   ├── proposals.ts       ← POST /api/proposals/generate
│   │   │   ├── compliance.ts      ← GET /api/compliance/:id
│   │   │   └── tracker.ts         ← GET/PATCH /api/deadlines
│   │   └── server.ts              ← Express app setup
│   ├── ui/
│   │   ├── Dashboard.tsx          ← Main opportunity feed
│   │   ├── ProposalEditor.tsx     ← Review + edit AI-generated proposals
│   │   ├── ComplianceMatrix.tsx   ← Visual checklist per RFP
│   │   └── DeadlineTracker.tsx    ← Calendar + urgency view
│   └── config.ts                  ← All env vars — import from here only
├── data/
│   ├── company-profile/
│   │   ├── capabilities.md        ← DSS services and differentiators
│   │   ├── team.md                ← Staff bios + qualifications
│   │   └── boilerplate.md         ← Pre-approved proposal language
│   └── past-proposals/            ← Store submitted proposals here
└── .claude/
    └── rules/
        ├── proposals.md           ← Detailed AI proposal rules
        └── api.md                 ← API response format rules
```

---

## Company Data (Seeded)

The `npm run db:seed` command pre-loads Digital Spark Studios' company data, including:

**Past Performance References**
- Carnegie Mellon University — Brand Anthem — $436,390 (2023)
- Atlas Copco — Training video retainer — $120,000 (2022)
- SleepMe — Commercial advertising — $137,000 (2024)
- Qworky — Training modules, on-location — $80,065 (2023)

**Core Capabilities (NAICS 512110)**
- HD/4K video production and direction
- FAA Part 107 certified drone cinematography
- 2D/3D animation (Cinema 4D, After Effects, 3DS MAX)
- Post-production, color grading, sound design
- Training and educational video programs
- Brand storytelling and documentary production

---

## How Proposal Generation Works

1. User selects an opportunity from the dashboard
2. Spark Bid downloads and parses the solicitation documents
3. The compliance module extracts all mandatory requirements
4. The proposal generator calls the Claude API with:
   - The RFP requirements
   - DSS company profile and capabilities
   - Relevant past performance references
   - Pre-approved boilerplate language
5. A full draft proposal is returned, section by section
6. User reviews and edits in the proposal editor
7. Final document exported as DOCX or PDF

---

## SAM.gov API Notes

- Register for a free API key at [sam.gov](https://sam.gov)
- Rate limit: 10 requests/second — Spark Bid throttles automatically
- Opportunities endpoint: `https://api.sam.gov/opportunities/v2/search`
- Filter parameters used: `naicsCode=512110`, `postedFrom`, `active=true`

---

## Adding Past Proposals

Drop `.docx` or `.pdf` files into `data/past-proposals/`. Run:

```bash
npm run db:seed:proposals
```

The AI will reference these when drafting new proposals for similar work.

---

## Roadmap

- [ ] GSA eBuy integration (polling + parsing)
- [ ] Email/SMS deadline alerts
- [ ] Proposal version history and diff view
- [ ] One-click SAM.gov submission (when API supports it)
- [ ] Win/loss tracking and analytics

---

## Built With

- [Anthropic Claude API](https://docs.anthropic.com) — Proposal generation
- [SAM.gov API](https://open.gsa.gov/api/sam/) — Opportunity data
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Local database
- [Express](https://expressjs.com) — REST API
- [React](https://react.dev) + [Tailwind CSS](https://tailwindcss.com) — Dashboard

---

*Built for Digital Spark Studios — GSA SIN 512110*
