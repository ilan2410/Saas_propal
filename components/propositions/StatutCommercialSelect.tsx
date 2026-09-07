'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  STATUTS_COMMERCIAUX,
  STATUT_COMMERCIAL_CONFIG,
  getStatutCommercial,
  type StatutCommercial,
} from '@/lib/propositions/status';

/**
 * Sélecteur du statut commercial d'une proposition (En cours / En attente client /
 * Signée / Perdue). Mise à jour optimiste + PATCH /api/propositions/[id]/update.
 * À n'afficher que lorsque la proposition est exportée.
 */
export function StatutCommercialSelect({
  propositionId,
  value,
  align = 'start',
  className,
}: {
  propositionId: string;
  value: string | null | undefined;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<StatutCommercial>(
    (STATUTS_COMMERCIAUX as string[]).includes(value ?? '')
      ? (value as StatutCommercial)
      : 'en_cours',
  );

  const config = getStatutCommercial(current);

  const handleSelect = async (next: StatutCommercial) => {
    setOpen(false);
    if (next === current || saving) return;

    const previous = current;
    setCurrent(next); // optimiste
    setSaving(true);

    try {
      const res = await fetch(`/api/propositions/${propositionId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut_commercial: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.details || data.error || 'Échec de la mise à jour');
      }
      router.refresh();
    } catch (err) {
      setCurrent(previous); // rollback
      window.alert(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={saving}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-95 disabled:opacity-60',
            config.badgeClass,
            className,
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
          {config.label}
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-52 border-slate-200 bg-white p-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {STATUTS_COMMERCIAUX.map((statut) => {
          const item = STATUT_COMMERCIAL_CONFIG[statut];
          return (
            <button
              key={statut}
              type="button"
              onClick={() => handleSelect(statut)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className={cn('h-2 w-2 rounded-full', item.dotClass)} />
              <span className="flex-1 text-left">{item.label}</span>
              {statut === current && <Check className="h-4 w-4 text-slate-500" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
