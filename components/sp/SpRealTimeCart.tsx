'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  CatalogueProduit,
  SpConfigLoyer,
  SpQuestion,
  SpQuestionReponse,
} from '@/types';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
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

export function SpRealTimeCart({
  reponses,
  questions,
  catalogue,
  donneesExtraites,
  spConfigLoyer,
}: SpRealTimeCartProps) {
  const [collapsed, setCollapsed] = useState(false);

  const summary = useMemo(
    () => calculateCartSummary(reponses, questions, catalogue, donneesExtraites ?? {}, spConfigLoyer),
    [reponses, questions, catalogue, donneesExtraites, spConfigLoyer],
  );

  const hasAnyLine = summary.lines.length > 0;
  const grandTotalMensuel = summary.abonnements.totalMensuel;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-xl"
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
          Panier
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
                <Line label="Fixe" value={summary.abonnements.fixe} suffix="/mois" />
                <Line label="Mobile" value={summary.abonnements.mobile} suffix="/mois" />
                <Line label="Internet" value={summary.abonnements.internet} suffix="/mois" />
                {summary.autresMensuels > 0 && (
                  <Line label="Autres" value={summary.autresMensuels} suffix="/mois" muted />
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
                summary.installations > 0 ||
                summary.fas > 0 ||
                summary.autresPonctuels > 0) && (
                <section className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Ponctuel
                  </p>
                  {summary.materiel > 0 && <Line label="Matériel" value={summary.materiel} />}
                  {summary.installations > 0 && (
                    <Line label="Installations" value={summary.installations} />
                  )}
                  {summary.fas > 0 && <Line label="FAS" value={summary.fas} />}
                  {summary.autresPonctuels > 0 && (
                    <Line label="Autres" value={summary.autresPonctuels} muted />
                  )}
                  <div className="pt-1 border-t border-gray-100">
                    <Line label="Total ponctuel" value={summary.totalPonctuel} bold />
                  </div>
                </section>
              )}

              {/* Loyer */}
              {summary.loyer && (
                <section className="space-y-1 rounded-lg bg-blue-50 border border-blue-100 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                    Loyer ({summary.loyer.duree_mois} mois)
                  </p>
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
