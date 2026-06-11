'use client';

import { useState, useMemo, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import type {
  CatalogueProduit,
  SpConfigLoyer,
  SpConfigMoisOfferts,
  SpQuestion,
  SpQuestionReponse,
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
  onUpdateReponses: (nextReponses: SpQuestionReponse[]) => void;
}

export function SpMargeWidget({
  reponses,
  questions,
  catalogue,
  donneesExtraites,
  spConfigLoyer,
  spConfigMoisOfferts,
  onUpdateReponses,
}: SpMargeWidgetProps) {
  const currentMargeRep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
  const currentMarge = currentMargeRep ? Number(currentMargeRep.valeur) || 0 : 0;
  const [margeInput, setMargeInput] = useState<string>(currentMarge > 0 ? String(currentMarge) : '');

  // Sync local input when reponses change from outside (e.g. question marge validated)
  useEffect(() => {
    const rep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
    const val = rep ? Number(rep.valeur) || 0 : 0;
    setMargeInput(val > 0 ? String(val) : '');
  }, [reponses]);

  // Helper: resolve contract duration
  const resolveDureeMois = (): number => {
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
  };

  // Helper: compute loyer for a given marge value
  const computeLoyer = (margeValue: string) => {
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
    );
    const baseLoyer = summary.totalPonctuel + summary.remiseMoisOffert + summary.indemnites + margeNum;
    const loyer = bareme ? calculerLoyer(bareme, baseLoyer, dureeMois) : null;
    return { loyer, dureeMois, baseLoyer, margeNum };
  };

  const loyerResult = useMemo(
    () => computeLoyer(margeInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [margeInput, computeLoyer],
  );

  const handleMargeChange = (value: string) => {
    setMargeInput(value);

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

  return (
    <div className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 rounded-t-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-white">
        <TrendingUp className="h-4 w-4" />
        <span className="text-sm font-semibold">Marge &amp; Loyer</span>
      </div>

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
    </div>
  );
}
