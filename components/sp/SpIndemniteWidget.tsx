'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Shield, ChevronDown, ChevronUp, AlertTriangle, X } from 'lucide-react';
import type {
  SpConfigResiliation,
  SpQuestion,
  SpQuestionReponse,
} from '@/types';
import { estimateResiliationFromSA } from '@/lib/sp/resiliation';
import { DraggablePanel } from '@/components/ui/DraggablePanel';

interface SpIndemniteWidgetProps {
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  donneesExtraites?: Record<string, unknown>;
  spConfigResiliation?: SpConfigResiliation;
  onUpdateReponses: (nextReponses: SpQuestionReponse[]) => void;
  gardeFouActif?: boolean;
  gardeFouVisible?: boolean;
}

function formatResiliationMoney(value: number | null | undefined): string {
  if (value == null) return 'Non trouvé';
  return `${value.toFixed(2)} EUR`;
}

function hasGroupedResiliationCalculation(estimation: {
  groupes_calcul: Array<{ sous_total: number | null }>;
}): boolean {
  return estimation.groupes_calcul.some((group) => group.sous_total !== null);
}

function formatResiliationRemainingMonths(
  moisRestants: number | null | undefined,
  moisAvantPreavis: number | null | undefined,
  preavisMois: number,
): string | null {
  if (moisRestants == null) return null;
  if (moisAvantPreavis != null) {
    return `${moisRestants} mois restants (${moisAvantPreavis} - ${preavisMois} de préavis)`;
  }
  return `${moisRestants} mois restants`;
}

