'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SaResumeRenderer } from './SaResumeRenderer';
import { buildEditedSaData, isRecord } from '@/lib/sa/direct-confirmation';
import { getSaEditableLines, prepareSaForEditing, type SaEditOp, type SaLinePatch, type SaSection } from '@/lib/sp/saCartEdit';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { formatEuro } from '@/lib/sp/calculLoyer';
import type { SpConfigResiliation } from '@/types';

const SECTION_STYLES: Record<SaSection, { label: string; defaultName: string; card: string; badge: string; dot: string; action: string }> = {
  abonnement: { label: 'Abonnements', defaultName: 'Abonnement', card: 'border-blue-300 bg-blue-50/60', badge: 'bg-blue-100 text-blue-900', dot: 'bg-blue-600', action: 'text-blue-800' },
  location: { label: 'Locations matériel', defaultName: 'Location', card: 'border-emerald-300 bg-emerald-50/60', badge: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-600', action: 'text-emerald-800' },
  variable: { label: 'Charges variables', defaultName: 'Charge variable', card: 'border-orange-300 bg-orange-50/60', badge: 'bg-orange-100 text-orange-900', dot: 'bg-orange-500', action: 'text-orange-800' },
};

export function DirectSaEditor({ propositionId, data, resiliationConfig, referenceDate, onConfirmed }: {
  propositionId: string;
  data: Record<string, unknown>;
  resiliationConfig?: SpConfigResiliation;
  referenceDate?: string;
  onConfirmed: (data: Record<string, unknown>) => void;
}) {
  const [operations, setOperations] = useState<SaEditOp[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [open]);
  // Seules les vraies incohérences de total justifient l'alerte ; les autres
  // anomalies (ex. montant de contrat à confirmer) ne parlent pas d'un total faux.
  const mismatchIssues = isRecord(data._extraction_control)
    && data._extraction_control.status === 'review_required'
    && Array.isArray(data._extraction_control.issues)
    ? data._extraction_control.issues.filter(isRecord)
      .filter(issue => issue.code === 'monthly_total_mismatch' || issue.code === 'invoice_total_mismatch')
    : [];
  const hasTotalMismatch = mismatchIssues.length > 0;
  // issue.expected / issue.actual : cf. calculateCanonicalSaAnalysis.
  // - monthly_total_mismatch : expected = total recalculé, actual = total annoncé
  // - invoice_total_mismatch : expected = total imprimé, actual = somme des lignes
  const cents = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const mismatchDetail = (issue: Record<string, unknown>) => {
    const expected = cents(issue.expected);
    const actual = cents(issue.actual);
    if (expected === null || actual === null) return 'Les montants extraits ne sont pas cohérents entre eux.';
    if (issue.code === 'monthly_total_mismatch') {
      const gap = Math.round((actual - expected) * 100) / 100;
      return `Les lignes extraites totalisent ${formatEuro(expected)} HT, alors que le total mensuel lu dans les documents est de ${formatEuro(actual)} HT `
        + (gap > 0 ? `: il manque ${formatEuro(gap)} HT, probablement une ligne non reprise (annexe, page de détail, option).`
          : `: les lignes dépassent de ${formatEuro(-gap)} HT, probablement une ligne en double ou à exclure.`);
    }
    const gap = Math.round((expected - actual) * 100) / 100;
    return `Sur une facture, la somme des lignes est de ${formatEuro(actual)} HT, alors que le total imprimé est de ${formatEuro(expected)} HT `
      + (gap > 0 ? `(${formatEuro(gap)} HT non retrouvés dans le détail).` : `(${formatEuro(-gap)} HT de trop dans le détail).`);
  };
  const monthlyIssue = mismatchIssues.find(issue => issue.code === 'monthly_total_mismatch');
  const missingAmount = monthlyIssue && cents(monthlyIssue.actual) !== null && cents(monthlyIssue.expected) !== null
    ? Math.round((cents(monthlyIssue.actual)! - cents(monthlyIssue.expected)!) * 100) / 100 : 0;
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
    {hasTotalMismatch && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>Le total extrait présente une incohérence. Vérifiez les montants et corrigez le détail avant de confirmer la SA.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {mismatchIssues.map((issue, index) => <li key={index}>{mismatchDetail(issue)}</li>)}
      </ul>
      <p className="mt-2 text-xs text-amber-800">Comparez avec le document : l&apos;écart indique ce qu&apos;il faut chercher. Corrigez via « Modifier la SA » ou confirmez si l&apos;écart est sans importance.</p>
      {missingAmount > 0 && operations.length === 0 && <button type="button" className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        onClick={() => {
          setOpen(true);
          setOperations([{ kind: 'add', input: { section: 'abonnement', designation: 'Ligne manquante à préciser', quantite: 1, montant: missingAmount } }]);
        }}>
        Ajouter la ligne manquante ({formatEuro(missingAmount)} HT) et la renommer
      </button>}
    </div>}
    <div aria-live="polite">
      <SaResumeRenderer text={typeof preview.resume === 'string' ? preview.resume : ''} donneesExtraites={preview}
        action={<button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}
          className="whitespace-nowrap rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50">
          Modifier la SA
        </button>} />
    </div>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sa-edit-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 id="sa-edit-title" className="text-lg font-semibold text-gray-900">Modifier la situation actuelle</h3>
            <p className="mt-1 text-sm text-gray-600">Corrigez, ajoutez ou supprimez des lignes. Le total se recalcule à chaque modification.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {(['abonnement', 'location', 'variable'] as SaSection[]).map(section => {
            const style = SECTION_STYLES[section];
            const sectionLines = lines.filter(line => line.section === section);
            return <section key={section} className={`space-y-3 rounded-xl border-2 ${style.card} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <h4 className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${style.badge}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />{style.label}
                </h4>
                <span className="text-xs text-gray-500">{sectionLines.length} ligne{sectionLines.length > 1 ? 's' : ''}</span>
              </div>
              {section === 'variable' && !summary.chargesVariablesIncluses && <p className="text-xs text-gray-500">Ces charges sont exclues du total mensuel selon la configuration du modèle.</p>}
              {sectionLines.length === 0 && <p className="text-sm text-gray-500">Aucune ligne.</p>}
              {sectionLines.map(line => {
                const field = (key: keyof SaLinePatch, title: string, value: string | number) => <label className="block min-w-0 text-xs text-gray-600">
                  {title}
                  <input aria-label={`${title} — ${line.designation}`} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
                    type={key === 'montant' || key === 'quantite' ? 'number' : 'text'}
                    min={key === 'quantite' ? 1 : key === 'montant' ? 0 : undefined}
                    max={key === 'quantite' ? 1e6 : key === 'montant' ? 1e9 : undefined}
                    maxLength={key === 'designation' ? 2000 : key === 'numero' ? 100 : undefined}
                    step={key === 'quantite' ? 1 : key === 'montant' ? '0.01' : undefined}
                    value={drafts[line.id]?.[key] ?? value} onChange={event => edit(line.id, key, event.target.value)} />
                </label>;
                return <div key={line.id} className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
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
              <button type="button" className={`text-sm font-medium hover:underline ${style.action}`} onClick={() => setOperations(previous => [...previous, {
                kind: 'add', input: { section, designation: style.defaultName, quantite: 1, montant: 0 },
              }])}>+ Ajouter une ligne</button>
            </section>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <div>
            <p aria-live="polite" className="text-sm font-semibold text-gray-900">Total mensuel SA : {formatEuro(summary.totalMensuel)} HT</p>
            <button type="button" className="text-xs text-gray-600 hover:underline" onClick={() => { setDrafts({}); setOperations([]); }}>Annuler toutes les corrections</button>
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Terminer</button>
        </div>
      </div>
    </div>, document.body)}
    <p className="text-sm text-amber-800">Après confirmation, la SA sera enregistrée définitivement et ne pourra plus être modifiée. Vous pourrez ensuite préparer la SP.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={saving}
      className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-50">
      {saving ? 'Enregistrement…' : 'Valider et confirmer la SA'}
    </button>
  </form>;
}
