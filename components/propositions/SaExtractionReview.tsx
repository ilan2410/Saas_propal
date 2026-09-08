'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Pencil, Save } from 'lucide-react';
import {
  TOTAL_BLOCKING_ISSUE_CODES,
  type ExtractionQualityIssue,
  type InvoiceAnalysisLine,
  type InvoiceAnalysisReport,
} from '@/lib/sa/invoice-analysis';

interface Props {
  propositionId: string;
  initialReport: InvoiceAnalysisReport;
  initialTotal: number;
  initialIssues: ExtractionQualityIssue[];
  onValidated: (data: Record<string, unknown>) => void;
  /** Ferme le panneau sans rien corriger : la suite reste accessible. */
  onDismiss?: () => void;
}

function cloneReport(report: InvoiceAnalysisReport): InvoiceAnalysisReport {
  return JSON.parse(JSON.stringify(report)) as InvoiceAnalysisReport;
}

function euro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function invoiceLabel(invoice: InvoiceAnalysisReport['invoices'][number]): string {
  return invoice.invoice_number ? `Facture ${invoice.invoice_number}` : `Facture ${invoice.document_index + 1}`;
}

// ── Localisation d'une anomalie dans le rapport ─────────────────────────

type IssueLocation =
  | { kind: 'line'; invoiceIndex: number; lineIndex: number }
  | { kind: 'invoice'; invoiceIndex: number }
  | { kind: 'global' };

function locateIssue(path: string): IssueLocation {
  const lineMatch = path.match(/^invoices\.(\d+)\.lines\.(\d+)/);
  if (lineMatch) return { kind: 'line', invoiceIndex: Number(lineMatch[1]), lineIndex: Number(lineMatch[2]) };
  const invoiceMatch = path.match(/^invoices\.(\d+)\b/);
  if (invoiceMatch) return { kind: 'invoice', invoiceIndex: Number(invoiceMatch[1]) };
  return { kind: 'global' };
}

/** Traduit une anomalie technique en phrase compréhensible, avec sa localisation. */
function describeIssue(issue: ExtractionQualityIssue, report: InvoiceAnalysisReport): string {
  const loc = locateIssue(issue.path);
  const invoice = loc.kind !== 'global' ? report.invoices[loc.invoiceIndex] : undefined;
  const line = loc.kind === 'line' && invoice ? invoice.lines[loc.lineIndex] : undefined;
  const where = invoice ? invoiceLabel(invoice) : null;

  switch (issue.code) {
    case 'missing_amount':
      return `${where} — « ${line?.label ?? 'une ligne'} » : montant HT manquant. Saisissez-le pour qu'il soit compté dans le total.`;
    case 'invalid_period':
      return `${where} — « ${line?.label ?? 'une ligne'} » : durée de facturation incohérente. Vérifiez le nombre de mois.`;
    case 'invoice_total_mismatch':
      return `${where} : le détail des lignes (${euro(issue.actual as number)}) ne correspond pas au total HT imprimé sur la facture (${euro(issue.expected as number)}). Une ligne manque ou un montant est faux.`;
    case 'monthly_total_mismatch':
      return `Le détail des factures totalise ${euro(issue.expected as number)}, mais l'extraction avait annoncé ${euro(issue.actual as number)}. Vérifiez les factures signalées ci-dessous.`;
    default:
      return issue.message;
  }
}

function lineKey(invoiceIndex: number, lineIndex: number): string {
  return `${invoiceIndex}-${lineIndex}`;
}

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ── Ligne de facture ─────────────────────────────────────────────────────