function getResiliationFiabiliteClasses(fiabilite: string): string {
  switch (fiabilite) {
    case 'forte':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'moyenne':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'faible':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

export function SpIndemniteWidget({
  reponses,
  questions,
  donneesExtraites,
  spConfigResiliation,
  onUpdateReponses,
  gardeFouActif,
  gardeFouVisible,
}: SpIndemniteWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevVisible = useRef(false);

  useEffect(() => {
    if (gardeFouVisible && !prevVisible.current) setDismissed(false);
    prevVisible.current = gardeFouVisible ?? false;
  }, [gardeFouVisible]);

  const indemQuestion = useMemo(
    () =>
      questions.find(
        (q) =>
          q.affichage === 'nombre' &&
          q.nombre_config?.suggestion_source === 'indemnite_resiliation',
      ),
    [questions],
  );

  const estimation = useMemo(() => {
    if (!indemQuestion) return null;
    return estimateResiliationFromSA(
      donneesExtraites?.situation_actuelle
        ? donneesExtraites
        : { situation_actuelle: donneesExtraites },
      spConfigResiliation,
    );
  }, [indemQuestion, donneesExtraites, spConfigResiliation]);

  if (!indemQuestion) return null;

  const currentRep = reponses.find((r) => r.question_id === indemQuestion.id);
  const inputValue = currentRep ? (Number(currentRep.valeur) > 0 ? String(Number(currentRep.valeur)) : '') : '';

  const handleChange = (value: string) => {
    const num = Number(value) || 0;
    const filtered = reponses.filter((r) => r.question_id !== indemQuestion.id);
    onUpdateReponses([...filtered, { question_id: indemQuestion.id, valeur: String(num) }]);
  };

  const groupedCalculation = estimation ? hasGroupedResiliationCalculation(estimation) : false;
  const groupedCount = estimation ? estimation.groupes_calcul.filter((g) => g.sous_total !== null).length : 0;

  const showGardeFou = gardeFouActif && gardeFouVisible && !dismissed;

  return (
    <>
      {showGardeFou && (
        <style>{`
          @keyframes gf-i-glow {
            0%, 100% { box-shadow: 0 0 0 3px #f97316, 0 0 18px 6px rgba(249,115,22,0.55); }
            50%       { box-shadow: 0 0 0 5px #dc2626, 0 0 32px 12px rgba(220,38,38,0.35); }
          }
          @keyframes gf-i-blink {
            0%, 49% { background: #f97316; }
            50%, 100% { background: #dc2626; }
          }
          @keyframes gf-i-shake {
            0%,100% { transform: translateX(0); }
            15%     { transform: translateX(-4px); }
            30%     { transform: translateX(4px); }
            45%     { transform: translateX(-3px); }
            60%     { transform: translateX(3px); }
            75%     { transform: translateX(-1px); }
          }
          .gf-i-widget { animation: gf-i-glow 1s ease-in-out infinite, gf-i-shake 2.5s ease-in-out infinite; }
          .gf-i-header { animation: gf-i-blink 0.6s step-start infinite; }
          .gf-i-icon   { animation: bounce 0.4s ease-in-out infinite alternate; }
        `}</style>
      )}

      <div className={`relative w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-white shadow-xl ${showGardeFou ? 'gf-i-widget border-orange-400' : 'border-gray-200'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-white hover:from-amber-600 hover:to-orange-600 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" />
            Indemnité rés.
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showGardeFou && (
          <div className="absolute inset-0 z-10 flex flex-col rounded-xl overflow-hidden">
            <div className="gf-i-header flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                <AlertTriangle className="gf-i-icon w-4 h-4" />
                Indemnité non saisie
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
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-amber-50 px-4 py-4">
              <p className="text-[11px] text-amber-800 text-center leading-snug">
                Pensez à renseigner l'indemnité de résiliation avant de continuer.
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
            {/* Montant suggéré */}
            {estimation && estimation.montant_retenu !== null ? (
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-amber-950">
                    {estimation.montant_retenu.toFixed(2)} €
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${getResiliationFiabiliteClasses(estimation.fiabilite)}`}>
                    Fiabilité {estimation.fiabilite}
                  </span>
                </div>
                <p className="text-[11px] text-amber-700">{estimation.calcul_resume}</p>
              </div>
            ) : estimation ? (
              <p className="text-xs text-gray-500">Aucune estimation disponible depuis la SA.</p>
            ) : null}

            {/* Champ montant */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Montant :</label>
              <input
                type="number"
                min="0"
                step="1"
                value={inputValue}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={estimation?.montant_retenu != null ? String(Math.round(estimation.montant_retenu)) : '0'}
                className="h-8 w-24 text-sm border border-gray-300 rounded px-2"
              />
              <span className="text-xs text-gray-500">€</span>
            </div>

            {/* Lien détail */}
            {estimation && (
              <button
                type="button"
                onClick={() => setShowDetail(true)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                Plus de détail →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Popup détail déplaçable */}
      <DraggablePanel
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title="Détail du calcul — Indemnité de résiliation"
        defaultWidth={580}
        defaultHeight={520}
      >
        {estimation && (
          <div className="space-y-4">
            {/* Décomposition */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700">Décomposition du montant</p>
              <div className="mt-2 space-y-2">
                {estimation.composants
                  .filter((c) => c.inclus)
                  .map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">{c.label}</p>
                        {c.formule && <p className="text-gray-500 mt-0.5">{c.formule}</p>}
                        {!c.disponible && c.id !== 'total' && (
                          <p className="text-gray-400 mt-0.5">Non trouvé dans la SA</p>
                        )}
                      </div>
                      <span className="shrink-0 font-medium text-gray-800">
                        {formatResiliationMoney(c.montant)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Hypothèses */}
            {estimation.hypotheses.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">Hypothèses retenues</p>
                <div className="mt-2 grid gap-2 grid-cols-2">
                  {estimation.hypotheses.map((h) => (
                    <div key={`${h.label}-${h.valeur}`} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{h.label}</p>
                      <p className="text-xs text-gray-800 mt-1">{h.valeur}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Groupes de calcul */}
            {estimation.groupes_calcul.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">Groupes de calcul</p>
                {groupedCalculation && (
                  <p className="text-xs text-gray-500 mt-1">
                    Chaque groupe applique sa propre mensualité SA et ses propres mois restants, puis les sous-totaux sont additionnés.
                  </p>
                )}
                {groupedCalculation && groupedCount > 0 && (
                  <p className="text-xs text-amber-800 mt-1">
                    Calcul retenu : somme de {groupedCount} groupe{groupedCount > 1 ? 's' : ''} engagé{groupedCount > 1 ? 's' : ''}.
                  </p>
                )}
                <div className="mt-2 space-y-3">
                  {estimation.groupes_calcul.map((groupe) => {
                    const groupRemainingMonthsLabel = formatResiliationRemainingMonths(
                      groupe.mois_restants,
                      groupe.mois_avant_preavis,
                      estimation.preavis_mois,
                    );
                    return (
                      <div key={groupe.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800">{groupe.libelle}</p>
                            <p className="text-xs text-gray-500 mt-1">{groupe.methode}</p>
                          </div>
                          {groupe.sous_total !== null && (
                            <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">
                              {formatResiliationMoney(groupe.sous_total)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
                          {groupRemainingMonthsLabel && (
                            <span className="rounded-full border border-gray-200 bg-white px-2 py-1">
                              {groupRemainingMonthsLabel}
                            </span>
                          )}
                          {groupe.base_mensuelle !== null && (
                            <span className="rounded-full border border-gray-200 bg-white px-2 py-1">
                              Base {formatResiliationMoney(groupe.base_mensuelle)} / mois
                            </span>
                          )}
                        </div>
                        {groupe.preuves.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {groupe.preuves.map((preuve) => (
                              <div key={preuve.id} className="rounded-md border border-white bg-white px-3 py-2">
                                <p className="text-xs font-medium text-gray-800">{preuve.label}</p>
                                <p className="text-xs text-gray-700 mt-1">{preuve.valeur}</p>
                                {preuve.contexte && (
                                  <p className="text-[11px] text-gray-500 mt-1">{preuve.contexte}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preuves SA */}
            {estimation.preuves.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">Preuves trouvées dans la SA</p>
                <div className="mt-2 grid gap-2 grid-cols-2">
                  {estimation.preuves.map((preuve) => (
                    <div key={preuve.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-800">{preuve.label}</p>
                      <p className="text-xs text-gray-700 mt-1">{preuve.valeur}</p>
                      {preuve.contexte && (
                        <p className="text-[11px] text-gray-500 mt-1">{preuve.contexte}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Informations manquantes */}
            {estimation.motifs_manquants.length > 0 && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700">Informations manquantes</p>
                <ul className="text-xs text-red-700 mt-2 space-y-1">
                  {estimation.motifs_manquants.map((detail) => (
                    <li key={detail}>- {detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DraggablePanel>
    </>
  );
}
