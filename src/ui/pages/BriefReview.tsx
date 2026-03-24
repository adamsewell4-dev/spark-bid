import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, CheckCircle, Plus, X, ChevronDown, ExternalLink, FileText, Sparkles,
} from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { authFetch } from '../lib/auth';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CommercialProject {
  id: string;
  fireflies_transcript_id: string | null;
  client_name: string;
  project_type: string | null;
  project_description: string | null;
  deliverables: string | null;         // JSON array
  timeline: string | null;
  budget_signal: string | null;
  tone: string | null;
  cover_letter_seeds: string | null;   // JSON array
  case_study_match: string | null;
  payment_schedule: string | null;
  discovery_notes: string | null;
  status: string;
  pandadoc_document_id: string | null;
  pandadoc_status: string | null;
  saturation_project_id: string | null;
  created_at: string;
}

const PROJECT_TYPES = [
  { value: 'brand_commercial',  label: 'Brand Commercial / Campaign Spot' },
  { value: 'product_launch',    label: 'Product Launch Video' },
  { value: 'corporate_story',   label: 'Corporate / Brand Story' },
  { value: 'training_video',    label: 'Training / Educational Video' },
  { value: 'unknown',           label: 'Unknown / Other' },
] as const;

const PAYMENT_SCHEDULES = [
  {
    value: 'option_a',
    label: 'Option A — 50 / 25 / 25',
    detail: '50% at kickoff · 25% at creative development completion · 25% at final delivery',
  },
  {
    value: 'option_b',
    label: 'Option B — 25 / 25 / 25 / 25',
    detail: '25% at signing · 25% NET30 · 25% NET30 · 25% at completion',
  },
] as const;

// ─────────────────────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
      {children}
    </p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

