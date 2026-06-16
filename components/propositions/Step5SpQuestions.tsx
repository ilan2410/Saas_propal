'use client';

import { useState, useEffect } from 'react';
import { Loader2, Database, X, Play, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingModal } from '@/components/ui/floating-modal';
import type { PropositionData } from './PropositionWizard';
import type { SpQuestion, SpQuestionReponse, SpAdresse, SuggestionsSpCompletes, CatalogueProduit, OrganizationPreferences, SpConfigLoyer, SpConfigResiliation, SpConfigMoisOfferts, SpConfigResumeRef, SpConfigModeClient, WordConfig } from '@/types';
import { SpQuestionnaireUI } from '@/components/sp/SpQuestionnaireUI';
import { FloatingSaInspector } from '@/components/propositions/FloatingSaInspector';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
  // Multisite: label shown above the chat (e.g. "Site 1 sur 3 — Paris")
  siteLabel?: string;
  currentSiteName?: string;
  // Multisite: when provided, bypasses generer-suggestions and returns raw reponses
  onMultisiteComplete?: (reponses: SpQuestionReponse[]) => void;
}

type SiteActuelle = { nom: string; [key: string]: unknown };
type LigneActuelle = { site?: string; [key: string]: unknown };

function filterExtractedDataForSite(
  extractedData: Record<string, unknown>,
  siteNom?: string,
): Record<string, unknown> {
  if (!siteNom) return extractedData;

  const sa = extractedData.situation_actuelle as Record<string, unknown> | undefined;
  if (!sa) return extractedData;

  const sites = (sa.sites as SiteActuelle[] | undefined) ?? [];
  const filteredSite = sites.filter((site) => site.nom === siteNom);

  const filterBySite = (arr: unknown[]): unknown[] =>
    arr.filter((item) => {
      const line = item as LigneActuelle;
      return !line.site || line.site === siteNom;
    });

  return {
    ...extractedData,
    situation_actuelle: {
      ...sa,
      sites: filteredSite,
      lignes: filterBySite((sa.lignes as unknown[]) ?? []),
      abonnements: filterBySite((sa.abonnements as unknown[]) ?? []),
      locations: filterBySite((sa.locations as unknown[]) ?? []),
      engagements: filterBySite((sa.engagements as unknown[]) ?? []),
    },
  };
}

