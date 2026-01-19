'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

interface ActionMenuProps {
  propositionId: string;
}

export function ActionMenu({ propositionId }: ActionMenuProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = confirm(
      'Êtes-vous sûr de vouloir supprimer cette proposition ? Cette action est irréversible.'
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/propositions/${propositionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la suppression');
      }

      router.push('/propositions');
      router.refresh();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la suppression');
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Trash2 className="w-4 h-4" />
      )}
      Supprimer
    </button>
  );
}
