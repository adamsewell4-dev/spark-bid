import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Inbox, Plus } from 'lucide-react';
import { Badge } from '../components/Badge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AddOpportunityModal } from '../components/AddOpportunityModal';
import { authFetch } from '../lib/auth';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  agency: string | null;
  naics_code: string | null;
  type: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  active: number;
  attachments_json: string | null;
  description: string | null;
  url: string | null;
  created_at: string;
}

interface ApiResponse {
  success: boolean;
  data?: Opportunity[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function daysUntilDeadline(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const due = new Date(deadline);
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

function deadlineBadgeColor(days: number | null): 'red' | 'orange' | 'green' | 'gray' {
  if (days === null) return 'gray';
  if (days < 3) return 'red';
  if (days < 7) return 'orange';
  return 'green';
}

function formatDeadlineLabel(deadline: string | null): string {
  if (!deadline) return 'No deadline';
  const days = daysUntilDeadline(deadline);
  if (days === null) return 'No deadline';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

type FilterTab = 'all' | 'active' | 'deadline-soon' | 'no-documents';

// ─────────────────────────────────────────────────────────────
// OpportunityCard
// ─────────────────────────────────────────────────────────────

interface OpportunityCardProps {
  opp: Opportunity;
  hasRequirements: boolean;
  hasProposal: boolean;
}

function OpportunityCard({ opp, hasRequirements, hasProposal }: OpportunityCardProps) {
  const navigate = useNavigate();
  const days = daysUntilDeadline(opp.response_deadline);
  const deadlineColor = deadlineBadgeColor(days);

  return (
    <div
      onClick={() => navigate(`/opportunities/${opp.id}`)}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow duration-200 flex flex-col gap-3"
    >
      {/* Agency */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">
        {opp.agency ?? 'Unknown Agency'}
      </p>

      {/* Title */}
      <h3 className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2">
        {opp.title}
      </h3>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <Badge
          label={formatDeadlineLabel(opp.response_deadline)}
          color={deadlineColor}
        />
        {opp.attachments_json && (
          <Badge label="Has Documents" color="blue" />
        )}
        {hasRequirements && <Badge label="Parsed" color="green" />}
        {hasProposal && <Badge label="Draft Ready" color="purple" />}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">NAICS {opp.naics_code ?? '512110'}</span>
        <span className="ml-auto flex items-center gap-1 text-indigo-600 text-xs font-medium">
          View Details <ArrowRight size={12} />
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-4/5 mb-4" />
      <div className="flex gap-2 mb-4">
        <div className="h-5 bg-gray-200 rounded-full w-20" />
        <div className="h-5 bg-gray-200 rounded-full w-16" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-1/4 ml-auto" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [requirementCounts, setRequirementCounts] = useState<Record<string, number>>({});
  const [proposalIds, setProposalIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = debouncedSearch
        ? `/api/opportunities?search=${encodeURIComponent(debouncedSearch)}`
        : '/api/opportunities';
      const res = await authFetch(url);
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      setOpportunities(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void fetchOpportunities();
  }, [fetchOpportunities]);

  // Fetch requirement counts and proposal existence for each opportunity
  useEffect(() => {
    if (opportunities.length === 0) return;

    const fetchMetadata = async () => {
      const counts: Record<string, number> = {};
      const propIds = new Set<string>();

      await Promise.allSettled(
        opportunities.map(async (opp) => {
          try {
            const [detailRes, proposalRes] = await Promise.allSettled([
              authFetch(`/api/opportunities/${opp.id}`),
              authFetch(`/api/proposals/${opp.id}`),
            ]);

            if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
              const data = await detailRes.value.json();
              if (data.success && data.data?.requirements) {
                counts[opp.id] = data.data.requirements.length;
              }
            }

            if (proposalRes.status === 'fulfilled' && proposalRes.value.ok) {
              const data = await proposalRes.value.json();
              if (data.success) {
                propIds.add(opp.id);
              }
            }
          } catch {
            // Silently ignore metadata fetch errors
          }
        })
      );

      setRequirementCounts(counts);
      setProposalIds(propIds);
    };

    void fetchMetadata();
  }, [opportunities]);

  // Filter logic
  const filteredOpportunities = opportunities.filter((opp) => {
    if (activeTab === 'active') return opp.active === 1;
    if (activeTab === 'deadline-soon') {
      const days = daysUntilDeadline(opp.response_deadline);
      return days !== null && days >= 0 && days <= 7;
    }
    if (activeTab === 'no-documents') return !opp.attachments_json;
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'deadline-soon', label: 'Deadline Soon' },
    { key: 'no-documents', label: 'No Documents' },
  ];

  return (
    <div className="p-8">

      {showAddModal && (
        <AddOpportunityModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { void fetchOpportunities(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Opportunities</h1>
          {!loading && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {filteredOpportunities.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Add Opportunity button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Add Opportunity
          </button>

          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search opportunities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filteredOpportunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Inbox className="text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium text-lg">No opportunities found</p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? `No results for "${search}". Try a different search term.`
              : 'Run the monitor to pull in new RFPs from SAM.gov.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOpportunities.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              hasRequirements={(requirementCounts[opp.id] ?? 0) > 0}
              hasProposal={proposalIds.has(opp.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
