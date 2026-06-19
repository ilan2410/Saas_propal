'use client';

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, AlertTriangle, X } from 'lucide-react';
import type {
  CatalogueProduit,
  SpConfigLoyer,
  SpConfigMoisOfferts,
  SpQuestion,
  SpQuestionReponse,
  SpPreferencesProduits,
} from '@/types';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
import { findApplicableBareme } from '@/lib/sp/evaluateBareme';
import { calculerLoyer, DEFAULT_CONFIG_LOYER } from '@/lib/sp/calculLoyer';

interface SpMargeWidgetProps {
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  catalogue: CatalogueProduit[];
  donneesExtraites?: Record<string, unknown>;
  spConfigLoyer?: SpConfigLoyer;
  spConfigMoisOfferts?: SpConfigMoisOfferts;
  spPreferencesProduits?: SpPreferencesProduits;
  onUpdateReponses: (nextReponses: SpQuestionReponse[]) => void;
  gardeFouActif?: boolean;
  gardeFouVisible?: boolean;
}

export function SpMargeWidget({
  reponses,
  questions,
  catalogue,
  donneesExtraites,
  spConfigLoyer,
  spConfigMoisOfferts,
  spPreferencesProduits,
  onUpdateReponses,
  gardeFouActif,
  gardeFouVisible,
}: SpMargeWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevVisible = useRef(false);

  useEffect(() => {
    if (gardeFouVisible && !prevVisible.current) setDismissed(false);
    prevVisible.current = gardeFouVisible ?? false;
  }, [gardeFouVisible]);

  // Derive input value directly from reponses (fully controlled)
  const margeInput = (() => {
    const rep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
    const val = rep ? Number(rep.valeur) || 0 : 0;
    return rep ? String(val) : '';
  })();

  // Helper: resolve contract duration
  const resolveDureeMois = useCallback((): number => {
    let dureeMois = spConfigLoyer?.duree_mois_par_defaut ?? 63;
    if (spConfigLoyer?.duree_depends_question && spConfigLoyer.duree_question_id) {
      const targetId = spConfigLoyer.duree_question_id;
      const dureeRep = reponses.find(
        (r) => r.question_id === targetId || r.question_id.startsWith(`${targetId}__iter_`),
      );
      if (dureeRep) {
        const raw = Array.isArray(dureeRep.valeur) ? dureeRep.valeur[0] : dureeRep.valeur;
        const match = String(raw ?? '').match(/-?\d+(?:[.,]\d+)?/);
        const v = match ? Number(match[0].replace(',', '.')) : NaN;
        if (Number.isFinite(v) && v > 0) dureeMois = v;
      }
    }
    return dureeMois;
  }, [spConfigLoyer, reponses]);

  // Helper: compute loyer for a given marge value
  const computeLoyer = useCallback(
    (margeValue: string) => {
      const margeNum = Number(margeValue) || 0;
      const dureeMois = resolveDureeMois();
      const baremes = (spConfigLoyer ?? DEFAULT_CONFIG_LOYER).baremes;
      const bareme = findApplicableBareme(baremes, reponses, donneesExtraites ?? {}, catalogue);
      const reponsesSansMarge = reponses.filter((r) => r.question_id !== 'sp_marge_calculee');
      const summary = calculateCartSummary(
        reponsesSansMarge,
        questions,
        catalogue,
        donneesExtraites ?? {},
        spConfigLoyer,
        spConfigMoisOfferts,
        spPreferencesProduits,
      );
      const baseLoyer = summary.totalPonctuel + summary.remiseMoisOffert + summary.indemnites + margeNum;
      const loyer = bareme ? calculerLoyer(bareme, baseLoyer, dureeMois) : null;
      return { loyer, dureeMois, baseLoyer, margeNum };
    },
    [resolveDureeMois, spConfigLoyer, reponses, donneesExtraites, catalogue, questions, spConfigMoisOfferts, spPreferencesProduits],
  );

  const loyerResult = useMemo(() => computeLoyer(margeInput), [margeInput, computeLoyer]);

  const handleMargeChange = (value: string) => {
    const { loyer } = computeLoyer(value);
    const margeNum = Number(value) || 0;
    const extras: SpQuestionReponse[] = [
      { question_id: 'sp_marge_calculee', valeur: String(margeNum) },
    ];

    if (loyer) {
      extras.push({
        question_id: 'sp_loyer_mensuel_calculee',
        valeur: String(loyer.loyer_mensuel),
      });
      extras.push({
        question_id: 'sp_loyer_trimestriel_calculee',
        valeur: String(loyer.loyer_trimestriel),
      });
    }

    const filtered = reponses.filter(
      (r) =>
        r.question_id !== 'sp_marge_calculee' &&
        r.question_id !== 'sp_loyer_mensuel_calculee' &&
        r.question_id !== 'sp_loyer_trimestriel_calculee',
    );
    onUpdateReponses([...filtered, ...extras]);
  };

  const showGardeFou = gardeFouActif && gardeFouVisible && !dismissed;

  return (
    <>
      {showGardeFou && (
        <style>{`
          @keyframes gf-glow {
            0%, 100% { box-shadow: 0 0 0 3px #f97316, 0 0 18px 6px rgba(249,115,22,0.55); }
            50%       { box-shadow: 0 0 0 5px #dc2626, 0 0 32px 12px rgba(220,38,38,0.35); }
          }
          @keyframes gf-blink {
            0%, 49% { background: #f97316; }
            50%, 100% { background: #dc2626; }
          }
          @keyframes gf-shake {
            0%,100% { transform: translateX(0); }
            15%     { transform: translateX(-4px); }
            30%     { transform: translateX(4px); }
            45%     { transform: translateX(-3px); }
            60%     { transform: translateX(3px); }
            75%     { transform: translateX(-1px); }
          }
          .gf-widget { animation: gf-glow 1s ease-in-out infinite, gf-shake 2.5s ease-in-out infinite; }
          .gf-header { animation: gf-blink 0.6s step-start infinite; }
          .gf-icon   { animation: bounce 0.4s ease-in-out infinite alternate; }
        `}</style>
      )}

      <div className={`relative w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-white shadow-xl ${showGardeFou ? 'gf-widget border-orange-400' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-white hover:from-amber-600 hover:to-orange-600 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4" />
          Marge &amp; Loyer
        </span>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {showGardeFou && (
        <div className="absolute inset-0 z-10 flex flex-col rounded-xl overflow-hidden">
          {/* Header bar */}
          <div className="gf-header flex items-center justify-between px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <AlertTriangle className="gf-icon w-4 h-4" />
              Marge non saisie
            </span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Body */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-amber-50 px-4 py-4">
            <p className="text-[11px] text-amber-800 text-center leading-snug">
              Pensez à renseigner la marge avant de continuer.
            </p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="px-5 py-1.5 rounded-md bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 active:bg-orange-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-3 py-3 space-y-3">
          {/* Champ Marge */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 shrink-0">Marge :</label>
            <input
              type="number"
              min="0"
              step="1"
              value={margeInput}
              onChange={(e) => handleMargeChange(e.target.value)}
              placeholder="0"
              className="h-8 w-24 text-sm border border-gray-300 rounded px-2"
            />
            <span className="text-xs text-gray-500">€</span>
          </div>

          {/* Loyer mensuel HT */}
          {loyerResult.loyer ? (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Loyer mensuel HT</span>
                <span className="font-semibold text-blue-800">
                  {loyerResult.loyer.loyer_mensuel.toFixed(2)} €
                </span>
              </div>
              <span className="block text-[10px] text-gray-400">
                ({loyerResult.baseLoyer.toFixed(2)} × {(loyerResult.loyer.taux_utilise * 100).toFixed(2)}%) / 3
              </span>
              <div className="flex gap-3 text-xs text-gray-500 pt-1 border-t border-blue-100">
                <span>Durée : {loyerResult.dureeMois} mois</span>
                <span>Trim. : {loyerResult.loyer.trimestres}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-600">
              Aucun barème pour {loyerResult.dureeMois} mois.
            </p>
          )}
        </div>
      )}
    </div>
    </>
  );
}
