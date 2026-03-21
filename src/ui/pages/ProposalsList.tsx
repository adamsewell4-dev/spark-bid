import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight, Inbox } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { authFetch } from '../lib/auth';

interface ProposalSummary {
  id: string;
  opportunity_id: string;
  opportunity_title: string | null;
  agency: string | null;
  response_deadline: string | null;
  status: 'draft' | 'review' | 'submitted';
  created_at: string;
}

function statusColor(status: string) {
  if (status === 'submitted') return 'bg-green-100 text-green-700';
  if (status === 'review') return 'bg-yellow-100 text-yellow-700';
  return 'bg-purple-100 text-purple-700';
}

export function ProposalsList() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch('/api/proposals')
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? 'Unknown error');
        setProposals(json.data ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load proposals'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
        {!loading && (
          <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {proposals.length}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Inbox className="text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium text-lg">No proposals yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Open an opportunity and click Generate Proposal to create your first draft.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proposals.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/proposals/${p.opportunity_id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow duration-200 flex flex-col gap-3"
            >
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">
                {p.agency ?? 'Unknown Agency'}
              </p>

              <div className="flex items-start justify-between gap-3">
                <h3 className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2 flex-1">
                  {p.opportunity_title ?? 'Untitled Opportunity'}
                </h3>
                <FileText className="text-indigo-400 flex-shrink-0 mt-0.5" size={16} />
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColor(p.status)}`}>
                  {p.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(p.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              <div className="mt-auto pt-2 flex justify-end">
                <span className="flex items-center gap-1 text-indigo-600 text-xs font-medium">
                  View Proposal <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
