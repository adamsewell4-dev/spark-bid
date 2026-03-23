import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, ArrowRight, Inbox, RefreshCw, AlertCircle } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { authFetch } from '../lib/auth';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DiscoveryCall {
  transcriptId: string;
  title: string;
  clientName: string;
  projectDescription: string;
  callDate: string;
  speakers: { speaker_id: string; name: string }[];
  projectId: string | null;
  status: string | null;
}

interface CommercialProject {
  id: string;
  client_name: string;
  project_type: string | null;
  project_description: string | null;
  status: string;
  pandadoc_status: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const PROJECT_TYPE_LABELS: Record<string, string> = {
  brand_commercial: 'Brand Commercial',
  product_launch: 'Product Launch',
  corporate_story: 'Corporate Story',
  training_video: 'Training Video',
  unknown: 'Unknown',
};

const STATUS_STYLES: Record<string, string> = {
  brief_pending:    'bg-yellow-100 text-yellow-700',
  brief_confirmed:  'bg-blue-100 text-blue-700',
  generating:       'bg-purple-100 text-purple-700',
  draft:            'bg-indigo-100 text-indigo-700',
  sent:             'bg-green-100 text-green-700',
  revised:          'bg-orange-100 text-orange-700',
  signed:           'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<string, string> = {
  brief_pending:    'Brief Pending',
  brief_confirmed:  'Brief Confirmed',
  generating:       'Generating',
  draft:            'Draft',
  sent:             'Sent',
  revised:          'Revised',
  signed:           'Signed',
};

function statusBadge(status: string) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// CommercialProposals
// ─────────────────────────────────────────────────────────────

export function CommercialProposals() {
  const navigate = useNavigate();

  const [calls, setCalls] = useState<DiscoveryCall[]>([]);
  const [projects, setProjects] = useState<CommercialProject[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null); // transcriptId being extracted

  const fetchCalls = useCallback(async () => {
    setLoadingCalls(true);
    setCallsError(null);
    try {
      const res = await authFetch('/api/commercial/calls');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      setCalls(json.data ?? []);
    } catch (err) {
      setCallsError(err instanceof Error ? err.message : 'Failed to load discovery calls');
    } finally {
      setLoadingCalls(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await authFetch('/api/commercial/projects');
      const json = await res.json();
      if (json.success) setProjects(json.data ?? []);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void fetchCalls();
    void fetchProjects();
  }, [fetchCalls, fetchProjects]);

  async function handleExtract(transcriptId: string) {
    setExtracting(transcriptId);
    try {
      const res = await authFetch(`/api/commercial/calls/${transcriptId}/extract`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Extraction failed');
      // Navigate straight to the brief review form
      navigate(`/commercial/${json.data.id as string}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(null);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commercial Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Discovery calls from Fireflies · Extract brief · Generate proposal
          </p>
        </div>
        <button
          onClick={() => { void fetchCalls(); void fetchProjects(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* ── Active Projects ────────────────────────────────── */}
      {(loadingProjects || projects.length > 0) && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Active Projects
          </h2>

          {loadingProjects ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner size={24} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/commercial/${p.id}`)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow duration-200 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        {p.project_type ? (PROJECT_TYPE_LABELS[p.project_type] ?? p.project_type) : 'Unclassified'}
                      </p>
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug">
                        {p.client_name}
                      </h3>
                      {p.project_description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.project_description}</p>
                      )}
                    </div>
                    {statusBadge(p.status)}
                  </div>
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-600 text-xs font-medium">
                      Open <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Discovery Calls ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Discovery Calls from Fireflies
        </h2>

        {callsError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Could not load Fireflies transcripts</p>
              <p className="text-red-600 mt-0.5">{callsError}</p>
            </div>
          </div>
        )}

        {loadingCalls ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size={28} />
          </div>
        ) : calls.length === 0 && !callsError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mic className="text-gray-300 mb-4" size={44} />
            <p className="text-gray-500 font-medium">No discovery calls found</p>
            <p className="text-gray-400 text-sm mt-1 max-w-sm">
              Make sure Fireflies calls are named using the{' '}
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                DISCOVERY - Client - Description - YYYY-MM-DD
              </span>{' '}
              format.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => {
              const isExtracting = extracting === call.transcriptId;
              const alreadyExtracted = !!call.projectId;

              return (
                <div
                  key={call.transcriptId}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Mic size={18} className="text-indigo-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{call.clientName}</p>
                      {call.status && statusBadge(call.status)}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{call.projectDescription}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {call.callDate} · {call.speakers.map((s) => s.name).join(', ')}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    {alreadyExtracted ? (
                      <button
                        onClick={() => navigate(`/commercial/${call.projectId!}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        Review Brief <ArrowRight size={13} />
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleExtract(call.transcriptId)}
                        disabled={isExtracting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        {isExtracting ? (
                          <>
                            <LoadingSpinner size={13} />
                            Extracting…
                          </>
                        ) : (
                          'Extract Brief'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
