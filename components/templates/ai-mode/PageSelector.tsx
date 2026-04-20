'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  pageImageUrls: string[];
  initialSelected?: number[];
  onAnalyze: (selectedPages: number[]) => void | Promise<void>;
  isAnalyzing?: boolean;
}

export function PageSelector({
  pageImageUrls,
  initialSelected,
  onAnalyze,
  isAnalyzing,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(initialSelected && initialSelected.length > 0 ? initialSelected : pageImageUrls.map((_, i) => i + 1))
  );

  const allSelected = selected.size === pageImageUrls.length;

  const toggle = (page: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageImageUrls.map((_, i) => i + 1)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Pages à analyser ({selected.size}/{pageImageUrls.length})
        </h3>
        <button
          onClick={toggleAll}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {pageImageUrls.map((url, idx) => {
          const page = idx + 1;
          const isSelected = selected.has(page);
          return (
            <button
              key={page}
              type="button"
              onClick={() => toggle(page)}
              className={`relative rounded-lg border-2 overflow-hidden transition ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Page ${page}`} className="w-full h-auto block" />
              <div className="absolute top-2 left-2 bg-white/90 text-xs font-semibold px-2 py-1 rounded">
                Page {page}
              </div>
              <div
                className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                  isSelected ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                {isSelected ? '✓' : ''}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onAnalyze(Array.from(selected).sort((a, b) => a - b))}
          disabled={selected.size === 0 || isAnalyzing}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyse en cours…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyser avec l&apos;IA
            </>
          )}
        </button>
      </div>
    </div>
  );
}