export function Step5SpQuestions({ propositionData, updatePropositionData, onNext, onPrev, siteLabel, currentSiteName, onMultisiteComplete }: Props) {
  const [questions, setQuestions] = useState<SpQuestion[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [preferences, setPreferences] = useState<OrganizationPreferences>({});
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [spConfigLoyer, setSpConfigLoyer] = useState<SpConfigLoyer | undefined>(undefined);
  const [spConfigResiliation, setSpConfigResiliation] = useState<SpConfigResiliation | undefined>(undefined);
  const [spConfigMoisOfferts, setSpConfigMoisOfferts] = useState<SpConfigMoisOfferts | undefined>(undefined);
  const [spConfigResumeRef, setSpConfigResumeRef] = useState<SpConfigResumeRef | undefined>(undefined);
  const [spConfigModeClient, setSpConfigModeClient] = useState<SpConfigModeClient | undefined>(undefined);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [generateError, setGenerateError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSaResume, setShowSaResume] = useState(false);
  const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(true);

  const templateId = propositionData.template_id;

  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch('/api/catalogue/fournisseurs').then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
      fetch('/api/settings/preferences').then((r) => r.json()),
      fetch(`/api/templates/${templateId}`).then((r) => r.json()),
    ]).then(([qData, fData, cData, pData, tData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setQuestions(qs);
      setFournisseurs(fData.fournisseurs ?? []);
      setCatalogue(cData.produits ?? []);
      setPreferences(pData.preferences ?? {});
      const fileCfg = tData.template?.file_config as WordConfig | undefined;
      if (fileCfg?.sp_config_loyer?.baremes) setSpConfigLoyer(fileCfg.sp_config_loyer);
      setSpConfigResiliation(fileCfg?.sp_config_resiliation ?? pData.preferences?.sp_config_resiliation);
      setSpConfigMoisOfferts(pData.preferences?.sp_config_mois_offerts);
      setSpConfigResumeRef(fileCfg?.sp_config_resume_ref);
      setSpConfigModeClient(fileCfg?.sp_config_mode_client);
      setLoadingQuestions(false);
    }).catch(() => setLoadingQuestions(false));
  }, [templateId]);

  useEffect(() => {
    setIsQuestionnaireOpen(true);
    setShowSaResume(false);
  }, [templateId, propositionData.proposition_id, siteLabel]);

  const handleComplete = async (reponses: SpQuestionReponse[]) => {
    // In multisite mode, bypass generer-suggestions — parent handles the clone flow
    if (onMultisiteComplete) {
      onMultisiteComplete(reponses);
      return;
    }

    setIsGenerating(true);
    setGenerateError('');
    updatePropositionData({ sp_reponses: reponses });

    try {
      const fournisseurRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && q.affichage === 'boutons_choix_unique' && q.source === 'catalogue')
      );
      const hasConsequenceTo = (qId: string, variable: string) =>
        questions.find((q) => q.id === qId && q.consequences?.some((c) => c.type === 'renseigner_variable' && c.variable_cible === variable));

      const adresseFactuRep = reponses.find((r) => hasConsequenceTo(r.question_id, 'sp_adresse_facturation'))
        ?? reponses.find((r) => questions.find((q) => q.id === r.question_id && q.affichage === 'adresse_complete'));
      const adresseLivraisonRep = reponses.find((r) => hasConsequenceTo(r.question_id, 'sp_adresse_livraison'));
      const livraisonIdentiqueRep = reponses.find((r) => hasConsequenceTo(r.question_id, 'sp_livraison_identique'));
      const materielRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && q.affichage === 'oui_non')
      );

      const fasTotal = reponses
        .filter((r) => r.question_id.startsWith('fas_'))
        .reduce((sum, r) => {
          const val = r.valeur;
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val);
              if (typeof parsed === 'object' && parsed !== null) {
                return sum + (Object.values(parsed) as string[]).reduce((s, v) => s + (parseFloat(String(v)) || 0), 0);
              }
            } catch { /* not JSON */ }
            return sum + (parseFloat(val) || 0);
          }
          return sum;
        }, 0);

      const body = {
        situation_actuelle: propositionData.donnees_extraites ?? {},
        catalogue,
        proposition_id: propositionData.proposition_id,
        force_regenerate: true,
        sp_questions_reponses: reponses,
        sp_fas_total: fasTotal,
        preferences: {
          fournisseur_prefere: fournisseurRep ? String(fournisseurRep.valeur) : undefined,
          proposer_materiel: materielRep ? (materielRep.valeur === true || materielRep.valeur === 'Oui') : false,
          adresse_facturation: adresseFactuRep?.valeur as SpAdresse | undefined,
          adresse_livraison: adresseLivraisonRep?.valeur as SpAdresse | undefined,
          livraison_identique: livraisonIdentiqueRep
            ? (livraisonIdentiqueRep.valeur === true || livraisonIdentiqueRep.valeur === 'Oui')
            : true,
        },
      };

      const res = await fetch('/api/propositions/generer-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erreur génération SP');
      }

      const data = await res.json() as SuggestionsSpCompletes;
      updatePropositionData({ suggestions_sp_completes: data });
      onNext();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loadingQuestions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
          <p className="text-gray-500 mt-1">Aucune question SP n&apos;est configurée pour ce template.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev}>Précédent</Button>
          <Button onClick={onNext}>Continuer sans SP</Button>
        </div>
      </div>
    );
  }

  const saResumeBase = (propositionData.donnees_extraites as Record<string, unknown> | undefined);
  const saResume = saResumeBase
    ? filterExtractedDataForSite(saResumeBase, currentSiteName)
    : undefined;
  const saResumeText = saResume
    ? ((saResume.resume as string) || (saResume['résumé'] as string) || '')
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
          <p className="text-gray-600 mt-1">Répondez aux questions pour paramétrer votre proposition dans une fenêtre dédiée.</p>
        </div>
        <Button
          type="button"
          onClick={() => setIsQuestionnaireOpen(true)}
          className="shrink-0 mt-1"
        >
          <Play className="w-4 h-4 mr-2" />
          Ouvrir le questionnaire
        </Button>
      </div>

      {generateError && (
        <div className="border border-red-200 rounded-lg bg-red-50 p-3">
          <p className="text-sm text-red-600">{generateError}</p>
        </div>
      )}

      {!isQuestionnaireOpen && (
        <div className="border border-dashed border-gray-300 rounded-xl bg-gray-50 px-5 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Le questionnaire SP s&apos;ouvre maintenant dans un modal.</p>
            <p className="text-sm text-gray-500 mt-1">
              {siteLabel
                ? `Vous pouvez rouvrir la fenêtre pour continuer le parcours de ${siteLabel}.`
                : 'Vous pouvez rouvrir la fenêtre à tout moment pour continuer le parcours.'}
            </p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onPrev}>
              Précédent
            </Button>
            <Button type="button" onClick={() => setIsQuestionnaireOpen(true)}>
              <Play className="w-4 h-4 mr-2" />
              Reprendre
            </Button>
          </div>
        </div>
      )}

      {isQuestionnaireOpen && (
        <>
          <FloatingModal
            defaultWidth={900}
            defaultHeight={640}
            header={
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <GripHorizontal className="w-4 h-4 text-gray-300" />
                  <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
                    <Play className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Questions SP en réel</h2>
                    <p className="text-xs text-gray-400">
                      {siteLabel || 'Questionnaire de situation proposée'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saResumeText && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowSaResume((v) => !v);
                      }}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Database className="w-3.5 h-3.5" />
                      Données SA
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsQuestionnaireOpen(false);
                      setShowSaResume(false);
                    }}
                    className="h-7 w-7 p-0"
                    disabled={isGenerating}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            }
            footer={
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">
                  {siteLabel || `${questions.length} question(s) configurée(s)`}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={onPrev} disabled={isGenerating}>
                    Précédent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsQuestionnaireOpen(false);
                      setShowSaResume(false);
                    }}
                    disabled={isGenerating}
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            }
          >
            <div className="px-5 py-4">
              {generateError && (
                <div className="mb-4 border border-red-200 rounded-lg bg-red-50 p-3">
                  <p className="text-sm text-red-600">{generateError}</p>
                </div>
              )}

              {isGenerating ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                  <span className="text-gray-500">Génération en cours...</span>
                </div>
              ) : (
                <SpQuestionnaireUI
                  key="sp-questionnaire"
                  questions={questions}
                  donneesExtraites={propositionData.donnees_extraites ?? {}}
                  catalogue={catalogue}
                  discountRules={preferences.sp_regles_remise ?? []}
                  fournisseurs={fournisseurs}
                  initialReponses={propositionData.sp_reponses}
                  onComplete={handleComplete}
                  siteLabel={siteLabel}
                  spConfigLoyer={spConfigLoyer}
                  spConfigResiliation={spConfigResiliation}
                  spConfigMoisOfferts={spConfigMoisOfferts}
                  spConfigResumeRef={spConfigResumeRef}
                  spConfigModeClient={spConfigModeClient}
                  spCodesPromo={preferences.sp_codes_promo ?? []}
                  spCodesPromoMode={preferences.sp_codes_promo_mode ?? 'addition'}
                  spCodesPromoMasquerSaisie={preferences.sp_codes_promo_masquer_saisie ?? false}
                  objectifsConfig={preferences.sp_objectifs_config ?? []}
                  templateId={templateId}
                />
              )}
            </div>
          </FloatingModal>

          {showSaResume && saResume && saResumeText && (
            <FloatingSaInspector
              open={showSaResume}
              onClose={() => setShowSaResume(false)}
              donneesExtraites={saResume}
              text={saResumeText}
              title="Resume SA"
            />
          )}
        </>
      )}
    </div>
  );
}
