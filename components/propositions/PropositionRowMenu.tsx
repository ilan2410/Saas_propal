'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, MoreHorizontal, Trash2, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Menu overflow « ⋯ » d'une proposition : ouvrir la fiche, supprimer.
 * - `showOpenDetail` : masquer « Voir la fiche » (ex. sur la fiche elle-même).
 * - `afterDeleteHref` : rediriger vers cette URL après suppression ; sinon `router.refresh()`.
 */
export function PropositionRowMenu({
  propositionId,
  showOpenDetail = true,
  afterDeleteHref,
}: {
  propositionId: string;
  showOpenDetail?: boolean;
  afterDeleteHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setOpen(false);
    const ok = window.confirm(
      'Supprimer cette proposition ?\n\nCette action supprimera aussi les documents sources et le fichier généré.',
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/propositions/${propositionId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Erreur lors de la suppression');
      }
      if (afterDeleteHref) {
        router.push(afterDeleteHref);
      } else {
        router.refresh();
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={deleting}
          aria-label="Actions"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-44 border-slate-200 bg-white p-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {showOpenDetail && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/propositions/${propositionId}`);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Voir la fiche
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </button>
      </PopoverContent>
    </Popover>
  );
}
