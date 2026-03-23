/**
 * src/api/server.ts
 *
 * Express REST API server for Spark Bid.
 * Mounts all route modules and serves the React UI in production.
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { config } from '../config.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { complianceRouter } from './routes/compliance.js';
import { proposalsRouter } from './routes/proposals.js';
import { parserRouter } from './routes/parser.js';
import { authRouter, requireAuth } from './routes/auth.js';
import { commercialRouter } from './routes/commercial.js';
import { runMonitorCycle } from '../monitor/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/opportunities', requireAuth, opportunitiesRouter);
app.use('/api/compliance', requireAuth, complianceRouter);
app.use('/api/proposals', requireAuth, proposalsRouter);
app.use('/api/parse', requireAuth, parserRouter);
app.use('/api/commercial', requireAuth, commercialRouter);

// ─────────────────────────────────────────────────────────────
// Serve React UI in production
// ─────────────────────────────────────────────────────────────

// Set SERVE_STATIC=true when running as a self-contained server (local prod, Docker).
// Leave it unset on Railway (frontend is on Netlify) or in development (Vite handles it).
if (process.env['SERVE_STATIC'] === 'true') {
  const uiPath = path.join(__dirname, '..', '..', 'dist', 'ui');
  app.use(express.static(uiPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
  });
}

// ─────────────────────────────────────────────────────────────
// SAM.gov monitor — scheduled daily at 02:00 UTC
// ─────────────────────────────────────────────────────────────

cron.schedule('0 2 * * *', () => {
  console.log(
    `[${new Date().toISOString()}] [cron] [monitor] [starting scheduled SAM.gov scan]`
  );
  runMonitorCycle().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${new Date().toISOString()}] [cron] [monitor] [scheduled scan failed: ${message}]`
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(
    `[${new Date().toISOString()}] [api] [server] [listening on port ${config.port}]`
  );
});

export default app;