/** Editable tag list (deliverables, cover letter seeds) */
function TagEditor({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  }

  function remove(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-indigo-400 hover:text-indigo-600 ml-0.5"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-gray-400 py-1">No items yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BriefReview
// ─────────────────────────────────────────────────────────────

export function BriefReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<CommercialProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pandadocUrl, setPandadocUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — mirrors CommercialProject fields
  const [clientName, setClientName] = useState('');
  const [projectType, setProjectType] = useState('unknown');
  const [projectDescription, setProjectDescription] = useState('');
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [timeline, setTimeline] = useState('');
  const [budgetSignal, setBudgetSignal] = useState('');
  const [tone, setTone] = useState('');
  const [coverLetterSeeds, setCoverLetterSeeds] = useState<string[]>([]);
  const [caseStudyMatch, setCaseStudyMatch] = useState('');
  const [paymentSchedule, setPaymentSchedule] = useState<string>('');
  const [discoveryNotes, setDiscoveryNotes] = useState('');

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/commercial/projects/${projectId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Not found');
      const p: CommercialProject = json.data;
      setProject(p);

      // Populate form
      setClientName(p.client_name);
      setProjectType(p.project_type ?? 'unknown');
      setProjectDescription(p.project_description ?? '');
      setDeliverables(p.deliverables ? (JSON.parse(p.deliverables) as string[]) : []);
      setTimeline(p.timeline ?? '');
      setBudgetSignal(p.budget_signal ?? '');
      setTone(p.tone ?? '');
      setCoverLetterSeeds(p.cover_letter_seeds ? (JSON.parse(p.cover_letter_seeds) as string[]) : []);
      setCaseStudyMatch(p.case_study_match ?? '');
      setPaymentSchedule(p.payment_schedule ?? '');
      setDiscoveryNotes(p.discovery_notes ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/commercial/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          project_type: projectType,
          project_description: projectDescription,
          deliverables,
          timeline,
          budget_signal: budgetSignal,
          tone,
          cover_letter_seeds: coverLetterSeeds,
          case_study_match: caseStudyMatch,
          payment_schedule: paymentSchedule || null,
          discovery_notes: discoveryNotes || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!projectId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await authFetch(`/api/commercial/projects/${projectId}/generate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Generation failed');
      setPandadocUrl(json.data.pandadoc_url as string);
      void loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    if (!projectId) return;
    // Auto-save first
    await handleSave();
    setConfirming(true);
    setError(null);
    try {
      const res = await authFetch(`/api/commercial/projects/${projectId}/confirm`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Confirm failed');
      void loadProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="p-8">
        <button onClick={() => navigate('/commercial')} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
      </div>
    );
  }

  const isConfirmed = project?.status !== 'brief_pending';

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/commercial')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Commercial Proposals
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brief Review</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and edit the extracted brief before confirming. All fields are editable.
          </p>
        </div>
        {isConfirmed && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <CheckCircle size={15} /> Confirmed
          </span>
        )}
      </div>

      <div className="space-y-8">

        {/* ── Project Identity ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <SectionLabel>Project Identity</SectionLabel>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Client Name</FieldLabel>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel>Project Type</FieldLabel>
              <div className="relative">
                <select
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  className={`${inputClass} appearance-none pr-8`}
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Project Description</FieldLabel>
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              rows={3}
              placeholder="1–2 sentence summary of what is being produced…"
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* ── Scope & Timeline ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <SectionLabel>Scope & Timeline</SectionLabel>

          <div>
            <FieldLabel>Deliverables</FieldLabel>
            <TagEditor
              tags={deliverables}
              onChange={setDeliverables}
              placeholder="e.g. 2x :30 broadcast spots"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Timeline</FieldLabel>
              <input
                type="text"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                placeholder="e.g. 8 weeks, deliver by June 1"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Budget Signal</FieldLabel>
              <input
                type="text"
                value={budgetSignal}
                onChange={(e) => setBudgetSignal(e.target.value)}
                placeholder="e.g. ~$80K range, not discussed"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* ── Creative Direction ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <SectionLabel>Creative Direction</SectionLabel>

          <div>
            <FieldLabel>Tone / Style</FieldLabel>
            <input
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. cinematic, upbeat, documentary-style, premium"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel>Cover Letter Seeds</FieldLabel>
            <p className="text-xs text-gray-400 mb-2">
              Key phrases from Daniel or the client — used as seed language in the cover letter.
            </p>
            <TagEditor
              tags={coverLetterSeeds}
              onChange={setCoverLetterSeeds}
              placeholder="e.g. 'storytelling that converts'"
            />
          </div>
        </div>

        {/* ── Discovery Notes ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <SectionLabel>Discovery Notes</SectionLabel>
          <div>
            <FieldLabel>Notes from the Discovery Call</FieldLabel>
            <p className="text-xs text-gray-400 mb-2">
              Write a brief overview of what was discussed — production context, client goals, logistics, anything not captured above. This gets cross-referenced with the transcript to sharpen the proposal copy.
            </p>
            <textarea
              value={discoveryNotes}
              onChange={(e) => setDiscoveryNotes(e.target.value)}
              rows={5}
              placeholder="e.g. 2-day studio shoot at their Charlotte facility, cross-functional crew covering photography and video simultaneously, primary goal is eCommerce PDPs for spring launch, client emphasized speed of delivery…"
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* ── Proposal Configuration ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <SectionLabel>Proposal Configuration</SectionLabel>

          <div>
            <FieldLabel>Suggested Case Studies</FieldLabel>
            <input
              type="text"
              value={caseStudyMatch}
              onChange={(e) => setCaseStudyMatch(e.target.value)}
              placeholder="e.g. SleepMe + Qworky"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1.5">Auto-suggested based on project type. Edit if needed.</p>
          </div>

          <div>
            <FieldLabel>Payment Schedule</FieldLabel>
            <div className="space-y-2">
              {[{ value: '', label: 'Not set', detail: '' }, ...PAYMENT_SCHEDULES].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentSchedule === opt.value
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentSchedule"
                    value={opt.value}
                    checked={paymentSchedule === opt.value}
                    onChange={() => setPaymentSchedule(opt.value)}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    {opt.detail && <p className="text-xs text-gray-500 mt-0.5">{opt.detail}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* PandaDoc success banner */}
        {pandadocUrl && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-800 text-sm">Proposal created in PandaDoc</p>
                <p className="text-emerald-600 text-xs mt-0.5">Review and fill in pricing before sending to the client.</p>
              </div>
            </div>
            <a
              href={pandadocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0"
            >
              Open in PandaDoc <ExternalLink size={13} />
            </a>
          </div>
        )}

        {/* External links (if connected to Saturation / PandaDoc) */}
        {!pandadocUrl && (project?.saturation_project_id || project?.pandadoc_document_id) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex gap-4">
            {project.saturation_project_id && (
              <a
                href={`https://app.saturation.io/projects/${project.saturation_project_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
              >
                Open in Saturation <ExternalLink size={13} />
              </a>
            )}
            {project.pandadoc_document_id && (
              <a
                href={`https://app.pandadoc.com/a/#/documents/${project.pandadoc_document_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
              >
                Open in PandaDoc <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 mt-8 -mx-8 px-8 py-4 bg-white border-t border-gray-200 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-400">
          {isConfirmed
            ? `Brief confirmed · status: ${project?.status}`
            : 'Review all fields, then confirm the brief to proceed to proposal generation.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || confirming}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saved ? (
              <><CheckCircle size={14} className="text-green-500" /> Saved</>
            ) : saving ? (
              <><LoadingSpinner size={14} /> Saving…</>
            ) : (
              <><Save size={14} /> Save Changes</>
            )}
          </button>

          {!isConfirmed && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving || confirming || !clientName.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
            >
              {confirming ? (
                <><LoadingSpinner size={14} /> Confirming…</>
              ) : (
                <><CheckCircle size={14} /> Confirm Brief</>
              )}
            </button>
          )}

          {isConfirmed && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
            >
              {generating ? (
                <><LoadingSpinner size={14} /> Generating… (30–60s)</>
              ) : project?.pandadoc_document_id ? (
                <><FileText size={14} /> Regenerate Proposal</>
              ) : (
                <><Sparkles size={14} /> Generate Proposal</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
