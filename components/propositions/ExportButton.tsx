'use client';

import { useState } from 'react';
import { Download, Check } from 'lucide-react';

interface ExportButtonProps {
  data: unknown;
  filename?: string;
}

export function ExportButton({ data, filename = 'donnees-extraites' }: ExportButtonProps) {
  const [isExported, setIsExported] = useState(false);

  const handleExport = () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      setIsExported(true);
      
      setTimeout(() => {
        setIsExported(false);
      }, 2000);
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      alert('Erreur lors de l\'export des données');
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExported}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
        isExported
          ? 'bg-emerald-100 text-emerald-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {isExported ? (
        <>
          <Check className="w-4 h-4" />
          Exporté !
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Exporter
        </>
      )}
    </button>
  );
}
