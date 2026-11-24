'use client';

import { useMemo, useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { Shield, ChevronDown, ChevronUp, AlertTriangle, X, Calculator, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type {
  SpConfigResiliation,
  SpQuestion,
  SpQuestionReponse,
  SpLibellesConfig,
} from '@/types';
import { estimateResiliationFromSA } from '@/lib/sp/resiliation';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import {
  addMonthsIso,
  calculerIndemniteEngagements,
  computeEngagementEnd,
  computeMoisRestants,
  DUREE_ENGAGEMENT_DEFAUT_MOIS,
} from '@/lib/sp/indemnite-calculette';
import { resolveWidgetLibelle } from '@/lib/sp/libelles';
import { DraggablePanel } from '@/components/ui/DraggablePanel';

interface SpIndemniteWidgetProps {
  spLibelles?: SpLibellesConfig;
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  donneesExtraites?: Record<string, unknown>;
  spConfigResiliation?: SpConfigResiliation;
  referenceDate?: string;
  onUpdateReponses: (nextReponses: SpQuestionReponse[]) => void;
  /**
   * Mode intégré (mode direct) : le widget est affiché dans le flux de la page
   * au lieu d'être flottant, et ne duplique pas le champ montant — celui de la
   * page fait foi. Le montant courant et son écriture passent par les props
   * ci-dessous.
   */
  inline?: boolean;
  montantActuel?: number;
  onMontantChange?: (montant: number) => void;
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

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatIsoFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

interface CalcEngagement {
  id: string;
  libelle: string;
  mensuel: string;
  dateDebut: string;
  duree: string;
  /** Date de fin saisie à la main ou issue de la SA ; prioritaire sur début + durée. */
  dateFinManuelle: string;
  fromSa: boolean;
}

interface CalcFrais {
  fraisFixes: string;
  penalites: string;
  fraisMateriel: string;
  servicesAnnexes: string;
}

interface CalcDefaults {
  refIso: string;
  preavis: string;
  engagements: CalcEngagement[];
  frais: CalcFrais;
}

let engagementSeq = 0;
function newEngagementId(): string {
  engagementSeq += 1;
  return `eng_${engagementSeq}`;
}

function emptyEngagement(): CalcEngagement {
  return {
    id: newEngagementId(),
    libelle: 'Engagement',
    mensuel: '',
    dateDebut: '',
    duree: String(DUREE_ENGAGEMENT_DEFAUT_MOIS),
    dateFinManuelle: '',
    fromSa: false,
  };
}

function engagementDateFin(e: CalcEngagement): string {
  if (e.dateFinManuelle) return e.dateFinManuelle;
  return e.dateDebut ? computeEngagementEnd(e.dateDebut, parseNum(e.duree)) ?? '' : '';
}

/** Petit badge indiquant si une valeur vient de la SA ou a été modifiée à la main. */
function SourceBadge({ current, original }: { current: string; original: string }) {
  if (!original) return null;
  const same = parseNum(current) === parseNum(original) && current !== '';
  return (
    <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-medium ${same ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
      {same ? 'SA' : 'modifié'}
    </span>
  );
}

function CalcField({ id, label, badge, children }: { id: string; label: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center text-xs text-gray-500">
        {label}
        {badge}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLASS = 'h-8 w-full text-sm border border-gray-300 rounded px-2 focus:outline-none focus:ring-1 focus:ring-orange-400';

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toDateInputValue(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const fr = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** Date de fin d'engagement la plus tardive trouvée dans la SA (format input date). */function findLatestEngagementEnd(donneesExtraites?: Record<string, unknown>): string | null {
  const root = donneesExtraites?.situation_actuelle ?? donneesExtraites;
  const engagements = (root as { engagements?: unknown } | undefined)?.engagements;
  if (!Array.isArray(engagements)) return null;
  let latest: string | null = null;
  for (const e of engagements) {
    if (!e || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    const d = toDateInputValue(rec.date_fin_engagement_source ?? rec.date_fin_engagement ?? rec.fin_engagement);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

function formatInputNumber(value: number | null | undefined): string {
  return value != null && value > 0 ? String(value) : '';
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
  spLibelles,
  reponses,
  questions,
  donneesExtraites,
  spConfigResiliation,
  referenceDate,
  onUpdateReponses,
  inline = false,
  montantActuel,
  onMontantChange,
  gardeFouActif,
  gardeFouVisible,
}: SpIndemniteWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevVisible = useRef(false);
  const calcTouched = useRef(false);
  const uid = useId();

  const [calcPreavis, setCalcPreavis] = useState('3');
  const [calcEngagements, setCalcEngagements] = useState<CalcEngagement[]>(() => [emptyEngagement()]);
  const [calcFrais, setCalcFrais] = useState<CalcFrais>({
    fraisFixes: '', penalites: '', fraisMateriel: '', servicesAnnexes: '',
  });

  useEffect(() => {
    if (gardeFouVisible && !prevVisible.current) {
      const resetTimer = window.setTimeout(() => setDismissed(false), 0);
      prevVisible.current = true;
      return () => window.clearTimeout(resetTimer);
    }
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
    return estimateResiliationFromSA(
      donneesExtraites?.situation_actuelle
        ? donneesExtraites
        : { situation_actuelle: donneesExtraites },
      spConfigResiliation,
      referenceDate,
    );
  }, [donneesExtraites, spConfigResiliation, referenceDate]);

  // Quand aucune question d'indemnité n'existe dans le template, on stocke la
  // valeur sous l'id synthétique `sp_total_indemnites`, repris par
  // `resolveIndemnites` (chemin #1).
  const targetQuestionId = indemQuestion?.id ?? 'sp_total_indemnites';

  const currentRep = reponses.find((r) => r.question_id === targetQuestionId);
  const currentMontantNum = montantActuel ?? (Number(currentRep?.valeur) || 0);
  const inputValue = currentMontantNum > 0 ? String(currentMontantNum) : '';

  const handleChange = (value: string) => {
    const num = Number(value) || 0;
    if (onMontantChange) {
      onMontantChange(num);
      return;
    }
    const filtered = reponses.filter((r) => r.question_id !== targetQuestionId);
    onUpdateReponses([...filtered, { question_id: targetQuestionId, valeur: String(num) }]);
  };

  const groupedCalculation = estimation ? hasGroupedResiliationCalculation(estimation) : false;
  const groupedCount = estimation ? estimation.groupes_calcul.filter((g) => g.sous_total !== null).length : 0;

  const showGardeFou = gardeFouActif && gardeFouVisible && !dismissed;

  // Valeurs issues de la SA : sert au préremplissage, au badge « SA / modifié »
  // et au bouton « Réinitialiser ». Recalculé quand la SA change.
  const saDefaults = useMemo<CalcDefaults>(() => {
    const refIso = toDateInputValue(estimation?.date_reference) ?? toDateInputValue(referenceDate) ?? todayIso();
    const root = donneesExtraites?.situation_actuelle ? donneesExtraites : { situation_actuelle: donneesExtraites };

    const groupes = (estimation?.groupes_calcul ?? []).filter((g) => g.sous_total !== null);
    let engagements: CalcEngagement[] = groupes.map((g) => ({
      id: newEngagementId(),
      libelle: g.libelle,
      mensuel: formatInputNumber(g.base_mensuelle),
      dateDebut: '',
      duree: String(DUREE_ENGAGEMENT_DEFAUT_MOIS),
      dateFinManuelle: g.mois_avant_preavis != null ? addMonthsIso(refIso, g.mois_avant_preavis) ?? '' : '',
      fromSa: true,
    }));
    if (engagements.length === 0) {
      const totalSa = calculateSaCartSummary(root).totalMensuel;
      const dateFin = findLatestEngagementEnd(donneesExtraites) ?? '';
      engagements = [{
        ...emptyEngagement(),
        mensuel: formatInputNumber(totalSa),
        dateFinManuelle: dateFin,
        fromSa: Boolean(totalSa || dateFin),
      }];
    }
    return {
      refIso,
      preavis: String(estimation?.preavis_mois ?? 3),
      engagements,
      frais: {
        fraisFixes: formatInputNumber(estimation?.frais_resiliation_fixes),
        penalites: formatInputNumber(estimation?.penalites),
        fraisMateriel: formatInputNumber(estimation?.frais_materiel),
        servicesAnnexes: formatInputNumber(estimation?.services_annexes),
      },
    };
  }, [donneesExtraites, estimation, referenceDate]);

  const applyDefaults = () => {
    calcTouched.current = false;
    setCalcPreavis(saDefaults.preavis);
    setCalcEngagements(saDefaults.engagements.map((e) => ({ ...e, id: newEngagementId() })));
    setCalcFrais(saDefaults.frais);
  };

  // À l'ouverture, on repréremplit depuis la SA tant que l'utilisateur n'a rien
  // modifié (évite une calculette périmée si la SA a changé entre-temps).
  const openCalculator = () => {
    if (!calcTouched.current) applyDefaults();
    setShowCalculator(true);
  };

  const touch = () => {
    calcTouched.current = true;
  };
  const updateEngagement = (id: string, patch: Partial<CalcEngagement>) => {
    touch();
    setCalcEngagements((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const updateFrais = (patch: Partial<CalcFrais>) => {
    touch();
    setCalcFrais((prev) => ({ ...prev, ...patch }));
  };

  const calcRefIso = saDefaults.refIso;
  const calcPreavisNum = parseNum(calcPreavis);
  const calcDetailEngagements = calcEngagements.map((e) => {
    const dateFin = engagementDateFin(e);
    const mois = dateFin ? computeMoisRestants(calcRefIso, dateFin, calcPreavisNum) : null;
    return { e, dateFin, mois };
  });
  const { lignes: calcLignes, total: calcTotal } = calculerIndemniteEngagements(
    calcDetailEngagements.map(({ e, mois }) => ({
      libelle: e.libelle || 'Engagement',
      mensuel: parseNum(e.mensuel),
      moisRestants: mois ? mois.moisRestants : null,
    })),
    {
      fraisFixes: parseNum(calcFrais.fraisFixes),
      penalites: parseNum(calcFrais.penalites),
      fraisMateriel: parseNum(calcFrais.fraisMateriel),
      servicesAnnexes: parseNum(calcFrais.servicesAnnexes),
    },
  );

  const currentIndemniteNum = currentMontantNum;
  const remplaceExistant = currentIndemniteNum > 0 && Math.abs(currentIndemniteNum - calcTotal) >= 0.005;
  const ecartEstimation = estimation?.montant_retenu != null ? calcTotal - estimation.montant_retenu : null;
  const fraisOuverts = Object.values(calcFrais).some((v) => parseNum(v) !== 0);

  const handleReporterMontant = () => {
    handleChange(calcTotal.toFixed(2));
    setShowCalculator(false);
  };

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

      {inline ? (
        <button
          type="button"
          onClick={openCalculator}
          title="Calculette indemnité de résiliation"
          aria-label="Calculette indemnité de résiliation"
          className="flex items-center justify-center h-8 w-8 rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <Calculator className="h-4 w-4" />
        </button>
      ) : (<div className={`relative rounded-xl border bg-white w-72 max-w-[calc(100vw-2rem)] shadow-xl ${showGardeFou ? 'gf-i-widget border-orange-400' : 'border-gray-200'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-white hover:from-amber-600 hover:to-orange-600 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" />
            {resolveWidgetLibelle(spLibelles, 'indemnite')}
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
                Pensez à renseigner l&apos;indemnité de résiliation avant de continuer.
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

            {/* Champ montant (absent en mode intégré : le champ de la page fait foi) */}
            {!inline && <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Montant :</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputValue}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={estimation?.montant_retenu != null ? String(Math.round(estimation.montant_retenu)) : '0'}
                className="h-8 w-24 text-sm border border-gray-300 rounded px-2"
              />
              <span className="text-xs text-gray-500">€</span>
            </div>}

            {/* Lien détail + calculette */}
            <div className="flex items-center justify-between gap-2">
              {estimation ? (
                <button
                  type="button"
                  onClick={() => setShowDetail(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  Plus de détail →
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={openCalculator}
                title="Calculette indemnité de résiliation"
                aria-label="Calculette indemnité de résiliation"
                className="shrink-0 flex items-center justify-center h-6 w-6 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Calculator className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>)}

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

      {/* Popup calculette déplaçable */}
      <DraggablePanel
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        title="Calculette — Indemnité de résiliation"
        defaultWidth={440}
        defaultHeight={620}
        footer={
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-amber-700">Total calculé</p>
                <p className="text-xl font-semibold tabular-nums text-amber-950">{calcTotal.toFixed(2)} €</p>
                {ecartEstimation !== null && estimation?.montant_retenu != null && (
                  <p className="text-[11px] text-gray-500">
                    Estimation SA : {estimation.montant_retenu.toFixed(2)} € ({ecartEstimation >= 0 ? '+' : '−'}
                    {Math.abs(ecartEstimation).toFixed(2)} €)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleReporterMontant}
                className="shrink-0 px-3 py-2 rounded-md bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 active:bg-orange-700 transition-colors"
              >
                Reporter le montant
              </button>
            </div>
            {remplaceExistant && (
              <p className="text-[11px] text-orange-700">
                Remplacera le montant déjà saisi ({currentIndemniteNum.toFixed(2)} €).
              </p>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-gray-500">
              Calcul au {formatIsoFr(calcRefIso)} · mois complets · préavis déduit.
            </p>
            <button
              type="button"
              onClick={applyDefaults}
              className="shrink-0 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Réinitialiser depuis la SA
            </button>
          </div>

          <CalcField id={`${uid}-preavis`} label="Préavis (mois)" badge={<SourceBadge current={calcPreavis} original={saDefaults.preavis} />}>
            <input
              id={`${uid}-preavis`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={calcPreavis}
              onChange={(e) => {
                touch();
                setCalcPreavis(e.target.value);
              }}
              className={INPUT_CLASS}
            />
          </CalcField>

          {calcDetailEngagements.map(({ e, dateFin, mois }, index) => {
            const original = saDefaults.engagements.find((d) => d.libelle === e.libelle);
            const finDeduite = !e.dateFinManuelle && dateFin;
            return (
              <div key={e.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  {calcEngagements.length > 1 ? (
                    <input
                      aria-label={`Libellé de l'engagement ${index + 1}`}
                      value={e.libelle}
                      onChange={(ev) => updateEngagement(e.id, { libelle: ev.target.value })}
                      className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-gray-800 hover:border-gray-300 focus:border-gray-300 focus:bg-white focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs font-semibold text-gray-800">Engagement</p>
                  )}
                  {calcEngagements.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        touch();
                        setCalcEngagements((prev) => prev.filter((x) => x.id !== e.id));
                      }}
                      className="shrink-0 text-gray-400 hover:text-red-600"
                      aria-label={`Supprimer l'engagement ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <CalcField
                  id={`${uid}-${e.id}-mensuel`}
                  label="Montant mensuel (€)"
                  badge={<SourceBadge current={e.mensuel} original={original?.mensuel ?? ''} />}
                >
                  <input
                    id={`${uid}-${e.id}-mensuel`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={e.mensuel}
                    onChange={(ev) => updateEngagement(e.id, { mensuel: ev.target.value })}
                    className={INPUT_CLASS}
                  />
                </CalcField>

                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <CalcField id={`${uid}-${e.id}-debut`} label="Début d'engagement (signature)">
                    <input
                      id={`${uid}-${e.id}-debut`}
                      type="date"
                      value={e.dateDebut}
                      onChange={(ev) => updateEngagement(e.id, { dateDebut: ev.target.value, dateFinManuelle: '' })}
                      className={INPUT_CLASS}
                    />
                  </CalcField>
                  <CalcField id={`${uid}-${e.id}-duree`} label="Durée (mois)">
                    <input
                      id={`${uid}-${e.id}-duree`}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={e.duree}
                      onChange={(ev) => updateEngagement(e.id, { duree: ev.target.value, dateFinManuelle: '' })}
                      className={INPUT_CLASS}
                    />
                  </CalcField>
                </div>

                <CalcField
                  id={`${uid}-${e.id}-fin`}
                  label="Fin d'engagement"
                  badge={
                    finDeduite ? (
                      <span className="ml-1.5 rounded bg-gray-100 px-1 py-px text-[10px] font-medium text-gray-600">
                        début + {parseNum(e.duree)} mois
                      </span>
                    ) : e.dateFinManuelle ? (
                      <span className={`ml-1.5 rounded px-1 py-px text-[10px] font-medium ${e.fromSa && e.dateFinManuelle === original?.dateFinManuelle ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {e.fromSa && e.dateFinManuelle === original?.dateFinManuelle ? 'SA' : 'saisie'}
                      </span>
                    ) : null
                  }
                >
                  <input
                    id={`${uid}-${e.id}-fin`}
                    type="date"
                    value={dateFin}
                    onChange={(ev) => updateEngagement(e.id, { dateFinManuelle: ev.target.value })}
                    className={INPUT_CLASS}
                  />
                </CalcField>

                {mois ? (
                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      mois.depasse || mois.preavisCouvreTout
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-orange-200 bg-orange-50 text-orange-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Mois restants après préavis</span>
                      <span className="text-base font-bold tabular-nums">{mois.moisRestants} mois</span>
                    </div>
                    <p className="mt-0.5 text-orange-800">
                      {Math.max(0, mois.moisAvantPreavis)} mois jusqu&apos;à la fin − {calcPreavisNum} mois de préavis
                    </p>
                    {mois.depasse && (
                      <p className="mt-1 flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        La date de fin est dépassée : aucune mensualité n&apos;est due.
                      </p>
                    )}
                    {mois.preavisCouvreTout && (
                      <p className="mt-1 flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Le préavis couvre toute la période restante : aucune mensualité due.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Renseignez la date de début (la durée par défaut est de {DUREE_ENGAGEMENT_DEFAUT_MOIS} mois) ou directement la fin d&apos;engagement.
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              touch();
              setCalcEngagements((prev) => [...prev, { ...emptyEngagement(), libelle: `Engagement ${prev.length + 1}` }]);
            }}
            className="flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un engagement
          </button>

          <details open={fraisOuverts} className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-gray-700">Frais additionnels</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {([
                ['fraisFixes', 'Frais fixes (€)'],
                ['penalites', 'Pénalités (€)'],
                ['fraisMateriel', 'Frais matériel (€)'],
                ['servicesAnnexes', 'Services annexes (€)'],
              ] as const).map(([key, label]) => (
                <CalcField
                  key={key}
                  id={`${uid}-${key}`}
                  label={label}
                  badge={<SourceBadge current={calcFrais[key]} original={saDefaults.frais[key]} />}
                >
                  <input
                    id={`${uid}-${key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={calcFrais[key]}
                    onChange={(ev) => updateFrais({ [key]: ev.target.value })}
                    className={INPUT_CLASS}
                  />
                </CalcField>
              ))}
            </div>
          </details>

          <div className="space-y-2" aria-label="Détail du calcul">
            <p className="text-xs font-semibold text-gray-800">Détail du calcul</p>
            {calcLignes.length > 0 ? (
              <div className="space-y-2 text-xs text-gray-700">
                {calcLignes.map((ligne, index) => (
                  <div key={`${ligne.libelle}-${index}`} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block">{index > 0 ? '+ ' : ''}{ligne.libelle}</span>
                      {ligne.calcul && <span className="block text-gray-500">{ligne.calcul} =</span>}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-gray-900">
                      {ligne.montant.toFixed(2)} €
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Renseignez les dates et les montants pour voir le calcul.</p>
            )}
          </div>
        </div>
      </DraggablePanel>
    </>
  );
}
