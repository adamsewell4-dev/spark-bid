/**
 * src/api/routes/parser.ts
 *
 * Express router for parser endpoints.
 * POST /api/parse/:opportunityId — trigger parsing for an opportunity
 */

import { Router, Request, Response } from 'express';
import { parseOpportunity } from '../../parser/index.js';

export const parserRouter = Router();

// ─────────────────────────────────────────────────────────────
// POST /api/parse/:opportunityId
// ─────────────────────────────────────────────────────────────

parserRouter.post('/:opportunityId', async (req: Request, res: Response) => {
  try {
    const { opportunityId } = req.params;

    const result = await parseOpportunity(opportunityId);

    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] [api] [parser] [error — ${message}]`
    );
    res.status(500).json({
      success: false,
      error: `Could not parse opportunity documents: ${message}`,
    });
  }
});
