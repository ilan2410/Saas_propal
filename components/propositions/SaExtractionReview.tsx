'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import type { ExtractionQualityIssue, InvoiceAnalysisReport } from '@/lib/sa/invoice-analysis';

interface Props {
  propositionId: string;
  initialReport: InvoiceAnalysisReport;
  initialTotal: number;
  initialIssues: ExtractionQualityIssue[];
  onValidated: (data: Record<string, unknown>) => void;
}

function cloneReport(report: InvoiceAnalysisReport): InvoiceAnalysisReport {
  return JSON.parse(JSON.stringify(report)) as InvoiceAnalysisReport;
}

export function SaExtractionReview({ propositionId, initialReport, initialTotal, initialIssues, onValidated }: Props) {
  const [report, setReport] = useState(() => cloneReport(initialReport));
  const [issues, setIssues] = useState(initialIssues);
  const [manualTotal, setManualTotal] = useState('');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const invoices = useMemo(() => report.invoices, [report]);

  const updateLine = (invoiceIndex: number, lineIndex: number, key: string, value: unknown) => {
    setReport((current) => {
      const next = cloneReport(current);
      (next.invoices[invoiceIndex].lines[lineIndex] as unknown as Record<string, unknown>)[key] = value;
      return next;
    });
  };

  const updateCoverage = (index: number, value: string) => {
    setReport((current) => {
      const next = cloneReport(current);
      next.field_coverage[index].value_json = value || null;
      next.field_coverage[index].status = value ? 'found' : 'not_found';
      next.field_coverage[index].reason = null;
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const parsedManualTotal = Number(manualTotal.replace(',', '.'));
      const response = await fetch(`/api/propositions/${propositionId}/validate-sa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          manual_total_ht: Number.isFinite(parsedManualTotal) && parsedManualTotal > 0 ? parsedManualTotal : null,
          justification,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (Array.isArray(result.quality_issues)) setIssues(result.quality_issues);
        throw new Error(result.error || 'Les données restent incohérentes.');
      }
      onValidated(result.donnees_extraites ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de validation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-left">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="font-bold text-amber-950">Vérification de la situation actuelle requise</h3>
          <p className="text-sm text-amber-800">Corrigez les valeurs signalées ou confirmez manuellement le total HT mensuel avant de continuer.</p>
          <p className="mt-2 text-xl font-bold text-amber-950">Total recalculé : {initialTotal.toFixed(2).replace('.', ',')} € HT/mois</p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-gray-900">Anomalies détectées</p>
          <ul className="space-y-1 text-xs text-red-700">
            {issues.map((issue, index) => <li key={`${issue.path}-${index}`}>• {issue.message}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {invoices.map((invoice, invoiceIndex) => (
          <div key={`${invoice.document_index}-${invoiceIndex}`} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">Facture {invoice.invoice_number || invoice.document_index + 1}</p>
              <label className="text-xs text-gray-600">Total HT imprimé
                <input type="number" step="0.01" value={invoice.printed_total_ht ?? ''} onChange={(e) => {
                  setReport((current) => {
                    const next = cloneReport(current);
                    next.invoices[invoiceIndex].printed_total_ht = e.target.value === '' ? null : Number(e.target.value);
                    return next;
                  });
                }} className="ml-2 w-28 rounded border px-2 py-1 text-sm" />
              </label>
            </div>
            <div className="space-y-3">
              {invoice.lines.map((line, lineIndex) => (
                <div key={line.id} className="grid gap-2 border-t border-gray-100 pt-3 md:grid-cols-5">
                  <label className="text-xs text-gray-600 md:col-span-2">Libellé
                    <input value={line.label} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'label', e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">Montant HT signé
                    <input type="number" step="0.01" value={line.amount_ht_signed ?? ''} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'amount_ht_signed', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">Quantité
                    <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'quantity', Number(e.target.value))} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">Nombre de mois
                    <input type="number" min="0.01" step="0.01" value={line.billing_months} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'billing_months', Number(e.target.value))} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">Catégorie
                    <select value={line.category} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'category', e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm">
                      <option value="subscription">Abonnement</option>
                      <option value="line">Ligne</option>
                      <option value="location">Location</option>
                      <option value="discount">Remise</option>
                      <option value="variable">Variable</option>
                      <option value="one_time">Ponctuel</option>
                      <option value="other">Autre</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end pb-1 text-xs text-gray-600">
                    <input type="checkbox" checked={line.recurring} onChange={(e) => updateLine(invoiceIndex, lineIndex, 'recurring', e.target.checked)} />
                    Récurrent
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {report.field_coverage.some((item) => item.status === 'ambiguous') && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-3 text-sm font-semibold text-gray-900">Champs ambigus</p>
          <div className="space-y-3">
            {report.field_coverage.map((item, index) => item.status === 'ambiguous' ? (
              <label key={item.field} className="block text-xs text-gray-600">{item.field}
                <textarea value={item.value_json ?? ''} onChange={(e) => updateCoverage(index, e.target.value)} className="mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-xs" />
                {item.reason && <span className="mt-1 block text-amber-700">{item.reason}</span>}
              </label>
            ) : null)}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">Validation manuelle du total</p>
        <p className="mb-3 text-xs text-gray-500">À utiliser uniquement si les factures restent ambiguës après correction du détail.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-600">Total HT mensuel confirmé
            <input type="number" min="0" step="0.01" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-gray-600">Justification
            <input value={justification} onChange={(e) => setJustification(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
          </label>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Recalculer et valider
      </button>
    </div>
  );
}
