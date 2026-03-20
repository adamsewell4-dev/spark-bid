/**
 * src/api/routes/compliance.ts
 *
 * Express router for compliance checklist endpoints.
 * GET /api/compliance/:opportunityId — returns formatted checklist
 */

import { Router, Request, Response } from 'express';
import { generateChecklist } from '../../compliance/index.js';

export const complianceRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/compliance/:opportunityId
// ─────────────────────────────────────────────────────────────

complianceRouter.get('/:opportunityId', async (req: Request, res: Response) => {
  try {
    const { opportunityId } = req.params;

    const checklist = await generateChecklist(opportunityId);

    res.json({ success: true, data: checklist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] [api] [compliance] [error — ${message}]`
    );

    // If requirements haven't been parsed yet, surface a friendly message
    if (
      message.toLowerCase().includes('no requirements') ||
      message.toLowerCase().includes('not found') ||
      message.toLowerCase().includes('0 requirements')
    ) {
      res.status(404).json({
        success: false,
        error: 'No requirements found. Parse the opportunity first.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Could not generate compliance checklist. Please try again.',
    });
  }
});
