/**
 * src/api/routes/opportunities.ts
 *
 * Express router for opportunity endpoints.
 * GET /api/opportunities        — list all, supports ?search= query param
 * GET /api/opportunities/:id    — get one opportunity with its requirements
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db, listOpportunities, getOpportunity } from '../../db/index.js';
import type { OpportunityRow } from '../../db/index.js';

export const opportunitiesRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/opportunities
// ─────────────────────────────────────────────────────────────

opportunitiesRouter.get('/', (req: Request, res: Response) => {
  try {
    const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';

    let opportunities: OpportunityRow[];

    if (search) {
      const stmt = db.prepare<[string], OpportunityRow>(
        `SELECT * FROM opportunities WHERE title LIKE ? ORDER BY response_deadline ASC`
      );
      opportunities = stmt.all(`%${search}%`);
    } else {
      opportunities = listOpportunities({ activeOnly: false, limit: 200 });
    }

    res.json({ success: true, data: opportunities });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [api] [opportunities] [list error — ${message}]`);
    res.status(500).json({
      success: false,
      error: 'Could not load opportunities. Please try again.',
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/opportunities  — manually add an eBuy / external RFQ
// ─────────────────────────────────────────────────────────────

opportunitiesRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      title,
      agency,
      solicitation_number,
      response_deadline,
      description,
      source,
      url,
      attachment_urls,
    } = req.body as {
      title: string;
      agency: string;
      solicitation_number?: string;
      response_deadline?: string;
      description?: string;
      source?: string;
      url?: string;
      attachment_urls?: string[];
    };

    if (!title?.trim()) {
      res.status(400).json({ success: false, error: 'Title is required.' });
      return;
    }
    if (!agency?.trim()) {
      res.status(400).json({ success: false, error: 'Agency is required.' });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const attachmentsJson =
      attachment_urls && attachment_urls.length > 0
        ? JSON.stringify(attachment_urls)
        : null;

    db.prepare(`
      INSERT INTO opportunities (
        id, title, agency, solicitation_number, naics_code, type,
        posted_date, response_deadline, description, url,
        attachments_json, active, source, created_at, updated_at
      ) VALUES (
        @id, @title, @agency, @solicitation_number, '512110', 'manual',
        @posted_date, @response_deadline, @description, @url,
        @attachments_json, 1, @source, @now, @now
      )
    `).run({
      id,
      title: title.trim(),
      agency: agency.trim(),
      solicitation_number: solicitation_number?.trim() ?? null,
      posted_date: now.slice(0, 10),
      response_deadline: response_deadline ?? null,
      description: description?.trim() ?? null,
      url: url?.trim() ?? null,
      attachments_json: attachmentsJson,
      source: source ?? 'ebuy',
      now,
    });

    const created = getOpportunity(id);
    console.log(`[${now}] [api] [opportunities] [manual entry created — id=${id} title="${title}"]`);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [api] [opportunities] [create error — ${message}]`);
    res.status(500).json({ success: false, error: 'Could not save opportunity. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/opportunities/:id
// ─────────────────────────────────────────────────────────────

opportunitiesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const opportunity = getOpportunity(id);

    if (!opportunity) {
      res.status(404).json({
        success: false,
        error: 'Could not find that opportunity. It may have been removed from SAM.gov.',
      });
      return;
    }

    const requirements = db
      .prepare('SELECT * FROM requirements WHERE opportunity_id = ?')
      .all(id);

    res.json({
      success: true,
      data: { ...opportunity, requirements },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [api] [opportunities] [get error — ${message}]`);
    res.status(500).json({
      success: false,
      error: 'Could not load opportunity details. Please try again.',
    });
  }
});
