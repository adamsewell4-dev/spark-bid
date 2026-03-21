import React, { useState } from 'react';
import { X, Plus, Trash2, ExternalLink } from 'lucide-react';
import { authFetch } from '../lib/auth';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function AddOpportunityModal({ onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    title: '',
    agency: '',
    solicitation_number: '',
    response_deadline: '',
    description: '',
    source: 'ebuy',
    url: '',
  });
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateAttachment(index: number, value: string) {
    setAttachmentUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addAttachmentRow() {
    setAttachmentUrls((prev) => [...prev, '']);
  }

  function removeAttachmentRow(index: number) {
    setAttachmentUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const validUrls = attachmentUrls.filter((u) => u.trim() !== '');
      const res = await authFetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          attachment_urls: validUrls.length > 0 ? validUrls : undefined,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('Could not connect to the server. Is the app running?');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Opportunity</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manually enter an RFQ from GSA eBuy or another source</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Source toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
            <div className="flex gap-2">
              {(['ebuy', 'sam.gov', 'other'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('source', s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.source === s
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {s === 'ebuy' ? 'GSA eBuy' : s === 'sam.gov' ? 'SAM.gov' : 'Other'}
                </button>
              ))}
              {form.source === 'ebuy' && (
                <a
                  href="https://www.ebuy.gsa.gov/ebuy/seller"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
                >
                  Open eBuy <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Opportunity Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Video Production Services for FY2026 Training Campaign"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Agency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Agency / Organization <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.agency}
              onChange={(e) => set('agency', e.target.value)}
              placeholder="e.g. Department of Veterans Affairs"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Solicitation # and Deadline — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Solicitation / RFQ Number</label>
              <input
                type="text"
                value={form.solicitation_number}
                onChange={(e) => set('solicitation_number', e.target.value)}
                placeholder="e.g. 47QRAA26Q0012"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Response Deadline</label>
              <input
                type="datetime-local"
                value={form.response_deadline}
                onChange={(e) => set('response_deadline', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Paste the RFQ description or scope of work here..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* eBuy / external URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">RFQ Link (optional)</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://www.ebuy.gsa.gov/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Attachment URLs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Attachment URLs
                <span className="ml-1.5 text-xs font-normal text-gray-400">(paste direct download links to RFP documents)</span>
              </label>
              <button
                type="button"
                onClick={addAttachmentRow}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <Plus size={13} /> Add URL
              </button>
            </div>
            <div className="space-y-2">
              {attachmentUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateAttachment(i, e.target.value)}
                    placeholder="https://..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {attachmentUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAttachmentRow(i)}
                      className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              If you have attachment URLs, the parser will automatically download and extract requirements from them.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Add Opportunity'}
          </button>
        </div>

      </div>
    </div>
  );
}
