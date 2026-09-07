'use client';

import { FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
  propositionId: string;
  variant?: 'solid' | 'outline';
}

const STYLES = {
  solid: {
    excel: 'bg-emerald-600 text-white hover:bg-emerald-700',
    word: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  outline: {
    excel: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    word: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  },
} as const;

export function ExportSaSpButtons({ propositionId, variant = 'solid' }: Props) {
  const styles = STYLES[variant];
  return (
    <div className="flex gap-2">
      <a
        href={`/api/propositions/${propositionId}/export-comparatif-sa-sp?format=excel`}
        title="Exporter comparatif SA/SP (Excel)"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${styles.excel}`}
      >
        <FileSpreadsheet className="h-4 w-4" />
        SA/SP Excel
      </a>
      <a
        href={`/api/propositions/${propositionId}/export-comparatif-sa-sp?format=word`}
        title="Exporter comparatif SA/SP (Word)"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${styles.word}`}
      >
        <FileText className="h-4 w-4" />
        SA/SP Word
      </a>
    </div>
  );
}