function InvoiceLineRow({
  id,
  line,
  flagMessages,
  editing,
  onToggleEdit,
  onUpdate,
}: {
  id: string;
  line: InvoiceAnalysisLine;
  flagMessages: string[];
  editing: boolean;
  onToggleEdit: () => void;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const flagged = flagMessages.length > 0;

  if (!editing) {
    return (
      <div
        id={id}
        className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm ${
          flagged ? 'border border-amber-300 bg-amber-50' : ''
        }`}
      >
        <span className="min-w-0 truncate text-gray-700" title={line.label}>
          {line.label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums text-gray-900">{euro(line.amount_ht_signed ?? line.amount_ttc_signed)}</span>
          <button
            type="button"
            onClick={onToggleEdit}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={`Modifier ${line.label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={id} className={`rounded-lg p-3 ${flagged ? 'border border-amber-300 bg-amber-50' : 'border border-gray-200 bg-white'}`}>
      <div className="grid gap-2 md:grid-cols-5">
        <label className="text-xs text-gray-600 md:col-span-2">
          Libellé
          <input
            value={line.label}
            onChange={(e) => onUpdate('label', e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          Montant HT
          <input
            type="number"
            step="0.01"
            value={line.amount_ht_signed ?? ''}
            onChange={(e) => onUpdate('amount_ht_signed', e.target.value === '' ? null : Number(e.target.value))}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          Quantité
          <input
            type="number"
            min="1"
            step="1"
            value={line.quantity}
            onChange={(e) => onUpdate('quantity', Number(e.target.value))}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          Nombre de mois
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={line.billing_months}
            onChange={(e) => onUpdate('billing_months', Number(e.target.value))}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          Catégorie
          <select
            value={line.category}
            onChange={(e) => onUpdate('category', e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          >
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
          <input type="checkbox" checked={line.recurring} onChange={(e) => onUpdate('recurring', e.target.checked)} />
          Récurrent
        </label>
      </div>
      {flagged && (
        <ul className="mt-2 space-y-1 border-t border-amber-200 pt-2 text-xs text-amber-900">
          {flagMessages.map((message, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{message}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onToggleEdit} className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700">
        Réduire
      </button>
    </div>
  );
}

// ── Panneau principal ────────────────────────────────────────────────────

export function SaExtractionReview({ propositionId, initialReport, initialTotal, initialIssues, onValidated, onDismiss }: Props) {
  const [report, setReport] = useState(() => cloneReport(initialReport));
  const [issues, setIssues] = useState(initialIssues);
  const [manualTotal, setManualTotal] = useState('');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<number>>(new Set());
  const [editingLines, setEditingLines] = useState<Set<string>>(new Set());

  const invoices = report.invoices;

  // Anomalies qui remettent en cause le total (les seules à afficher comme
  // « à corriger » — le reste est informatif et n'empêche pas de continuer).
  const blockingIssues = useMemo(() => issues.filter((i) => TOTAL_BLOCKING_ISSUE_CODES.has(i.code)), [issues]);
  const secondaryIssues = useMemo(
    () => issues.filter((i) => !TOTAL_BLOCKING_ISSUE_CODES.has(i.code) && i.code !== 'ambiguous_field'),
    [issues],
  );

  const { lineIssuesByKey, invoiceIssuesByIndex, globalIssues } = useMemo(() => {
    const byLine = new Map<string, string[]>();
    const byInvoice = new Map<number, string[]>();
    const global: string[] = [];
    for (const issue of blockingIssues) {
      const loc = locateIssue(issue.path);
      const message = describeIssue(issue, report);
      if (loc.kind === 'line') {
        const key = lineKey(loc.invoiceIndex, loc.lineIndex);
        byLine.set(key, [...(byLine.get(key) ?? []), message]);
      } else if (loc.kind === 'invoice') {
        byInvoice.set(loc.invoiceIndex, [...(byInvoice.get(loc.invoiceIndex) ?? []), message]);
      } else {
        global.push(message);
      }
    }
    return { lineIssuesByKey: byLine, invoiceIssuesByIndex: byInvoice, globalIssues: global };
  }, [blockingIssues, report]);

  const flaggedInvoiceIndexes = useMemo(() => {
    const set = new Set<number>(invoiceIssuesByIndex.keys());
    for (const key of lineIssuesByKey.keys()) set.add(Number(key.split('-')[0]));
    return set;
  }, [invoiceIssuesByIndex, lineIssuesByKey]);

  // Ouvre automatiquement les factures et lignes signalées (sans jamais
  // refermer ce que l'utilisateur a ouvert lui-même).
  useEffect(() => {
    setExpandedInvoices((prev) => new Set([...prev, ...flaggedInvoiceIndexes]));
    setEditingLines((prev) => new Set([...prev, ...lineIssuesByKey.keys()]));
  }, [flaggedInvoiceIndexes, lineIssuesByKey]);

  const toggleInvoice = (index: number) =>
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const toggleLineEdit = (key: string) =>
    setEditingLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  const updatePrintedTotal = (invoiceIndex: number, value: string) => {
    setReport((current) => {
      const next = cloneReport(current);
      next.invoices[invoiceIndex].printed_total_ht = value === '' ? null : Number(value);
      return next;
    });
  };

  const goToIssue = (issue: ExtractionQualityIssue) => {
    const loc = locateIssue(issue.path);
    if (loc.kind === 'line') {
      setExpandedInvoices((prev) => new Set(prev).add(loc.invoiceIndex));
      setEditingLines((prev) => new Set(prev).add(lineKey(loc.invoiceIndex, loc.lineIndex)));
      scrollToId(`sa-line-${loc.invoiceIndex}-${loc.lineIndex}`);
    } else if (loc.kind === 'invoice') {
      setExpandedInvoices((prev) => new Set(prev).add(loc.invoiceIndex));
      scrollToId(`sa-invoice-${loc.invoiceIndex}`);
    }
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

  const remainingCount = blockingIssues.length;

  return (
    <div className="space-y-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-left">
      {/* En-tête : un fait, une action */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <h3 className="font-bold text-amber-950">Le total mensuel doit être vérifié</h3>
          <p className="text-sm text-amber-800">
            {remainingCount > 0
              ? `${remainingCount} point${remainingCount > 1 ? 's' : ''} à corriger ci-dessous, ou continuez sans corriger si vous préférez y revenir plus tard.`
              : 'Corrigez le détail ci-dessous, ou continuez sans corriger si vous préférez y revenir plus tard.'}
          </p>
          <p className="mt-2 text-xl font-bold text-amber-950">{euro(initialTotal)} HT / mois</p>
        </div>
      </div>

      {/* Liste actionnable des anomalies : chacune pointe vers son champ */}
      {blockingIssues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-white p-3">
          {blockingIssues.map((issue, index) => {
            const loc = locateIssue(issue.path);
            const clickable = loc.kind !== 'global';
            return (
              <li key={`${issue.path}-${index}`}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => goToIssue(issue)}
                    className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{describeIssue(issue, report)}</span>
                  </button>
                ) : (
                  <div className="flex items-start gap-1.5 px-1 py-0.5 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{describeIssue(issue, report)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Détail par facture : repliée si rien à y corriger */}
      <div className="space-y-3">
        {invoices.map((invoice, invoiceIndex) => {
          const isOpen = expandedInvoices.has(invoiceIndex);
          const invoiceMessages = invoiceIssuesByIndex.get(invoiceIndex) ?? [];
          const isFlagged = flaggedInvoiceIndexes.has(invoiceIndex);
          return (
            <div key={`${invoice.document_index}-${invoiceIndex}`} id={`sa-invoice-${invoiceIndex}`} className="rounded-lg border border-gray-200 bg-white p-3">
              <button
                type="button"
                onClick={() => toggleInvoice(invoiceIndex)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  {invoiceLabel(invoice)}
                  {isFlagged && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">à vérifier</span>
                  )}
                </span>
                <span className="tabular-nums text-sm text-gray-600">{euro(invoice.printed_total_ht)}</span>
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  {invoiceMessages.length > 0 ? (
                    <label className="block w-fit rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                      Total HT imprimé sur la facture
                      <input
                        type="number"
                        step="0.01"
                        value={invoice.printed_total_ht ?? ''}
                        onChange={(e) => updatePrintedTotal(invoiceIndex, e.target.value)}
                        className="ml-2 w-28 rounded border px-2 py-1 text-sm"
                      />
                      {invoiceMessages.map((message, i) => (
                        <span key={i} className="mt-1 block max-w-sm">{message}</span>
                      ))}
                    </label>
                  ) : (
                    <label className="block w-fit text-xs text-gray-600">
                      Total HT imprimé sur la facture
                      <input
                        type="number"
                        step="0.01"
                        value={invoice.printed_total_ht ?? ''}
                        onChange={(e) => updatePrintedTotal(invoiceIndex, e.target.value)}
                        className="ml-2 w-28 rounded border px-2 py-1 text-sm"
                      />
                    </label>
                  )}

                  <div className="space-y-1">
                    {invoice.lines.map((line, lineIndex) => {
                      const key = lineKey(invoiceIndex, lineIndex);
                      return (
                        <InvoiceLineRow
                          key={line.id}
                          id={`sa-line-${invoiceIndex}-${lineIndex}`}
                          line={line}
                          flagMessages={lineIssuesByKey.get(key) ?? []}
                          editing={editingLines.has(key)}
                          onToggleEdit={() => toggleLineEdit(key)}
                          onUpdate={(field, value) => updateLine(invoiceIndex, lineIndex, field, value)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Champs ambigus : secondaire, n'empêche pas de continuer */}
      {report.field_coverage.some((item) => item.status === 'ambiguous') && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-1 text-sm font-semibold text-gray-900">Informations à confirmer</p>
          <p className="mb-3 text-xs text-gray-500">N&apos;affectent pas le total ci-dessus ; complétez-les si vous connaissez la réponse.</p>
          <div className="space-y-3">
            {report.field_coverage.map((item, index) =>
              item.status === 'ambiguous' ? (
                <label key={item.field} className="block text-xs text-gray-600">
                  {item.field}
                  <textarea
                    value={item.value_json ?? ''}
                    onChange={(e) => updateCoverage(index, e.target.value)}
                    className="mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-xs"
                  />
                  {item.reason && <span className="mt-1 block text-amber-700">{item.reason}</span>}
                </label>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* Remarques mineures : repliées, pour ne pas noyer les corrections utiles */}
      {(secondaryIssues.length > 0 || globalIssues.length > 0) && (
        <div>
          <button type="button" onClick={() => setShowSecondary((v) => !v)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ChevronDown className={`h-3 w-3 transition-transform ${showSecondary ? '' : '-rotate-90'}`} />
            Autres remarques ({secondaryIssues.length + globalIssues.length})
          </button>
          {showSecondary && (
            <ul className="mt-2 space-y-1 pl-4 text-xs text-gray-500">
              {globalIssues.map((message, i) => <li key={`g-${i}`}>• {message}</li>)}
              {secondaryIssues.map((issue, i) => <li key={`s-${i}`}>• {issue.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Total manuel : dernier recours, replié par défaut */}
      <div>
        {!showManualOverride ? (
          <button type="button" onClick={() => setShowManualOverride(true)} className="text-xs font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900">
            Le détail ne suffit pas ? Saisissez le total vous-même
          </button>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold text-gray-900">Confirmer le total manuellement</p>
            <p className="mb-3 text-xs text-gray-500">À utiliser uniquement si les factures restent ambiguës après correction du détail.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-600">
                Total HT mensuel confirmé
                <input type="number" min="0" step="0.01" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-gray-600">
                Justification
                <input value={justification} onChange={(e) => setJustification(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
              </label>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Recalculer et valider
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            Continuer sans corriger
          </button>
        )}
      </div>
    </div>
  );
}
