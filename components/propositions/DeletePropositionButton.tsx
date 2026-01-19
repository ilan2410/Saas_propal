'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

type Props = {
  propositionId: string;
  variant?: 'small' | 'secondary';
  className?: string;
};

export function DeletePropositionButton({ propositionId, variant = 'small', className = '' }: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseStyles = {
    small: 'px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors',
    secondary: 'px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors',
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      'Supprimer cette proposition ?\n\nCette action supprimera aussi les documents sources et le fichier généré.'
    );
    if (!ok) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/propositions/${propositionId}`, {
        method: 'DELETE',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Erreur lors de la suppression');
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className={`inline-flex items-center gap-2 ${baseStyles[variant]} ${isDeleting ? 'opacity-75 cursor-not-allowed' : ''} ${className}`}
      >
        {isDeleting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Suppression...
          </>
        ) : (
          <>
            <Trash2 className="w-4 h-4" />
            Supprimer
          </>
        )}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-2 p-2 bg-red-100 text-red-700 text-sm rounded-lg whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
