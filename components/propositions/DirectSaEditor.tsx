'use client';

import { useMemo, useState } from 'react';
import { SaResumeRenderer } from './SaResumeRenderer';
import { buildEditedSaData, isRecord } from '@/lib/sa/direct-confirmation';
import { getSaEditableLines, prepareSaForEditing, type SaEditOp, type SaLinePatch, type SaSection } from '@/lib/sp/saCartEdit';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { formatEuro } from '@/lib/sp/calculLoyer';
import type { SpConfigResiliation } from '@/types';

export function DirectSaEditor({ propositionId, data, resiliationConfig, referenceDate, onConfirmed }: {
  propositionId: string;
  data: Record<string, unknown>;
  resiliationConfig?: SpConfigResiliation;
  referenceDate?: string;
  onConfirmed: (data: Record<string, unknown>) => void;
}) {
  const [operations, setOperations] = useState<SaEditOp[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const preview = useMemo(() => buildEditedSaData(data, operations, resiliationConfig, referenceDate),
    [data, operations, resiliationConfig, referenceDate]);
  const lines = getSaEditableLines(prepareSaForEditing(preview.situation_actuelle), true);
  const summary = calculateSaCartSummary(preview);
  const edit = (id: string, field: keyof SaLinePatch, value: string) => {
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], [field]: value } }));
    const patch = field === 'montant' ? { montant: Math.max(0, Number(value) || 0) }
      : field === 'quantite' ? { quantite: Math.max(1, Math.round(Number(value)) || 1) }
      : { [field]: value };
    setOperations(previous => [...previous, { kind: 'update', id, patch }]);
  };
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/propositions/${propositionId}/confirm-sa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations, revision: isRecord(data._sa_edit_context) ? data._sa_edit_context.revision : undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible d'enregistrer la SA.");
      onConfirmed(result.donnees_extraites);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible d'enregistrer la SA.");
    } finally {
      setSaving(false);
    }
  };
  return <form onSubmit={event => { event.preventDefault(); void confirm(); }} className="mx-auto max-w-5xl space-y-5">
    <div>
      <h3 className="text-xl font-semibold text-gray-900">Vérifier la situation actuelle</h3>
      <p className="mt-2 text-sm text-gray-600">Corrigez les lignes, quantités et prix. Les totaux se recalculent à chaque modification.</p>
    </div>
    {isRecord(data._extraction_control) && data._extraction_control.status === 'review_required' && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Le total extrait présente une incohérence. Vérifiez les montants et corrigez le détail avant de confirmer la SA.
    </p>}
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      {(['abonnement', 'location', 'variable'] as SaSection[]).map(section => {
        const label = { abonnement: 'Abonnements', location: 'Locations matériel', variable: 'Charges variables' }[section];
        return <section key={section} className="space-y-3 rounded-xl border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-900">{label}</h4>
          {section === 'variable' && !summary.chargesVariablesIncluses && <p className="text-xs text-gray-500">Ces charges sont exclues du total mensuel selon la configuration du modèle.</p>}
          {lines.filter(line => line.section === section).map(line => {
            const field = (key: keyof SaLinePatch, title: string, value: string | number) => <label className="block min-w-0 text-xs text-gray-600">
              {title}
              <input aria-label={`${title} — ${line.designation}`} className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900"
                type={key === 'montant' || key === 'quantite' ? 'number' : 'text'}
                min={key === 'quantite' ? 1 : key === 'montant' ? 0 : undefined}
                max={key === 'quantite' ? 1e6 : key === 'montant' ? 1e9 : undefined}
                maxLength={key === 'designation' ? 2000 : key === 'numero' ? 100 : undefined}
                step={key === 'quantite' ? 1 : key === 'montant' ? '0.01' : undefined}
                required={key === 'quantite' || key === 'montant'}
                value={drafts[line.id]?.[key] ?? value} onChange={event => edit(line.id, key, event.target.value)} />
            </label>;
            return <div key={line.id} className="space-y-2 border-t border-gray-100 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {field('designation', 'Désignation', line.designation)}
                {section !== 'variable' && field('numero', 'Numéro', line.numero)}
                {section !== 'variable' && field('quantite', 'Quantité', line.quantite)}
                {field('montant', 'Prix mensuel unitaire HT', line.montant)}
              </div>
              <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => {
                setDrafts({});
                setOperations(previous => [...previous, { kind: 'delete', id: line.id }]);
              }}>Supprimer la ligne</button>
            </div>;
          })}
          <button type="button" className="text-sm font-medium text-amber-800 hover:underline" onClick={() => setOperations(previous => [...previous, {
            kind: 'add', input: { section, designation: section === 'variable' ? 'Charge variable' : section === 'location' ? 'Location' : 'Abonnement', quantite: 1, montant: 0 },
          }])}>Ajouter une ligne</button>
        </section>;
      })}
      <div aria-live="polite" className="rounded-xl bg-amber-50 p-4 text-lg font-semibold text-amber-950">Total mensuel SA : {formatEuro(summary.totalMensuel)} HT</div>
      <button type="button" className="text-sm text-gray-600 hover:underline" onClick={() => { setDrafts({}); setOperations([]); }}>Annuler toutes les corrections</button>
      <div className="rounded-xl border border-gray-200 p-4">
        <SaResumeRenderer text={typeof preview.resume === 'string' ? preview.resume : ''} donneesExtraites={preview} />
      </div>
    </fieldset>
    <p className="text-sm text-amber-800">Après confirmation, la SA sera enregistrée définitivement et ne pourra plus être modifiée. Vous pourrez ensuite préparer la SP.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={saving}
      className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-50">
      {saving ? 'Enregistrement…' : 'Valider et confirmer la SA'}
    </button>
  </form>;
}
