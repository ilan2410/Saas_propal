'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import type {
  CatalogueProduit,
  SpConfigLoyer,
  SpQuestion,
  SpQuestionReponse,
} from '@/types';
import { calculateCartSummary, type CartLine } from '@/lib/sp/calculateCart';
import { formatEuro } from '@/lib/sp/calculLoyer';

interface SpRealTimeCartProps {
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  catalogue: CatalogueProduit[];
  donneesExtraites?: Record<string, unknown>;
  spConfigLoyer?: SpConfigLoyer;
}

function Line({
  label,
  value,
  suffix,
  bold,
  muted,
}: {
  label: string;
  value: number;
  suffix?: string;
  bold?: boolean;
  muted?: boolean;
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
        {suffix && <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>}
      </span>
    </div>
  );
}

function DetailRow({
  line,
  suffix,
  mode = 'price',
}: {
  line: CartLine;
  suffix?: string;
  mode?: 'price' | 'fas';
}) {
  const qty = line.quantite > 0 ? line.quantite : 1;
  const prixUnitaire = line.prixTotal / qty;
  const headerAmount = mode === 'fas' ? line.fasTotal : line.prixTotal;
  const headerSuffix = mode === 'fas' ? undefined : suffix;
  return (
    <div className="flex flex-col gap-0.5 py-0.5 border-l-2 border-gray-100 pl-2">
      <div className="flex items-start justify-between gap-2 text-[11px] text-gray-700">
        <span className="truncate" title={line.produitNom}>
          {line.produitNom}
        </span>
        <span className="tabular-nums shrink-0 text-gray-600">
          {formatEuro(headerAmount)}
          {headerSuffix && <span className="ml-0.5 text-[9px] text-gray-400">{headerSuffix}</span>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
        <span className="tabular-nums">
          {formatEuro(prixUnitaire)}
          {suffix && <span className="ml-0.5">{suffix}</span>}
          <span className="mx-1">×</span>
          {qty}
        </span>
        {mode !== 'fas' && line.fasTotal > 0 && (
          <span className="tabular-nums">
            FAS&nbsp;{formatEuro(line.fasTotal)}
          </span>
        )}
      </div>
    </div>
  );
}

interface CategoryAccordionProps {
  label: string;
  total: number;
  suffix?: string;
  bold?: boolean;
  muted?: boolean;
  detailSuffix?: string;
  detailMode?: 'price' | 'fas';
  lines: CartLine[];
  expanded: boolean;
  onToggle: () => void;
}

function CategoryAccordion({
  label,
  total,
  suffix,
  bold,
  muted,
  detailSuffix,
  detailMode = 'price',
  lines,
  expanded,
  onToggle,
}: CategoryAccordionProps) {
  const hasDetails = lines.length > 0;
  if (!hasDetails) {
    return <Line label={label} value={total} suffix={suffix} bold={bold} muted={muted} />;
  }
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-xs hover:bg-gray-50 -mx-1 px-1 py-0.5 rounded"
      >
        <span
          className={`flex items-center gap-1 ${
            bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
          }`}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-gray-400" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-400" />
          )}
          {label}
        </span>
        <span
          className={`tabular-nums ${
            bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
          }`}
        >
          {formatEuro(total)}
          {suffix && <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-1">
          {lines.map((l) => (
            <DetailRow
              key={l.instanceId + l.produitNom}
              line={l}
              suffix={detailSuffix ?? suffix}
              mode={detailMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpRealTimeCart({
  reponses,
  questions,
  catalogue,
  donneesExtraites,
  spConfigLoyer,
}: SpRealTimeCartProps) {
  const [collapsed, setCollapsed] = useState(false);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (key: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const summary = useMemo(
    () => calculateCartSummary(reponses, questions, catalogue, donneesExtraites ?? {}, spConfigLoyer),
    [reponses, questions, catalogue, donneesExtraites, spConfigLoyer],
  );

  const grouped = useMemo(() => {
    const acc = {
      fixe: [] as CartLine[],
      mobile: [] as CartLine[],
      internet: [] as CartLine[],
      autresMensuels: [] as CartLine[],
      equipement: [] as CartLine[],
      cadeau: [] as CartLine[],
      installation: [] as CartLine[],
      autresPonctuels: [] as CartLine[],
      fas: [] as CartLine[],
    };
    for (const l of summary.lines) {
      if (l.fasTotal > 0) acc.fas.push(l);
      if (l.type_frequence === 'mensuel') {
        if (l.categorie === 'fixe') acc.fixe.push(l);
        else if (l.categorie === 'mobile') acc.mobile.push(l);
        else if (l.categorie === 'internet') acc.internet.push(l);
        else acc.autresMensuels.push(l);
      } else {
        if (l.categorie === 'equipement') acc.equipement.push(l);
        else if (l.categorie === 'cadeau') acc.cadeau.push(l);
        else if (l.categorie === 'installation') acc.installation.push(l);
        else acc.autresPonctuels.push(l);
      }
    }
    return acc;
  }, [summary.lines]);

  const hasAnyLine = summary.lines.length > 0;
  const grandTotalMensuel = summary.loyer?.loyer_mensuel ?? summary.abonnements.totalMensuel;

  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-xl"
      role="complementary"
      aria-label="Panier temps réel"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-white hover:from-blue-700 hover:to-blue-600 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Situation Proposée
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums opacity-90">
            {formatEuro(grandTotalMensuel)}
            <span className="opacity-70">/mois</span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {!hasAnyLine && (
            <p className="text-xs text-gray-400 italic">
              Aucun produit sélectionné pour l’instant.
            </p>
          )}

          {hasAnyLine && (
            <>
              {/* Abonnements */}
              <section className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Abonnements
                </p>
                <CategoryAccordion
                  label="Fixe"
                  total={summary.abonnements.fixe}
                  suffix="/mois"
                  lines={grouped.fixe}
                  expanded={expandedCats.has('fixe')}
                  onToggle={() => toggleCat('fixe')}
                />
                <CategoryAccordion
                  label="Mobile"
                  total={summary.abonnements.mobile}
                  suffix="/mois"
                  lines={grouped.mobile}
                  expanded={expandedCats.has('mobile')}
                  onToggle={() => toggleCat('mobile')}
                />
                <CategoryAccordion
                  label="Internet"
                  total={summary.abonnements.internet}
                  suffix="/mois"
                  lines={grouped.internet}
                  expanded={expandedCats.has('internet')}
                  onToggle={() => toggleCat('internet')}
                />
                {summary.autresMensuels > 0 && (
                  <CategoryAccordion
                    label="Autres"
                    total={summary.autresMensuels}
                    suffix="/mois"
                    muted
                    lines={grouped.autresMensuels}
                    expanded={expandedCats.has('autres_m')}
                    onToggle={() => toggleCat('autres_m')}
                  />
                )}
                <div className="pt-1 border-t border-gray-100">
                  <Line
                    label="Total mensuel"
                    value={summary.abonnements.totalMensuel}
                    suffix="/mois"
                    bold
                  />
                </div>
              </section>

              {/* Ponctuels */}
              {(summary.materiel > 0 ||
                summary.cadeaux > 0 ||
                summary.installations > 0 ||
                summary.fas > 0 ||
                summary.autresPonctuels > 0) && (
                <section className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Ponctuel
                  </p>
                  {summary.materiel > 0 && (
                    <CategoryAccordion
                      label="Matériel"
                      total={summary.materiel}
                      lines={grouped.equipement}
                      expanded={expandedCats.has('equipement')}
                      onToggle={() => toggleCat('equipement')}
                    />
                  )}
                  {summary.cadeaux > 0 && (
                    <CategoryAccordion
                      label="Cadeaux"
                      total={summary.cadeaux}
                      lines={grouped.cadeau}
                      expanded={expandedCats.has('cadeau')}
                      onToggle={() => toggleCat('cadeau')}
                    />
                  )}
                  {summary.installations > 0 && (
                    <CategoryAccordion
                      label="Installations"
                      total={summary.installations}
                      lines={grouped.installation}
                      expanded={expandedCats.has('installation')}
                      onToggle={() => toggleCat('installation')}
                    />
                  )}
                  {summary.fas > 0 && (
                    <CategoryAccordion
                      label="FAS"
                      total={summary.fas}
                      lines={grouped.fas}
                      detailMode="fas"
                      expanded={expandedCats.has('fas')}
                      onToggle={() => toggleCat('fas')}
                    />
                  )}
                  {summary.autresPonctuels > 0 && (
                    <CategoryAccordion
                      label="Autres"
                      total={summary.autresPonctuels}
                      muted
                      lines={grouped.autresPonctuels}
                      expanded={expandedCats.has('autres_p')}
                      onToggle={() => toggleCat('autres_p')}
                    />
                  )}
                  <div className="pt-1 border-t border-gray-100">
                    <Line label="Total ponctuel" value={summary.totalPonctuel} bold />
                  </div>
                </section>
              )}

              {/* Loyer */}
              {summary.loyer && (
                <section className="space-y-1 rounded-lg bg-blue-50 border border-blue-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleCat('loyer_detail')}
                    className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-blue-600 hover:opacity-80"
                  >
                    <span className="flex items-center gap-1">
                      {expandedCats.has('loyer_detail') ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      Loyer ({summary.loyer.duree_mois} mois)
                    </span>
                  </button>
                  {expandedCats.has('loyer_detail') && (
                    <div className="space-y-0.5 pt-1 border-t border-blue-100">
                      <Line label="Total ponctuel" value={summary.totalPonctuel} muted />
                      {summary.remiseMoisOffert > 0 && (
                        <Line label="Remise mois offert" value={summary.remiseMoisOffert} muted />
                      )}
                      {summary.indemnites > 0 && (
                        <Line label="Indemnités" value={summary.indemnites} muted />
                      )}
                      {summary.marge > 0 && <Line label="Marge" value={summary.marge} muted />}
                      <Line label="Base loyer" value={summary.baseLoyer} bold />
                    </div>
                  )}
                  <Line label="Mensuel" value={summary.loyer.loyer_mensuel} suffix="/mois" bold />
                  <Line
                    label="Trimestriel"
                    value={summary.loyer.loyer_trimestriel}
                    suffix="/trim"
                    muted
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
