'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type TeleprospecteurOption = {
  id: string;
  name: string;
  actif: boolean;
};

export function TeleprospecteurSelect({
  propositionId,
  value,
  options,
  canCreate = false,
  onChanged,
}: {
  propositionId: string;
  value: string | null;
  options: TeleprospecteurOption[];
  canCreate?: boolean;
  onChanged?: (id: string | null, option?: TeleprospecteurOption) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? '');
  const [items, setItems] = useState(options);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ prenom: '', nom: '' });

  const update = async (next: string) => {
    if (saving || next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teleprospecteur_id: next || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Association impossible');
      onChanged?.(next || null, items.find((item) => item.id === next));
      toast.success(next ? 'Télépro associé' : 'Télépro retiré');
    } catch (error) {
      setCurrent(previous);
      toast.error(error instanceof Error ? error.message : 'Association impossible');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if ((!form.prenom.trim() && !form.nom.trim()) || creating) return;
    setCreating(true);
    try {
      const response = await fetch('/api/settings/telepros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Création impossible');
      const option = {
        id: data.telepro.id as string,
        name: `${data.telepro.prenom ?? ''} ${data.telepro.nom ?? ''}`.trim(),
        actif: true,
      };
      setItems((previous) => [...previous, option].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      setForm({ prenom: '', nom: '' });
      setOpen(false);
      await update(option.id);
      onChanged?.(option.id, option);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible');
    } finally {
      setCreating(false);
    }
  };

  const selected = items.find((item) => item.id === current);
  const selectedName = selected ? `${selected.name}${selected.actif ? '' : ' (inactif)'}` : 'Télépro';

  return (
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {current ? (
        <span className="inline-flex max-w-[150px] items-center gap-0.5 text-xs font-medium text-slate-700" title={selectedName}>
          <span className="truncate">{selectedName}</span>
          <button
            type="button"
            onClick={() => void update('')}
            disabled={saving}
            aria-label="Retirer le télépro"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <div className="relative min-w-0">
          <select
            value={current}
            disabled={saving}
            onChange={(event) => void update(event.target.value)}
            className="w-full max-w-[150px] truncate rounded-md border border-slate-200 bg-white px-2 py-1 pr-7 text-xs text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
            aria-label="Téléprospecteur"
          >
            <option value="">Non assigné</option>
            {items.filter((item) => item.actif || item.id === current).map((item) => (
              <option key={item.id} value={item.id}>{item.name}{item.actif ? '' : ' (inactif)'}</option>
            ))}
          </select>
          {saving && <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />}
        </div>
      )}
      {canCreate && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Ajouter un télépro">
              <Plus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 border-slate-200 bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-900">Nouveau télépro</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input placeholder="Prénom" value={form.prenom} onChange={(event) => setForm((previous) => ({ ...previous, prenom: event.target.value }))} className="rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-slate-400" />
              <input placeholder="Nom" value={form.nom} onChange={(event) => setForm((previous) => ({ ...previous, nom: event.target.value }))} className="rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <button type="button" onClick={() => void create()} disabled={creating || (!form.prenom.trim() && !form.nom.trim())} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajouter et associer
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
