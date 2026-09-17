'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface GenerateButtonProps {
  propositionId: string;
  variant?: 'primary' | 'secondary' | 'small';
  className?: string;
  /** Libellé affiché au repos (défaut : "Générer la proposition" / "Générer" en `small`). */
  label?: string;
  /** Icône affichée au repos (défaut : FileSpreadsheet). */
  icon?: ReactNode;
}

export function GenerateButton({ propositionId, variant = 'primary', className = '', label, icon }: GenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/propositions/${propositionId}/generate`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la génération');
      }

      // Rafraîchir la page pour voir le nouveau statut
      router.refresh();
      
      // Si on a l'URL du fichier, on peut le télécharger directement
      if (data.file_url) {
        window.open(data.file_url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  const baseStyles = {
    primary: 'px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium',
    secondary: 'px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium',
    small: 'px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors',
  };

  return (
    <div className="relative">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className={`flex items-center gap-2 ${baseStyles[variant]} ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''} ${className}`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Génération...
          </>
        ) : (
          <>
            {icon ?? <FileSpreadsheet className="w-4 h-4" />}
            {label ?? (variant === 'small' ? 'Générer' : 'Générer la proposition')}
          </>
        )}
      </button>
      {error && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-red-100 text-red-700 text-sm rounded-lg whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
