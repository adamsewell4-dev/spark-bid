import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Building2,
  Tag,
  FileText,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { LoadingSpinner } from '../components/LoadingSpinner';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Requirement {
  id: string;
  opportunity_id: string;
  category: string;
  requirement_text: string;
  source: string | null;
  met: number;
  notes: string | null;
}

interface OpportunityDetail {
  id: string;
  title: string;
  agency: string | null;
  naics_code: string | null;
  type: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  description: string | null;
  attachments_json: string | null;
  url: string | null;
  requirements: Requirement[];
}

interface ChecklistItem {
  requirementText: string;
  met: boolean;
  notes: string | null;
  source: string | null;
}

interface ComplianceChecklist {
  opportunityId: string;
  generatedAt: string;
  mandatory: ChecklistItem[];
  submission: ChecklistItem[];
  evaluation: ChecklistItem[];
  concern: ChecklistItem[];
}

interface ParseResult {
  filesProcessed: number;
  requirements: unknown[];
  errors: string[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseAttachments(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const urls: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') urls.push(item);
      else if (typeof item === 'object' && item !== null && 'url' in item) {
        const url = (item as Record<string, unknown>)['url'];
        if (typeof url === 'string') urls.push(url);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Checklist Section
// ─────────────────────────────────────────────────────────────

interface ChecklistSectionProps {
  title: string;
  items: ChecklistItem[];
  color: 'red' | 'blue' | 'green' | 'orange';
}

function ChecklistSection({ title, items, color }: ChecklistSectionProps) {
  if (items.length === 0) return null;

  const headerColors = {
    red: 'text-red-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
  };

  return (
    <div className="mb-4">
      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${headerColors[color]}`}>
        {title} ({items.length})
      </h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 border border-gray-100"
          >
            {item.met ? (
              <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={15} />
            ) : (
              <AlertCircle className="text-gray-400 flex-shrink-0 mt-0.5" size={15} />
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-700 leading-relaxed">{item.requirementText}</p>
              {item.notes && (
                <p className="text-xs text-gray-400 mt-1 italic">{item.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Meta Item
// ─────────────────────────────────────────────────────────────

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400">{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OpportunityDetail
// ─────────────────────────────────────────────────────────────

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [proposalReady, setProposalReady] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [checklist, setChecklist] = useState<ComplianceChecklist | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);

  const fetchOpportunity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      setOpportunity(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunity');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchOpportunity();
  }, [fetchOpportunity]);

  // Check if a proposal already exists
  useEffect(() => {
    if (!id) return;
    fetch(`/api/proposals/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setProposalReady(true);
      })
      .catch(() => {});
  }, [id]);

  // Load checklist if requirements exist
  useEffect(() => {
    if (!id || !opportunity) return;
    if (!opportunity.requirements || opportunity.requirements.length === 0) return;

    setChecklistLoading(true);
    fetch(`/api/compliance/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setChecklist(json.data);
      })
      .catch(() => {})
      .finally(() => setChecklistLoading(false));
  }, [id, opportunity]);

  const handleParse = async () => {
    if (!id) return;
    setParsing(true);
    setParseError(null);
    setParseResult(null);
    try {
      const res = await fetch(`/api/parse/${id}`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Parse failed');
      setParseResult(json.data);
      // Refresh opportunity to get updated requirements
      await fetchOpportunity();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  };

  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Generation failed');
      setProposalReady(true);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6"
        >
          <ArrowLeft size={16} /> Opportunities
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          {error ?? 'Opportunity not found'}
        </div>
      </div>
    );
  }

  const attachments = parseAttachments(opportunity.attachments_json);
  const hasParsed = opportunity.requirements && opportunity.requirements.length > 0;

  return (
    <div className="p-8">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Opportunities
      </button>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Left Column ── */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-1 leading-tight">
            {opportunity.title}
          </h1>
          <p className="text-gray-500 text-sm mb-5">
            {opportunity.agency ?? 'Unknown Agency'}
          </p>

          {/* Meta */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5 space-y-2.5">
            {opportunity.response_deadline && (
              <MetaItem
                icon={<Calendar size={15} />}
                label="Deadline"
                value={formatDate(opportunity.response_deadline)}
              />
            )}
            {opportunity.posted_date && (
              <MetaItem
                icon={<Calendar size={15} />}
                label="Posted"
                value={formatDate(opportunity.posted_date)}
              />
            )}
            {opportunity.naics_code && (
              <MetaItem
                icon={<Tag size={15} />}
                label="NAICS"
                value={opportunity.naics_code}
              />
            )}
            {opportunity.type && (
              <MetaItem
                icon={<Building2 size={15} />}
                label="Type"
                value={opportunity.type}
              />
            )}
            {opportunity.url && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">
                  <ExternalLink size={15} />
                </span>
                <a
                  href={opportunity.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline truncate"
                >
                  View on SAM.gov
                </a>
              </div>
            )}
          </div>

          {/* Description */}
          {opportunity.description && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {opportunity.description}
              </p>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText size={15} />
                Attachments ({attachments.length})
              </h3>
              <div className="space-y-2">
                {attachments.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-indigo-600 hover:underline break-all"
                  >
                    <ExternalLink size={11} className="flex-shrink-0" />
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Action Panel ── */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Actions</h3>

            {/* Parse Button */}
            <div className="mb-4">
              <button
                onClick={() => void handleParse()}
                disabled={parsing}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors duration-150"
              >
                {parsing ? (
                  <>
                    <LoadingSpinner size={16} />
                    Parsing Documents...
                  </>
                ) : (
                  'Parse Documents'
                )}
              </button>

              {parseResult && (
                <div className="mt-2 flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={15} />
                  <p className="text-xs text-green-700">
                    Parsed {parseResult.filesProcessed} file
                    {parseResult.filesProcessed !== 1 ? 's' : ''},{' '}
                    {parseResult.requirements.length} requirement
                    {parseResult.requirements.length !== 1 ? 's' : ''} found
                    {parseResult.errors.length > 0
                      ? ` (${parseResult.errors.length} warning${parseResult.errors.length !== 1 ? 's' : ''})`
                      : ''}
                  </p>
                </div>
              )}

              {parseError && (
                <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">{parseError}</p>
                </div>
              )}
            </div>

            {/* Generate Proposal Button */}
            <div className="mb-4">
              <button
                onClick={() => void handleGenerate()}
                disabled={generating || !hasParsed}
                title={!hasParsed ? 'Parse documents first to enable proposal generation' : undefined}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors duration-150"
              >
                {generating ? (
                  <>
                    <LoadingSpinner size={16} />
                    Generating Proposal...
                  </>
                ) : (
                  'Generate Proposal'
                )}
              </button>

              {!hasParsed && !parseResult && (
                <p className="mt-1.5 text-xs text-gray-400 text-center">
                  Parse documents first
                </p>
              )}

              {proposalReady && (
                <div className="mt-2 flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg">
                  <CheckCircle className="text-purple-500 flex-shrink-0" size={15} />
                  <div className="flex items-center justify-between w-full">
                    <p className="text-xs text-purple-700 font-medium">Proposal ready</p>
                    <Link
                      to={`/proposals/${opportunity.id}`}
                      className="text-xs text-purple-600 hover:underline font-semibold"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              )}

              {generateError && (
                <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">{generateError}</p>
                </div>
              )}
            </div>

            {/* Badges status */}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Documents</span>
                <Badge
                  label={attachments.length > 0 ? `${attachments.length} attached` : 'None'}
                  color={attachments.length > 0 ? 'blue' : 'gray'}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Requirements</span>
                <Badge
                  label={
                    hasParsed
                      ? `${opportunity.requirements.length} found`
                      : 'Not parsed'
                  }
                  color={hasParsed ? 'green' : 'gray'}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Proposal</span>
                <Badge
                  label={proposalReady ? 'Draft ready' : 'Not generated'}
                  color={proposalReady ? 'purple' : 'gray'}
                />
              </div>
            </div>
          </div>

          {/* Compliance Checklist */}
          {(hasParsed || checklistLoading) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                Compliance Checklist
              </h3>

              {checklistLoading && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="animate-spin" size={14} />
                  Loading checklist...
                </div>
              )}

              {checklist && !checklistLoading && (
                <>
                  <ChecklistSection
                    title="Mandatory"
                    items={checklist.mandatory}
                    color="red"
                  />
                  <ChecklistSection
                    title="Submission"
                    items={checklist.submission}
                    color="blue"
                  />
                  <ChecklistSection
                    title="Evaluation"
                    items={checklist.evaluation}
                    color="green"
                  />
                  <ChecklistSection
                    title="Concerns"
                    items={checklist.concern}
                    color="orange"
                  />
                  <p className="text-xs text-gray-400 mt-3">
                    Generated {new Date(checklist.generatedAt).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
