'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  data: unknown;
}

export function CopyButton({ data }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      
      setIsCopied(true);
      
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      alert('Erreur lors de la copie des données');
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={isCopied}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
        isCopied
          ? 'bg-emerald-100 text-emerald-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {isCopied ? (
        <>
          <Check className="w-4 h-4" />
          Copié !
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          Copier
        </>
      )}
    </button>
  );
}
