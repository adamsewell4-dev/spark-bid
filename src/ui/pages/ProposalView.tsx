import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Download, CheckCircle } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { authFetch } from '../lib/auth';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ProposalRow {
  id: string;
  opportunity_id: string;
  status: 'draft' | 'review' | 'submitted';
  content_json: string | null;
  created_at: string;
  updated_at: string;
}

interface ProposalContent {
  sections?: string;
  raw?: string;
}

// ─────────────────────────────────────────────────────────────
// Simple Markdown Renderer
// ─────────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-gray-900 mt-8 mb-3 first:mt-0">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-bold text-gray-800 mt-6 mb-2 border-b border-gray-200 pb-1">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-gray-800 mt-4 mb-1.5">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith('- ') || lines[i].startsWith('* '))
      ) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2 text-gray-700 text-sm leading-relaxed ml-2">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list item
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-2 text-gray-700 text-sm leading-relaxed ml-2">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Markdown table (lines starting with |)
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Separate header, separator, and body rows
      const rows = tableLines.filter((l) => !/^\|[-| :]+\|$/.test(l.trim()));
      const [headerRow, ...bodyRows] = rows;
      const parseRow = (row: string) =>
        row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());

      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {parseRow(headerRow ?? '').map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-800"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {parseRow(row).map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-gray-200 px-3 py-2 text-gray-700 align-top"
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (line.startsWith('---') || line.startsWith('===')) {
      elements.push(<hr key={i} className="border-gray-200 my-4" />);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-gray-700 text-sm leading-relaxed my-1">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ProposalView
// ─────────────────────────────────────────────────────────────

export function ProposalView() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const navigate = useNavigate();

  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchProposal = useCallback(async () => {
    if (!opportunityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/proposals/${opportunityId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      setProposal(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proposal');
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchProposal();
  }, [fetchProposal]);

  const getRawContent = (): string => {
    if (!proposal?.content_json) return '';
    try {
      const parsed: ProposalContent = JSON.parse(proposal.content_json);
      return parsed.raw ?? parsed.sections ?? proposal.content_json;
    } catch {
      return proposal.content_json;
    }
  };

  const handleCopy = async () => {
    const content = getRawContent();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const content = getRawContent();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposal-${opportunityId ?? 'draft'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate(opportunityId ? `/opportunities/${opportunityId}` : '/')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          {error ?? 'Proposal not found. Generate one from the opportunity detail page.'}
        </div>
      </div>
    );
  }

  const rawContent = getRawContent();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(opportunityId ? `/opportunities/${opportunityId}` : '/')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Opportunity
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Proposal Draft</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>
              Generated {new Date(proposal.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="text-gray-300">|</span>
            <span className="capitalize">{proposal.status}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => void handleCopy()}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 shadow-sm"
          >
            {copied ? (
              <>
                <CheckCircle className="text-green-500" size={15} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={15} />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors duration-150 shadow-sm"
          >
            <Download size={15} />
            Download .txt
          </button>
        </div>
      </div>

      {/* Proposal Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        {rawContent ? (
          <div className="prose-like">{renderMarkdown(rawContent)}</div>
        ) : (
          <p className="text-gray-400 text-sm italic">No content available for this proposal.</p>
        )}
      </div>
    </div>
  );
}
