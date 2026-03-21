/**
 * src/api/routes/proposals.ts
 *
 * Express router for proposal endpoints.
 * GET  /api/proposals/:opportunityId   — get existing proposal
 * POST /api/proposals/generate         — generate a new proposal draft
 */

import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import { generateProposal } from '../../proposals/index.js';

export const proposalsRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/proposals — list all proposals with opportunity info
// ─────────────────────────────────────────────────────────────

proposalsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT p.*, o.title as opportunity_title, o.agency, o.response_deadline
      FROM proposals p
      LEFT JOIN opportunities o ON o.id = p.opportunity_id
      ORDER BY p.created_at DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: `Could not load proposals: ${message}` });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/proposals/generate
// Must be registered before /:opportunityId to avoid route conflict
// ─────────────────────────────────────────────────────────────

proposalsRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { opportunityId } = req.body as { opportunityId?: string };

    if (!opportunityId || typeof opportunityId !== 'string' || opportunityId.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Please provide an opportunityId in the request body.',
      });
      return;
    }

    const draft = await generateProposal(opportunityId.trim());

    res.json({ success: true, data: draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] [api] [proposals] [generate error — ${message}]`
    );
    res.status(500).json({
      success: false,
      error: `Could not generate proposal: ${message}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/proposals/:opportunityId
// ─────────────────────────────────────────────────────────────

proposalsRouter.get('/:opportunityId', (req: Request, res: Response) => {
  try {
    const { opportunityId } = req.params;

    const proposal = db
      .prepare(
        'SELECT * FROM proposals WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(opportunityId);

    if (!proposal) {
      res.status(404).json({
        success: false,
        error: 'No proposal found for this opportunity. Generate one first.',
      });
      return;
    }

    res.json({ success: true, data: proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] [api] [proposals] [get error — ${message}]`
    );
    res.status(500).json({
      success: false,
      error: 'Could not load proposal. Please try again.',
    });
  }
});
