'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { flushSpSaves } from '@/lib/propositions/sp-save-queue';

export function SpVariantSelector({ propositionId, variants, selectedId }: {
  propositionId: string; variants: { id: string; nom: string }[]; selectedId?: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedName = variants.find(v => v.id === selectedId)?.nom ?? 'Offre initiale';
  async function navigate(id?: string) {
    setBusy(true); setError(null);
    try {
      await flushSpSaves();
      router.push(`/propositions/${propositionId}${id ? `?variant=${encodeURIComponent(id)}` : ''}`, { scroll: false });
    } catch { setError('Enregistrement impossible. Réessayez avant de changer de variante.'); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await flushSpSaves();
      const response = await fetch(`/api/propositions/${propositionId}/variants`, {
        method: dialog === 'delete' ? 'DELETE' : dialog === 'rename' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: name.trim(), source_variant_id: selectedId, variant_id: selectedId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDialog(null);
      if (dialog === 'delete') router.push(`/propositions/${propositionId}`, { scroll: false });
      if (data.id) router.push(`/propositions/${propositionId}?variant=${data.id}`, { scroll: false });
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Impossible de sauvegarder les dernières modifications.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Variantes SP" className={variants.length ? 'rounded-xl border border-slate-200 bg-white p-4' : ''}>
    <div className={`flex flex-wrap items-center justify-end gap-2 ${variants.length ? 'mb-3' : ''}`}>{variants.length > 0 && <div className="mr-auto"><h2 className="text-sm font-semibold text-slate-900">Variantes SP</h2><p className="text-xs text-slate-500">Chaque offre se modifie indépendamment</p></div>}
      <button disabled={busy} onClick={() => { setName(`Variante ${variants.length + 2}`); setError(null); setDialog('create'); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"><Copy className="h-4 w-4" />Créer une variante</button>
    </div>
    {variants.length > 0 && <><div className="flex flex-wrap items-center gap-2">{[{ id: '', nom: 'Offre initiale' }, ...variants].map(v => <button key={v.id} disabled={busy} aria-pressed={(selectedId ?? '') === v.id} onClick={() => navigate(v.id || undefined)} className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${(selectedId ?? '') === v.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{v.nom}</button>)}
      {selectedId && <button aria-label="Renommer la variante sélectionnée" disabled={busy} onClick={() => { setName(selectedName); setError(null); setDialog('rename'); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>}
      {selectedId && <button disabled={busy} onClick={() => { setError(null); setDialog('delete'); }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Supprimer</button>}
    </div>
    <p className="mt-3 text-xs text-slate-500">Les téléchargements et exports SA/SP utilisent l’offre sélectionnée : {selectedName}.</p></>}
    {error && !dialog && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <Dialog open={!!dialog} onOpenChange={open => { if (!busy && !open) setDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{dialog === 'delete' ? 'Supprimer la variante ?' : dialog === 'rename' ? 'Renommer la variante' : 'Créer une variante SP'}</DialogTitle><DialogDescription>{dialog === 'delete' ? `L’offre « ${selectedName} » et ses fichiers générés, annexes comprises, seront supprimés. L’offre initiale et les autres variantes seront conservées.` : dialog === 'rename' ? 'Donnez un nom facile à retrouver à cette offre.' : `Copier « ${selectedName} », puis modifier ses produits, quantités ou prix. La SA reste commune.`}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">{dialog !== 'delete' && <label className="block text-sm">Nom de la variante<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-2" /></label>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDialog(null)} className="rounded-lg border px-3 py-2 text-sm">Annuler</button><button disabled={busy || (dialog !== 'delete' && !name.trim())} className={`rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 ${dialog === 'delete' ? 'bg-red-700' : 'bg-slate-900'}`}>{busy ? 'Enregistrement…' : dialog === 'delete' ? 'Supprimer la variante' : dialog === 'rename' ? 'Enregistrer' : 'Créer et modifier'}</button></div>
      </form>
    </DialogContent></Dialog>
  </section>;
}
