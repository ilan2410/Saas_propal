'use client';

import { Fragment, useMemo, useState } from 'react';
import { Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatting';
import { calculateSaCartSummary, type SaCartLine, type SaCartSummary } from '@/lib/sp/calculateSaCart';

interface Props {
  text: string;
  /** Visual variant: 'default' for detail pages, 'compact' for inline panels */
  variant?: 'default' | 'compact';
  /** Structured SA data used to highlight the monthly cost the client pays. */
  donneesExtraites?: unknown;
  className?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Une composante du loyer mensuel (poste de coût + lignes qui le composent). */
interface MonthlyRow {
  key: string;
  label: string;
  amount: number;
  lines: SaCartLine[];
}

/** Décompose le total mensuel en postes de coût, dans l'ordre du panier SA. */
function buildBreakdown(summary: SaCartSummary): MonthlyRow[] {
  const byCat = (cat: SaCartLine['categorie']) => summary.details.filter((l) => l.categorie === cat);
  const rows: MonthlyRow[] = [];

  // Les lignes ne sont comptées que si les abonnements ne les englobent pas déjà
  // (cf. `totalFromOfficiel` dans calculateSaCartSummary).
  if (!summary.totalFromOfficiel) {
    rows.push({ key: 'fixe', label: 'Lignes fixes', amount: summary.lignesFixes, lines: byCat('fixe') });
    rows.push({ key: 'mobile', label: 'Lignes mobiles', amount: summary.lignesMobiles, lines: byCat('mobile') });
    rows.push({ key: 'internet', label: 'Internet', amount: summary.lignesInternet, lines: byCat('internet') });
  }

  rows.push({
    key: 'abonnement',
    label: 'Abonnements',
    amount: summary.abonnements,
    lines: summary.totalFromOfficiel
      ? byCat('abonnement')
      : [...byCat('abonnement'), ...byCat('autre')],
  });
  rows.push({
    key: 'location',
    label: 'Locations matériel',
    amount: summary.locations,
    lines: byCat('location'),
  });

  return rows.filter((r) => r.amount > 0.005);
}

/** Resolve the monthly amount the client currently pays, with HT/TTC precision. */
function resolveMonthlyTotal(
  donnees: unknown
): { amount: number; precision?: string; rows: MonthlyRow[] } | null {
  if (donnees == null) return null;
  const root = isRecord(donnees) ? donnees : {};
  const sa = isRecord(root.situation_actuelle) ? root.situation_actuelle : root;
  const totaux = isRecord(sa.totaux) ? sa.totaux : {};

  // Source unique alignée sur le panier « Situation Actuelle » affiché dans le
  // questionnaire SP (déduplication abonnements/locations + réconciliation sur
  // les montants « source » réellement facturés). On retombe sur les totaux
  // extraits uniquement si le panier ne contient aucune donnée, en privilégiant
  // toujours la SOURCE (montant réellement payé par le client).
  const summary = calculateSaCartSummary(donnees);
  if (summary.totalMensuel > 0) {
    // Le panier SA ramène toujours les montants en HT (cf. normalizeSaAmountsToHT).
    return { amount: summary.totalMensuel, precision: 'HT', rows: buildBreakdown(summary) };
  }

  const amount =
    toNumber(totaux.total_solution_actuelle_source) ||
    toNumber(totaux.total_solution_actuelle_calcule);
  if (!(amount > 0)) return null;

  const precisionRaw = typeof totaux.precision === 'string' ? totaux.precision : undefined;
  const precision =
    precisionRaw === 'HT' || precisionRaw === 'TTC' ? precisionRaw : undefined;
  return { amount, precision, rows: [] };
}

type Block =
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string; parts: SectionPart[] }
  | { kind: 'paragraph'; text: string };

type SectionPart =
  | { type: 'items'; items: ListItem[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

interface ListItem {
  label?: string;
  value: string;
}

/** Split a markdown table row into trimmed cells. */
function parseTableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

const isSeparatorRow = (cells: string[]) => cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');

/** Render inline **bold** segments within a string. */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (match) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-gray-900">
          {match[1]}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

/** Parse the lightweight markdown produced for SA summaries into structured blocks. */
function parseResume(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let currentSection: Extract<Block, { kind: 'section' }> | null = null;

  const flushSection = () => {
    if (currentSection) {
      blocks.push(currentSection);
      currentSection = null;
    }
  };

  const ensureSection = () => {
    if (!currentSection) currentSection = { kind: 'section', text: '', parts: [] };
    return currentSection;
  };

  const addItem = (item: ListItem) => {
    const section = ensureSection();
    const last = section.parts[section.parts.length - 1];
    if (last && last.type === 'items') last.items.push(item);
    else section.parts.push({ type: 'items', items: [item] });
  };

  const addTableRow = (cells: string[]) => {
    const section = ensureSection();
    let last = section.parts[section.parts.length - 1];
    if (!last || last.type !== 'table') {
      last = { type: 'table', headers: [], rows: [] };
      section.parts.push(last);
    }
    if (isSeparatorRow(cells)) return;
    if (last.headers.length === 0) last.headers = cells;
    else last.rows.push(cells);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^#{2,}\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    const isTableRow = /^\|.*\|?$/.test(line) && line.includes('|');

    if (h2) {
      flushSection();
      currentSection = { kind: 'section', text: h2[1].trim(), parts: [] };
      continue;
    }
    if (h1) {
      flushSection();
      blocks.push({ kind: 'title', text: h1[1].trim() });
      continue;
    }
    if (isTableRow) {
      addTableRow(parseTableCells(line));
      continue;
    }
    if (li) {
      const content = li[1].trim();
      // Split "**Label** : value" into label/value
      const labelMatch = content.match(/^\*\*([^*]+)\*\*\s*[:\-–]\s*(.*)$/);
      const item: ListItem = labelMatch
        ? { label: labelMatch[1].trim(), value: labelMatch[2].trim() }
        : { value: content };
      addItem(item);
      continue;
    }

    // Plain paragraph
    flushSection();
    blocks.push({ kind: 'paragraph', text: line });
  }

  flushSection();
  return blocks;
}

function CollapsibleSection({
  block,
  compact,
  blockIndex,
}: {
  block: Extract<Block, { kind: 'section' }>;
  compact: boolean;
  blockIndex: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={`rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden ${
        compact ? '' : 'shadow-sm'
      }`}
    >
      {block.text && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center gap-2 bg-white/70 text-left transition-colors hover:bg-gray-50 ${
            open ? 'border-b border-gray-100' : ''
          } ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          )}
          <span className="h-4 w-1 rounded-full bg-indigo-500 shrink-0" />
          <h4
            className={`font-semibold uppercase tracking-wide text-gray-700 ${
              compact ? 'text-[11px]' : 'text-xs'
            }`}
          >
            {block.text}
          </h4>
        </button>
      )}
      {open &&
        block.parts.map((part, p) =>
          part.type === 'items' ? (
            <dl key={p} className="divide-y divide-gray-100">
              {part.items.map((item, j) =>
                item.label ? (
                  <div
                    key={j}
                    className={`flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3 ${
                      compact ? 'px-3 py-1.5' : 'px-4 py-2.5'
                    }`}
                  >
                    <dt
                      className={`shrink-0 font-medium text-gray-500 sm:w-44 ${
                        compact ? 'text-[11px]' : 'text-xs'
                      }`}
                    >
                      {item.label}
                    </dt>
                    <dd className={`text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
                      {item.value ? renderInline(item.value, `v-${blockIndex}-${p}-${j}`) : '—'}
                    </dd>
                  </div>
                ) : (
                  <div
                    key={j}
                    className={`text-gray-700 ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'}`}
                  >
                    {renderInline(item.value, `t-${blockIndex}-${p}-${j}`)}
                  </div>
                )
              )}
            </dl>
          ) : (
            <div key={p} className="overflow-x-auto">
              <table className="w-full border-collapse">
                {part.headers.length > 0 && (
                  <thead>
                    <tr className="bg-white/70">
                      {part.headers.map((h, hi) => (
                        <th
                          key={hi}
                          className={`border-b border-gray-200 text-left font-semibold text-gray-600 ${
                            compact ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'
                          }`}
                        >
                          {renderInline(h, `th-${blockIndex}-${p}-${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {part.rows.map((row, ri) => (
                    <tr key={ri} className="even:bg-gray-50/50">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`border-b border-gray-100 align-top text-gray-800 ${
                            ci === 0 ? 'font-medium text-gray-900' : ''
                          } ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
                        >
                          {renderInline(cell, `td-${blockIndex}-${p}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
    </section>
  );
}

/** Détail du loyer mensuel : postes de coût dépliables affichés à côté du total. */
function MonthlyBreakdown({
  rows,
  total,
  compact,
}: {
  rows: MonthlyRow[];
  total: number;
  compact: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Une seule composante ⇒ elle vaut 100 % du total, la part n'apporte rien.
  const showShare = rows.length > 1;

  return (
    <div
      className={`min-w-0 border-t border-indigo-200/70 pt-3 sm:border-t-0 sm:border-l sm:pt-0 ${
        compact ? 'sm:pl-3' : 'sm:pl-5'
      } sm:flex-1 sm:max-w-sm`}
    >
      <p
        className={`mb-1.5 font-medium uppercase tracking-wide text-indigo-700/60 ${
          compact ? 'text-[9px]' : 'text-[10px]'
        }`}
      >
        Détail du calcul
      </p>
      <div className="divide-y divide-indigo-200/50">
        {rows.map((row) => {
          const open = openKey === row.key;
          const expandable = row.lines.length > 0;
          const share = total > 0 ? Math.round((row.amount / total) * 100) : 0;

          return (
            <div key={row.key} className="py-1">
              <button
                type="button"
                onClick={() => expandable && setOpenKey(open ? null : row.key)}
                disabled={!expandable}
                aria-expanded={expandable ? open : undefined}
                className={`flex w-full items-baseline gap-2 rounded text-left transition-colors ${
                  expandable ? 'hover:bg-white/60' : 'cursor-default'
                } ${compact ? 'px-1 py-0.5' : 'px-1.5 py-1'}`}
              >
                {expandable ? (
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 self-center text-indigo-400 transition-transform ${
                      open ? 'rotate-90' : ''
                    }`}
                  />
                ) : (
                  <span className="h-3 w-3 shrink-0" />
                )}
                <span className={`min-w-0 flex-1 truncate text-indigo-900/80 ${compact ? 'text-[11px]' : 'text-xs'}`}>
                  {row.label}
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums text-indigo-900 ${
                    compact ? 'text-[11px]' : 'text-xs'
                  }`}
                >
                  {formatCurrency(row.amount)}
                </span>
                {showShare && (
                  <span
                    className={`w-8 shrink-0 text-right tabular-nums text-indigo-500/70 ${
                      compact ? 'text-[9px]' : 'text-[10px]'
                    }`}
                  >
                    {share}%
                  </span>
                )}
              </button>

              {open && (
                <ul className={`space-y-0.5 pb-1 pl-5 pr-1 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                  {row.lines.map((line, i) => (
                    <li key={`${row.key}-${i}`} className="flex items-baseline gap-2 text-indigo-900/70">
                      <span className="min-w-0 flex-1 truncate" title={line.libelle}>
                        {line.libelle}
                        {line.operateur ? (
                          <span className="text-indigo-500/70"> · {line.operateur}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatCurrency(line.montant)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {rows.length > 1 && (
        <div
          className={`mt-1 flex items-baseline gap-2 border-t border-indigo-300/60 px-1.5 pt-1.5 font-semibold text-indigo-900 ${
            compact ? 'text-[11px]' : 'text-xs'
          }`}
        >
          <span className="flex-1 pl-5">Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
          <span className="w-8" />
        </div>
      )}
    </div>
  );
}

export function SaResumeRenderer({ text, variant = 'default', donneesExtraites, className = '' }: Props) {
  const blocks = useMemo(() => parseResume(text), [text]);
  const monthly = useMemo(() => resolveMonthlyTotal(donneesExtraites), [donneesExtraites]);
  const compact = variant === 'compact';

  return (
    <div className={`${compact ? 'space-y-3' : 'space-y-5'} ${className}`}>
      {monthly && (
        <div
          className={`flex flex-col gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 sm:flex-row sm:items-center sm:gap-5 ${
            compact ? 'px-3 py-2.5' : 'px-5 py-4'
          }`}
        >
          <div className="flex shrink-0 items-center gap-3">
            <div className={`flex items-center justify-center rounded-lg bg-indigo-600 text-white ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}>
              <Wallet className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
            </div>
            <div className="min-w-0">
              <p className={`font-medium uppercase tracking-wide text-indigo-700/80 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                Loyer mensuel actuel du client
              </p>
              <p className={`font-bold leading-tight text-indigo-900 ${compact ? 'text-lg' : 'text-2xl'}`}>
                {formatCurrency(monthly.amount)}
                <span className={`ml-1 font-semibold text-indigo-500 ${compact ? 'text-xs' : 'text-sm'}`}>
                  {monthly.precision ? `${monthly.precision} /mois` : '/mois'}
                </span>
              </p>
            </div>
          </div>

          {monthly.rows.length > 0 && (
            <MonthlyBreakdown rows={monthly.rows} total={monthly.amount} compact={compact} />
          )}
        </div>
      )}
      {blocks.map((block, i) => {
        if (block.kind === 'title') {
          return (
            <h3
              key={i}
              className={`font-bold text-gray-900 ${compact ? 'text-sm' : 'text-lg'}`}
            >
              {block.text}
            </h3>
          );
        }

        if (block.kind === 'paragraph') {
          return (
            <p key={i} className={`text-gray-700 leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
              {renderInline(block.text, `p-${i}`)}
            </p>
          );
        }

        // section
        return <CollapsibleSection key={i} block={block} compact={compact} blockIndex={i} />;
      })}
    </div>
  );
}
