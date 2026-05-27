'use client';

import { useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { calculateSaCartSummary, type SaCartLine } from '@/lib/sp/calculateSaCart';
import { formatEuro } from '@/lib/sp/calculLoyer';

interface SaRealTimeCartProps {
  donneesExtraites?: Record<string, unknown>;
  /** Total mensuel SP pour afficher l'économie (optionnel). */
  spTotalMensuel?: number;
}

function Line({
  label,
  value,
  bold,
  muted,
  suffix = '/mois',
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  suffix?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between text-xs ${
        bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {formatEuro(value)}
        <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>
      </span>
    </div>
  );
}

interface CategoryAccordionProps {
  label: string;
  total: number;
  lines: SaCartLine[];
  expanded: boolean;
  onToggle: () => void;
}

function CategoryAccordion({ label, total, lines, expanded, onToggle }: CategoryAccordionProps) {
  if (total <= 0) return null;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-xs text-gray-700 hover:text-gray-900"
      >
        <span className="flex items-center gap-1">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {label}
        </span>
        <span className="tabular-nums">
          {formatEuro(total)}
          <span className="ml-0.5 text-[10px] text-gray-400">/mois</span>
        </span>
      </button>
      {expanded && (
        <div className="ml-3 space-y-0.5">
          {lines.map((l, i) => (
            <div
              key={`${l.libelle}-${i}`}
              className="flex items-start justify-between gap-2 text-[11px] text-gray-600 border-l-2 border-amber-100 pl-2"
            >
              <span className="truncate" title={l.libelle}>
                {l.libelle}
                {l.operateur && (
                  <span className="ml-1 text-[10px] text-gray-400">({l.operateur})</span>
                )}
              </span>
              <span className="tabular-nums shrink-0">{formatEuro(l.montant)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaRealTimeCart({ donneesExtraites, spTotalMensuel }: SaRealTimeCartProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const summary = useMemo(() => calculateSaCartSummary(donneesExtraites), [donneesExtraites]);

  const toggleCat = (key: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const grouped = useMemo(() => {
    const acc = {
      fixe: [] as SaCartLine[],
      mobile: [] as SaCartLine[],
      internet: [] as SaCartLine[],
      abonnement: [] as SaCartLine[],
      location: [] as SaCartLine[],
    };
    for (const l of summary.details) {
      if (l.categorie === 'fixe') acc.fixe.push(l);
      else if (l.categorie === 'mobile') acc.mobile.push(l);
      else if (l.categorie === 'internet') acc.internet.push(l);
      else if (l.categorie === 'location') acc.location.push(l);
      else acc.abonnement.push(l);
    }
    return acc;
  }, [summary.details]);

  if (!summary.hasData) return null;

  const economie =
    typeof spTotalMensuel === 'number' && spTotalMensuel > 0
      ? summary.totalMensuel - spTotalMensuel
      : null;

  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-200 bg-white shadow-xl"
      role="complementary"
      aria-label="Panier situation actuelle"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-amber-600 to-amber-500 px-3 py-2 text-white hover:from-amber-700 hover:to-amber-600 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="h-4 w-4" />
          Situation Actuelle
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums opacity-90">
            {formatEuro(summary.totalMensuel)}
            <span className="opacity-70">/mois</span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 space-y-2 max-h-[40vh] overflow-y-auto">
          {/* Section "Lignes" cachée lorsque le total provient des totaux officiels
              (les lignes sont déjà comprises dans les abonnements). */}
          {!summary.totalFromOfficiel &&
          (summary.lignesFixes > 0 || summary.lignesMobiles > 0 || summary.lignesInternet > 0) ? (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Lignes
              </p>
              <CategoryAccordion
                label="Fixe"
                total={summary.lignesFixes}
                lines={grouped.fixe}
                expanded={expandedCats.has('fixe')}
                onToggle={() => toggleCat('fixe')}
              />
              <CategoryAccordion
                label="Mobile"
                total={summary.lignesMobiles}
                lines={grouped.mobile}
                expanded={expandedCats.has('mobile')}
                onToggle={() => toggleCat('mobile')}
              />
              <CategoryAccordion
                label="Internet"
                total={summary.lignesInternet}
                lines={grouped.internet}
                expanded={expandedCats.has('internet')}
                onToggle={() => toggleCat('internet')}
              />
            </section>
          ) : null}

          {summary.abonnements > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Abonnements
              </p>
              <CategoryAccordion
                label="Abonnements"
                total={summary.abonnements}
                lines={grouped.abonnement}
                expanded={expandedCats.has('abonnement')}
                onToggle={() => toggleCat('abonnement')}
              />
              {(grouped.fixe.length > 0 ||
                grouped.mobile.length > 0 ||
                grouped.internet.length > 0) && (
                <details className="ml-3">
                  <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 list-none flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    Détail par ligne (informatif)
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {[...grouped.fixe, ...grouped.mobile, ...grouped.internet].map((l, i) => (
                      <div
                        key={`${l.libelle}-${i}`}
                        className="flex items-start justify-between gap-2 text-[11px] text-gray-500 border-l-2 border-amber-100 pl-2"
                      >
                        <span className="truncate" title={l.libelle}>
                          {l.libelle}
                          {l.operateur && (
                            <span className="ml-1 text-[10px] text-gray-400">({l.operateur})</span>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {l.montant.toFixed(2).replace('.', ',')} €
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {summary.locations > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Locations matériel
              </p>
              <CategoryAccordion
                label="Locations"
                total={summary.locations}
                lines={grouped.location}
                expanded={expandedCats.has('location')}
                onToggle={() => toggleCat('location')}
              />
            </section>
          )}

          <div className="pt-1 border-t border-amber-100">
            <Line
              label={summary.totalFromOfficiel ? 'Total mensuel SA (extrait)' : 'Total mensuel SA'}
              value={summary.totalMensuel}
              bold
            />
            {economie !== null && (
              <div
                className={`flex items-center justify-between text-xs pt-1 ${
                  economie > 0 ? 'text-emerald-700' : economie < 0 ? 'text-red-700' : 'text-gray-500'
                }`}
              >
                <span className="font-medium">
                  {economie > 0
                    ? 'Économie loyer SP vs SA'
                    : economie < 0
                      ? 'Surcoût loyer SP vs SA'
                      : 'Égal'}
                </span>
                <span className="tabular-nums font-semibold">
                  {formatEuro(Math.abs(economie))}
                  <span className="ml-0.5 text-[10px] opacity-70">/mois</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
