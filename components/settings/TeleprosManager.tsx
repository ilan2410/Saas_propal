'use client';

import { useCallback, useEffect, useState } from 'react';
import { Headphones, Loader2, Pencil, Plus, RotateCcw, Ban, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export type Teleprospecteur = {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  actif: boolean;
};

const EMPTY_FORM = { prenom: '', nom: '' };

export function TeleprosManager({ endpoint = '/api/settings/telepros', compact = false }: { endpoint?: string; compact?: boolean }) {
  const [items, setItems] = useState<Teleprospecteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Teleprospecteur | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chargement impossible');
      setItems(Array.isArray(data.telepros) ? data.telepros : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const close = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const openEdit = (item: Teleprospecteur) => {
    setEditing(item);
    setCreating(false);
    setForm({ prenom: item.prenom ?? '', nom: item.nom ?? '' });
  };

  const save = async () => {
    if ((!form.prenom.trim() && !form.nom.trim()) || saving) return;
    setSaving(true);
    try {
      const url = editing ? `${endpoint}/${editing.id}` : endpoint;
      const response = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
      const item = data.telepro as Teleprospecteur;
      setItems((previous) => editing
        ? previous.map((current) => current.id === item.id ? item : current)
        : [...previous, item]);
      close();
      toast.success(editing ? 'Télépro mis à jour' : 'Télépro ajouté');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: Teleprospecteur) => {
    try {
      const response = await fetch(`${endpoint}/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: item.prenom,
          nom: item.nom,
          actif: !item.actif,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Modification impossible');
      setItems((previous) => previous.map((current) => current.id === item.id ? data.telepro : current));
      toast.success(item.actif ? 'Télépro désactivé' : 'Télépro réactivé');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 border-t border-gray-100 pt-8'}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className={compact ? 'text-lg font-semibold text-gray-900' : 'flex items-center gap-2 text-sm font-medium text-gray-900'}>
            {!compact && <Headphones className="h-4 w-4 text-gray-500" />}
            Télépros
          </h3>
          <p className="mt-1 text-sm text-gray-500">Contacts sans compte pouvant être associés aux propositions.</p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setEditing(null); setForm(EMPTY_FORM); }}><Plus className="h-4 w-4" />Ajouter</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">Aucun télépro pour le moment.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-medium text-gray-500">Nom</th><th className="px-4 py-2 text-left font-medium text-gray-500">Statut</th><th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => <tr key={item.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{`${item.prenom ?? ''} ${item.nom ?? ''}`.trim()}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.actif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{item.actif ? 'Actif' : 'Inactif'}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(item)} className="rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600" aria-label="Modifier"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void toggle(item)} className="rounded-md p-1.5 text-gray-500 hover:bg-orange-50 hover:text-orange-600" aria-label={item.actif ? 'Désactiver' : 'Réactiver'}>{item.actif ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">{editing ? 'Modifier le télépro' : 'Ajouter un télépro'}</h3><button type="button" onClick={close} className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-gray-700">Prénom<input value={form.prenom} onChange={(event) => setForm((previous) => ({ ...previous, prenom: event.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
              <label className="text-sm font-medium text-gray-700">Nom<input value={form.nom} onChange={(event) => setForm((previous) => ({ ...previous, nom: event.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={close}>Annuler</Button><Button onClick={() => void save()} disabled={saving || (!form.prenom.trim() && !form.nom.trim())}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
