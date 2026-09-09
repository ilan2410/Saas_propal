'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import {
  TOTAL_BLOCKING_ISSUE_CODES,
  calculateCanonicalSaAnalysis,
  type ExtractionQualityIssue,
  type InvoiceAnalysisLine,
  type InvoiceAnalysisReport,
} from '@/lib/sa/invoice-analysis';

interface Props {
  propositionId: string;
  initialReport: InvoiceAnalysisReport;
  initialTotal: number;
  /** Charges variables comptées ou non dans le total mensuel (décidé par le template). */
  includeVariableCharges?: boolean;
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

/** Ligne vierge ajoutée manuellement par l'utilisateur (montant mensuel par défaut). */
function makeBlankLine(): InvoiceAnalysisLine {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: 'Nouvelle ligne',
    category: 'subscription',
    amount_ht_signed: 0,
    amount_ttc_signed: null,
    vat_rate: null,
    quantity: 1,
    amount_scope: 'line_total',
    recurring: true,
    billing_months: 1,
    source_periodicity: 'mensuel',
    related_line_id: null,
    operator: null,
    site: null,
    phone_number: null,
    contract_reference: null,
    evidence: [],
  };
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
      return `${where} : le détail des lignes (${euro(issue.actual as number)}) ne correspond pas au total HT imprimé sur la facture (${euro(issue.expected as number)}). Modifiez, ajoutez ou supprimez une ligne.`;
    case 'monthly_total_mismatch':
      return `Le détail des factures totalise ${euro(issue.expected as number)}, mais l'extraction avait annoncé ${euro(issue.actual as number)}. Vérifiez les lignes des factures ci-dessous.`;
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
  onDelete,
}: {
  id: string;
  line: InvoiceAnalysisLine;
  flagMessages: string[];
  editing: boolean;
  onToggleEdit: () => void;
  onUpdate: (key: string, value: unknown) => void;
  onDelete: () => void;
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
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label={`Supprimer ${line.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
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
      <div className="mt-2 flex items-center gap-4">
        <button type="button" onClick={onToggleEdit} className="text-xs font-medium text-gray-500 hover:text-gray-700">
          Réduire
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-3 w-3" />
          Supprimer la ligne
        </button>
      </div>
    </div>
  );
}

// ── Panneau principal ────────────────────────────────────────────────────

export function SaExtractionReview({
  propositionId,
  initialReport,
  initialTotal,
  includeVariableCharges = true,
  onValidated,
  onDismiss,
}: Props) {
  const [report, setReport] = useState(() => cloneReport(initialReport));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedInvoices, setExpandedInvoices] = useState<Set<number>>(new Set());
  const [editingLines, setEditingLines] = useState<Set<string>>(new Set());
  const didAutoExpand = useRef(false);

  const invoices = report.invoices;

  // Le total « à prendre en compte pour la SA » et les anomalies sont recalculés
  // à chaque modification de ligne, avec exactement la même logique que
  // l'extraction (fonction partagée). L'utilisateur ne saisit jamais le total
  // directement : il agit uniquement sur les lignes (montant, ajout, suppression).
  const activeFields = useMemo(() => report.field_coverage.map((item) => item.field), [report.field_coverage]);
  const liveCanonical = useMemo(
    () => calculateCanonicalSaAnalysis(report, activeFields, includeVariableCharges),
    [report, activeFields, includeVariableCharges],
  );
  const computedTotal = liveCanonical.total_ht_mensuel_client;
  const computedByInvoice = useMemo(
    () => liveCanonical.invoices.map((invoice) => invoice.monthly_total_ht),
    [liveCanonical],
  );
  const liveIssues = liveCanonical.issues;

  // Vrai dès qu'une ligne a été modifiée / ajoutée / supprimée.
  const isDirty = useMemo(
    () => JSON.stringify(report) !== JSON.stringify(initialReport),
    [report, initialReport],
  );

  // Anomalies qui remettent en cause le total (les seules à afficher comme
  // « à corriger » — le reste est informatif et n'empêche pas de continuer).
  const blockingIssues = useMemo(() => liveIssues.filter((i) => TOTAL_BLOCKING_ISSUE_CODES.has(i.code)), [liveIssues]);

  const { lineIssuesByKey, invoiceIssuesByIndex } = useMemo(() => {
    const byLine = new Map<string, string[]>();
    const byInvoice = new Map<number, string[]>();
    for (const issue of blockingIssues) {
      const loc = locateIssue(issue.path);
      if (loc.kind === 'global') continue;
      const message = describeIssue(issue, report);
      if (loc.kind === 'line') {
        const key = lineKey(loc.invoiceIndex, loc.lineIndex);
        byLine.set(key, [...(byLine.get(key) ?? []), message]);
      } else {
        byInvoice.set(loc.invoiceIndex, [...(byInvoice.get(loc.invoiceIndex) ?? []), message]);
      }
    }
    return { lineIssuesByKey: byLine, invoiceIssuesByIndex: byInvoice };
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

  // Au premier affichage d'une anomalie bloquante, on déplie toutes les factures
  // (l'anomalie « total mensuel » n'est rattachée à aucune facture précise).
  useEffect(() => {
    if (!didAutoExpand.current && blockingIssues.length > 0) {
      didAutoExpand.current = true;
      setExpandedInvoices(new Set(invoices.map((_, index) => index)));
    }
  }, [blockingIssues.length, invoices]);

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

  const addLine = (invoiceIndex: number) => {
    const newLineIndex = report.invoices[invoiceIndex].lines.length;
    setReport((current) => {
      const next = cloneReport(current);
      next.invoices[invoiceIndex].lines.push(makeBlankLine());
      return next;
    });
    setExpandedInvoices((prev) => new Set(prev).add(invoiceIndex));
    setEditingLines((prev) => new Set(prev).add(lineKey(invoiceIndex, newLineIndex)));
  };

  const deleteLine = (invoiceIndex: number, lineIndex: number) => {
    setReport((current) => {
      const next = cloneReport(current);
      next.invoices[invoiceIndex].lines.splice(lineIndex, 1);
      return next;
    });
    setEditingLines((prev) => {
      const next = new Set(prev);
      next.delete(lineKey(invoiceIndex, lineIndex));
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

  /**
   * Persiste le détail relu par l'utilisateur. `force` fait passer outre les
   * anomalies restantes : sans lui, un détail volontairement différent de la
   * facture serait rejeté et les corrections saisies seraient perdues.
   */
  const submit = async (force: boolean) => {
    setSaving(true);
    setError('');
    try {
      // Le détail relu par l'utilisateur fait foi : on aligne le total annoncé
      // sur le total recalculé à partir des lignes avant de valider.
      const reportToSend = cloneReport(report);
      reportToSend.declared_monthly_total_ht = computedTotal;
      const response = await fetch(`/api/propositions/${propositionId}/validate-sa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: reportToSend, force }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Les données restent incohérentes.');
      }
      onValidated(result.donnees_extraites ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de validation');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Second bouton : tant que rien n'a été modifié, il se contente de fermer le
   * panneau. Dès qu'une ligne a été touchée, il enregistre ces montants (en
   * forçant) avant de fermer — sinon le panier SA repartirait des montants
   * d'origine.
   */
  const continueWithoutFixing = async () => {
    if (isDirty) await submit(true);
    onDismiss?.();
  };

  const remainingCount = blockingIssues.length;
  const displayedTotal = Number.isFinite(computedTotal) ? computedTotal : initialTotal;

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
              : 'Vérifiez le détail ci-dessous, ou continuez sans corriger si vous préférez y revenir plus tard.'}
          </p>
          <p className="mt-2 text-xl font-bold text-amber-950">{euro(displayedTotal)} HT / mois</p>
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
                <span className="shrink-0 text-right text-[11px] leading-tight text-gray-500">
                  Total HT imprimé sur la facture
                  <span className="ml-2 tabular-nums text-sm font-medium text-gray-700">{euro(invoice.printed_total_ht)}</span>
                </span>
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-gray-700">Total HT à prendre en compte pour la SA</span>
                      <span className="tabular-nums text-sm font-bold text-gray-900">{euro(computedByInvoice[invoiceIndex])}</span>
                    </div>
                    <p className="mt-1 text-gray-400">
                      Recalculé automatiquement à partir des lignes ci-dessous. Pour l&apos;ajuster, modifiez, ajoutez ou supprimez une ligne.
                    </p>
                    {invoiceMessages.map((message, i) => (
                      <p key={i} className="mt-1 flex gap-1.5 text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{message}</span>
                      </p>
                    ))}
                  </div>

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
                          onDelete={() => deleteLine(invoiceIndex, lineIndex)}
                        />
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => addLine(invoiceIndex)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une ligne
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => submit(false)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Recalculer et valider
        </button>
        {onDismiss && (
          <button type="button" onClick={continueWithoutFixing} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            {isDirty ? 'Continuer avec mes montants' : 'Continuer sans corriger'}
          </button>
        )}
      </div>
    </div>
  );
}
