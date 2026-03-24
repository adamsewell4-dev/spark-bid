/**
 * src/api/routes/commercial.ts
 *
 * REST API routes for the commercial proposal workflow.
 *
 * GET  /api/commercial/calls               — list recent DISCOVERY calls from Fireflies
 * POST /api/commercial/calls/:id/extract   — extract structured brief from a transcript
 * GET  /api/commercial/projects            — list all commercial projects in DB
 * GET  /api/commercial/projects/:id        — get a single commercial project
 * PUT  /api/commercial/projects/:id        — update brief fields (human edits before generation)
 * POST /api/commercial/projects/:id/confirm — confirm brief, advance status to brief_confirmed
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  fetchDiscoveryCalls,
  fetchAndExtractBrief,
  type ProjectBrief,
} from '../../commercial/fireflies.js';
import { generateCoverLetter, generateProjectDescription, generateScopeTitle } from '../../commercial/coverLetter.js';
import { createProposalDocument, getDocumentStatus, pandaDocEditorUrl } from '../../commercial/pandadoc.js';
import {
  upsertCommercialProject,
  getCommercialProject,
  listCommercialProjects,
  updateCommercialProjectStatus,
  getCommercialProjectByTranscript,
  insertProposalVersion,
  listProposalVersions,
} from '../../db/index.js';
import { config } from '../../config.js';

export const commercialRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/calls
// List recent DISCOVERY calls from Fireflies
// ─────────────────────────────────────────────────────────────

commercialRouter.get('/calls', async (_req, res) => {
  if (!config.firefliesApiKey) {
    return res.json({
      success: false,
      error: 'Fireflies API key not configured. Add FIREFLIES_API_KEY to environment variables.',
    });
  }

  try {
    const calls = await fetchDiscoveryCalls(50);

    // Annotate each call with its DB project status (if already imported)
    const annotated = calls.map((call) => {
      const project = getCommercialProjectByTranscript(call.transcriptId);
      return {
        ...call,
        projectId: project?.id ?? null,
        status: project?.status ?? null,
      };
    });

    return res.json({ success: true, data: annotated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.json({
      success: false,
      error: `Failed to fetch Fireflies transcripts: ${message}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/calls/:transcriptId/extract
// Extract a brief from a Fireflies transcript and save to DB
// ─────────────────────────────────────────────────────────────

commercialRouter.post('/calls/:transcriptId/extract', async (req, res) => {
  const { transcriptId } = req.params;

  if (!config.firefliesApiKey) {
    return res.json({
      success: false,
      error: 'Fireflies API key not configured.',
    });
  }

  if (!config.anthropicApiKey) {
    return res.json({
      success: false,
      error: 'Anthropic API key not configured. Brief extraction requires Claude.',
    });
  }

  try {
    // Check if already extracted
    const existing = getCommercialProjectByTranscript(transcriptId);
    if (existing) {
      return res.json({ success: true, data: existing });
    }

    const brief: ProjectBrief = await fetchAndExtractBrief(transcriptId);

    const id = randomUUID();
    upsertCommercialProject({
      id,
      fireflies_transcript_id: brief.transcriptId,
      client_name: brief.clientName,
      project_type: brief.projectType,
      project_description: brief.projectDescription,
      deliverables: JSON.stringify(brief.deliverables),
      timeline: brief.timeline,
      budget_signal: brief.budgetSignal,
      tone: brief.tone,
      cover_letter_seeds: JSON.stringify([]),               // starts empty — user confirms from suggestions
      suggested_seeds: JSON.stringify(brief.coverLetterSeeds), // AI-extracted, shown as clickable chips
      case_study_match: brief.caseStudyMatch,
      payment_schedule: brief.paymentSchedule,
      status: 'brief_pending',
    });

    const saved = getCommercialProject(id);
    return res.json({ success: true, data: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.json({
      success: false,
      error: `Brief extraction failed: ${message}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/projects
// List all commercial projects stored in DB
// ─────────────────────────────────────────────────────────────

commercialRouter.get('/projects', (_req, res) => {
  const projects = listCommercialProjects();
  return res.json({ success: true, data: projects });
});

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/projects/:id
// Get a single commercial project
// ─────────────────────────────────────────────────────────────

commercialRouter.get('/projects/:id', (req, res) => {
  const project = getCommercialProject(req.params.id);
  if (!project) {
    return res.json({ success: false, error: 'Project not found.' });
  }
  return res.json({ success: true, data: project });
});

// ─────────────────────────────────────────────────────────────
// PUT /api/commercial/projects/:id
// Update brief fields — human edits the extracted brief before confirming
// ─────────────────────────────────────────────────────────────

commercialRouter.put('/projects/:id', (req, res) => {
  const existing = getCommercialProject(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Project not found.' });
  }

  const body = req.body as Partial<{
    client_name: string;
    project_type: string;
    project_description: string;
    deliverables: string[];
    timeline: string;
    budget_signal: string;
    tone: string;
    cover_letter_seeds: string[];
    suggested_seeds: string[];
    case_study_match: string;
    payment_schedule: string;
    discovery_notes: string;
  }>;

  upsertCommercialProject({
    id: existing.id,
    fireflies_transcript_id: existing.fireflies_transcript_id,
    client_name: body.client_name ?? existing.client_name,
    project_type: body.project_type ?? existing.project_type,
    project_description: body.project_description ?? existing.project_description,
    deliverables: body.deliverables
      ? JSON.stringify(body.deliverables)
      : existing.deliverables,
    timeline: body.timeline ?? existing.timeline,
    budget_signal: body.budget_signal ?? existing.budget_signal,
    tone: body.tone ?? existing.tone,
    cover_letter_seeds: body.cover_letter_seeds
      ? JSON.stringify(body.cover_letter_seeds)
      : existing.cover_letter_seeds,
    suggested_seeds: existing.suggested_seeds,   // never overwritten by user edits
    case_study_match: body.case_study_match ?? existing.case_study_match,
    payment_schedule: body.payment_schedule ?? existing.payment_schedule,
    discovery_notes: body.discovery_notes ?? existing.discovery_notes,
    status: existing.status,
    saturation_project_id: existing.saturation_project_id,
    pandadoc_document_id: existing.pandadoc_document_id,
    pandadoc_status: existing.pandadoc_status,
  });

  const updated = getCommercialProject(existing.id);
  return res.json({ success: true, data: updated });
});

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/projects/:id/confirm
// Human confirms the brief — advances status to brief_confirmed
// ─────────────────────────────────────────────────────────────

commercialRouter.post('/projects/:id/confirm', (req, res) => {
  const existing = getCommercialProject(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Project not found.' });
  }

  if (existing.status !== 'brief_pending') {
    return res.json({
      success: false,
      error: `Cannot confirm a brief with status "${existing.status}". Only brief_pending projects can be confirmed.`,
    });
  }

  updateCommercialProjectStatus(existing.id, 'brief_confirmed');
  const updated = getCommercialProject(existing.id);
  return res.json({ success: true, data: updated });
});

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/projects/:id/generate
// Generate cover letter + PandaDoc proposal from confirmed brief
// ─────────────────────────────────────────────────────────────

commercialRouter.post('/projects/:id/generate', async (req, res) => {
  const existing = getCommercialProject(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Project not found.' });
  }

  if (!['brief_confirmed', 'draft', 'generating'].includes(existing.status)) {
    return res.json({
      success: false,
      error: `Brief must be confirmed before generating a proposal. Current status: "${existing.status}".`,
    });
  }

  if (!config.pandadocApiKey) {
    return res.json({ success: false, error: 'PandaDoc API key not configured.' });
  }

  if (!config.anthropicApiKey) {
    return res.json({ success: false, error: 'Anthropic API key not configured.' });
  }

  try {
    // Mark as generating
    updateCommercialProjectStatus(existing.id, 'generating');

    // Step 1: Generate all AI content in parallel
    const [coverLetter, projectDescription, scopeTitle] = await Promise.all([
      generateCoverLetter(existing),
      generateProjectDescription(existing),
      generateScopeTitle(existing),
    ]);

    // Step 2: Create PandaDoc document
    const doc = await createProposalDocument(existing, coverLetter, projectDescription, scopeTitle);

    // Step 3: Determine version number
    const existingVersions = listProposalVersions(existing.id);
    const versionNumber = existingVersions.length + 1;

    // Step 4: Save version record
    insertProposalVersion({
      id: randomUUID(),
      commercial_project_id: existing.id,
      pandadoc_document_id: doc.id,
      version_number: versionNumber,
      status: doc.status,
      needs_review: 0,
    });

    // Step 5: Update project with PandaDoc document ID and draft status
    upsertCommercialProject({
      ...existing,
      pandadoc_document_id: doc.id,
      pandadoc_status: doc.status,
      status: 'draft',
    });

    const updated = getCommercialProject(existing.id);
    return res.json({
      success: true,
      data: {
        project: updated,
        pandadoc_document_id: doc.id,
        pandadoc_url: pandaDocEditorUrl(doc.id),
        version_number: versionNumber,
      },
    });
  } catch (err) {
    // Roll back status on failure
    updateCommercialProjectStatus(existing.id, existing.status);
    const message = err instanceof Error ? err.message : String(err);
    return res.json({ success: false, error: `Proposal generation failed: ${message}` });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/commercial/projects/:id/reset
// Reset a stuck "generating" project back to brief_confirmed
// ─────────────────────────────────────────────────────────────

commercialRouter.post('/projects/:id/reset', (req, res) => {
  const existing = getCommercialProject(req.params.id);
  if (!existing) return res.json({ success: false, error: 'Project not found.' });
  updateCommercialProjectStatus(existing.id, 'brief_confirmed');
  return res.json({ success: true, data: getCommercialProject(existing.id) });
});

// ─────────────────────────────────────────────────────────────
// GET /api/commercial/projects/:id/versions
// List all proposal versions for a project
// ─────────────────────────────────────────────────────────────

commercialRouter.get('/projects/:id/versions', (req, res) => {
  const existing = getCommercialProject(req.params.id);
  if (!existing) {
    return res.json({ success: false, error: 'Project not found.' });
  }
  const versions = listProposalVersions(existing.id);
  return res.json({ success: true, data: versions });
});
