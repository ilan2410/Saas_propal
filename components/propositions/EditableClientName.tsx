'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function EditableClientName({
  propositionId,
  value,
  className,
  onSaved,
}: {
  propositionId: string;
  value: string;
  className?: string;
  onSaved?: (value: string) => void;
}) {
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setDraft(current);
    setEditing(false);
  };

  const save = async () => {
    const next = draft.trim();
    if (!next || next === current || saving) {
      if (next === current) setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom_client: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Modification impossible');
      setCurrent(next);
      setDraft(next);
      setEditing(false);
      onSaved?.(next);
      toast.success('Nom du client mis à jour');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
        className={cn('group inline-flex max-w-full items-center gap-1.5 text-left', className)}
        title="Modifier le nom du client"
      >
        <span className="truncate" title={current || 'Sans nom'}>{current || 'Sans nom'}</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex min-w-[140px] items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <input
        autoFocus
        value={draft}
        maxLength={255}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
          if (event.key === 'Escape') cancel();
        }}
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
      />
      <button type="button" onClick={() => void save()} disabled={saving || !draft.trim()} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" aria-label="Enregistrer">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button type="button" onClick={cancel} disabled={saving} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Annuler">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
