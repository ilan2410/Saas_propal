'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VariableOverlay } from './VariableOverlay';
import type { AIAnalysis, AISimpleVariable, AITable } from './types';

interface Props {
  analysis: AIAnalysis;
  onVariableClick?: (v: AISimpleVariable) => void;
  onTableClick?: (t: AITable) => void;
}

export function InteractivePreview({ analysis, onVariableClick, onTableClick }: Props) {
  const [currentPage, setCurrentPage] = useState(analysis.selectedPages[0] || 1);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });

  const pageUrl = analysis.pageImageUrls[currentPage - 1];
  const pageVariables = analysis.simpleVariables.filter((v) => v.pageNumber === currentPage);
  const pageTables = analysis.tables.filter((t) => t.pageNumber === currentPage);

  useEffect(() => {
    if (!imgRef.current) return;
    const handle = () => {
      if (imgRef.current) {
        setDims({
          w: imgRef.current.naturalWidth || imgRef.current.clientWidth,
          h: imgRef.current.naturalHeight || imgRef.current.clientHeight,
        });
      }
    };
    handle();
    imgRef.current.addEventListener('load', handle);
    return () => imgRef.current?.removeEventListener('load', handle);
  }, [pageUrl]);

  const total = analysis.pageImageUrls.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30"
          aria-label="Page précédente"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium">
          Page {currentPage} / {total}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(total, p + 1))}
          disabled={currentPage >= total}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30"
          aria-label="Page suivante"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="relative inline-block shadow-md bg-white">
          {pageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={pageUrl}
              alt={`Page ${currentPage}`}
              className="block max-w-full h-auto"
            />
          ) : (
            <div className="w-[600px] h-[800px] flex items-center justify-center text-gray-400 text-sm">
              Page indisponible
            </div>
          )}
          <VariableOverlay
            variables={pageVariables}
            tables={pageTables}
            imageWidth={dims.w}
            imageHeight={dims.h}
            onVariableClick={onVariableClick}
            onTableClick={onTableClick}
          />
        </div>
      </div>
    </div>
  );
}
