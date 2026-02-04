'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { SuggestionsGenerees } from '@/types';
import { SuggestionsView } from './SuggestionsView';

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionItem({ title, children, defaultOpen = false }: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <ChevronDown
          className={`w-5 h-5 text-gray-600 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="p-4 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

export { AccordionItem };

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSuggestionsGenerees(value: unknown): value is SuggestionsGenerees {
  if (!isPlainObject(value)) return false;
  if (!Array.isArray(value.suggestions)) return false;
  if (!isPlainObject(value.synthese)) return false;
  return true;
}

export function SuggestionsPanel({
  propositionId,
  clientName,
  suggestions,
  embedded = false,
}: {
  propositionId: string;
  clientName: string;
  suggestions: unknown;
  embedded?: boolean;
}) {
  const suggestionsValue = isSuggestionsGenerees(suggestions) ? suggestions : null;

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!suggestionsValue) return;
    if (!propositionId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/export-comparatif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestions: suggestionsValue.suggestions,
          synthese: suggestionsValue.synthese,
          proposition_id: propositionId,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Erreur lors de la génération du PDF');
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) return;

      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comparatif-telecom-${clientName || 'client'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!suggestionsValue) return null;

  if (embedded) {
    return (
      <SuggestionsView
        suggestions={suggestionsValue}
        clientName={clientName}
        onDownloadPdf={handleDownloadPdf}
        isDownloading={isDownloading}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Suggestions IA</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Comparatif calculé à partir des données de la proposition
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <SuggestionsView
          suggestions={suggestionsValue}
          clientName={clientName}
          onDownloadPdf={handleDownloadPdf}
          isDownloading={isDownloading}
        />
      </div>
    </div>
  );
}
