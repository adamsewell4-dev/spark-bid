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
import { config } from '../config.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { complianceRouter } from './routes/compliance.js';
import { proposalsRouter } from './routes/proposals.js';
import { parserRouter } from './routes/parser.js';

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

app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/parse', parserRouter);

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
// Start server
// ─────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(
    `[${new Date().toISOString()}] [api] [server] [listening on port ${config.port}]`
  );
});

export default app;
