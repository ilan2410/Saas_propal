'use client';

import { FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
  propositionId: string;
}

export function ExportSaSpButtons({ propositionId }: Props) {
  return (
    <div className="flex gap-2">
      <a
        href={`/api/propositions/${propositionId}/export-comparatif-sa-sp?format=excel`}
        title="Exporter comparatif SA/SP (Excel)"
        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors font-medium"
      >
        <FileSpreadsheet className="w-4 h-4" />
        SA/SP Excel
      </a>
      <a
        href={`/api/propositions/${propositionId}/export-comparatif-sa-sp?format=word`}
        title="Exporter comparatif SA/SP (Word)"
        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        <FileText className="w-4 h-4" />
        SA/SP Word
      </a>
    </div>
  );
}
