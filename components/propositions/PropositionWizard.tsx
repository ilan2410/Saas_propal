'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Step1SelectTemplate } from './Step1SelectTemplate';
import { Step2UploadDocuments } from './Step2UploadDocuments';
import { Step3ExtractData } from './Step3ExtractData';
import { Step5Generate } from './Step5Generate';
import { Step5SpQuestions } from './Step5SpQuestions';
import { Step5EditSp } from './Step5EditSp';
import { MultisiteChoiceModal } from './MultisiteChoiceModal';
import type { SuggestionsGenerees, SuggestionsSpCompletes, SpQuestionReponse } from '@/types';

const STEPS = [
  { id: 1, name: 'Template', description: 'Sélection' },
  { id: 2, name: 'Documents', description: 'Upload' },
  { id: 3, name: 'Extraction', description: 'IA' },
  { id: 4, name: 'Situation Proposée', description: 'IA + Validation' },
  { id: 5, name: 'Génération', description: 'Finalisation' },
];

export interface MultisitePropositionEntry {
  site_nom: string;
  proposition_id: string | null;
  reponses?: SpQuestionReponse[];
  generated: boolean;
  file_url?: string;
}

export interface PropositionData {
  template_id: string;
  nom_client?: string;
  documents_urls: string[];
  donnees_extraites: Record<string, unknown>;
  proposition_id?: string;
  copieurs_count?: number;
  suggestions_generees?: SuggestionsGenerees | null;
  suggestions_editees?: SuggestionsGenerees | null;
  sp_reponses?: SpQuestionReponse[];
  suggestions_sp_completes?: SuggestionsSpCompletes;
  // Multisite
  multisite_sites?: Array<{ nom: string; adresse: string; ville: string; nb_lignes: number }>;
  multisite_mode?: 'par_site' | 'tout_inclure' | null;
  multisite_current_site_index?: number;
  multisite_propositions?: MultisitePropositionEntry[];
}

export type PropositionTemplateSummary = {
  id: string;
  nom: string;
  file_type: string;
  description?: string | null;
  champs_actifs?: string[] | null;
  file_config?: unknown;
  statut?: string | null;
};

interface Props {
  templates: PropositionTemplateSummary[];
  secteur: string;
  initialData?: Partial<PropositionData>;
  initialStep?: number;
}

// Dialog for warning when re-editing a completed site
interface ReEditWarningDialogProps {
  siteNom: string;
  tarifCloneSite: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ReEditWarningDialog({ siteNom, tarifCloneSite, onConfirm, onCancel }: ReEditWarningDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Modifier ce site consomme des crédits</h2>
        </div>
        <p className="text-sm text-gray-600">
          Cette action va re-générer la proposition pour <span className="font-semibold">&quot;{siteNom}&quot;</span>.
        </p>
        <p className="text-sm font-medium text-amber-700">Coût : {tarifCloneSite.toFixed(2)} crédit(s)</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={onConfirm}>
            Modifier quand même
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PropositionWizard({ templates, secteur, initialData, initialStep }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(Math.max(1, Number(initialStep || 1)));
  const [propositionData, setPropositionData] = useState<Partial<PropositionData>>({
    documents_urls: [],
    donnees_extraites: {},
    copieurs_count: 1,
    ...(initialData || {}),
  });
  const [showMultisiteModal, setShowMultisiteModal] = useState(false);
  const [tarifCloneSite, setTarifCloneSite] = useState(1);
  const [reEditSiteIndex, setReEditSiteIndex] = useState<number | null>(null);

  const updatePropositionData = (data: Partial<PropositionData>) => {
    setPropositionData((prev) => ({ ...prev, ...data }));
  };

  const persistProgress = async (data: Record<string, unknown>) => {
    if (!propositionData.proposition_id) return;
    try {
      await fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.error('Erreur persistance brouillon:', e);
    }
  };

  const nextStep = () => {
    if (currentStep < 5) {
      const next = currentStep + 1;
      setCurrentStep(next);
      persistProgress({ current_step: next, statut: 'draft' });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      persistProgress({ current_step: prev, statut: 'draft' });
    }
  };

  const handleComplete = () => {
    try {
      sessionStorage.removeItem('propal:proposition-wizard:draftId');
      sessionStorage.removeItem('propal:proposition-wizard:createdAt');
    } catch {}

    if (propositionData.proposition_id) {
      router.push(`/propositions/${propositionData.proposition_id}`);
    } else {
      router.push('/propositions');
    }
  };

  // ── Multisite helpers ──────────────────────────────────────────────

  const extractSiteStats = (donnees: Record<string, unknown>): Array<{ nom: string; adresse: string; ville: string; nb_lignes: number }> => {
    const sa = donnees.situation_actuelle as Record<string, unknown> | undefined;
    if (!sa) return [];
    const sites = (sa.sites as Array<{ nom?: string; adresse?: string; code_postal?: string; ville?: string }> | undefined) ?? [];
    const lignes = (sa.lignes as Array<{ site?: string }> | undefined) ?? [];
    const abonnements = (sa.abonnements as Array<{ site?: string }> | undefined) ?? [];

    return sites.map((s) => ({
      nom: s.nom ?? '',
      adresse: s.adresse ?? '',
      ville: s.ville ?? '',
      nb_lignes: [...lignes, ...abonnements].filter((l) => l.site === s.nom).length,
    }));
  };

  // Called after Step3 extraction succeeds
  const handleAfterExtraction = async () => {
    const donnees = propositionData.donnees_extraites ?? {};
    const sites = extractSiteStats(donnees);

    if (sites.length > 1) {
      // Load tarif_clone_site from org
      try {
        const res = await fetch('/api/settings/tarifs');
        if (res.ok) {
          const tarifs = await res.json() as { tarif_clone_site?: number };
          setTarifCloneSite(tarifs.tarif_clone_site ?? 1);
        }
      } catch {}
      updatePropositionData({ multisite_sites: sites });
      setShowMultisiteModal(true);
    } else {
      nextStep();
    }
  };

  const handleMultisiteParSite = () => {
    const sites = propositionData.multisite_sites ?? [];
    updatePropositionData({
      multisite_mode: 'par_site',
      multisite_current_site_index: 0,
      multisite_propositions: sites.map((s) => ({
        site_nom: s.nom,
        proposition_id: null,
        generated: false,
      })),
    });
    setShowMultisiteModal(false);
    nextStep();
  };

  const handleMultisiteToutInclure = () => {
    updatePropositionData({ multisite_mode: 'tout_inclure' });
    setShowMultisiteModal(false);
    nextStep();
  };

  const handleMultisitePasMultisite = () => {
    updatePropositionData({ multisite_mode: null });
    setShowMultisiteModal(false);
    nextStep();
  };

  // Complete SP for one site, clone, generate, advance to next or Step6
  const handleMultisiteSiteComplete = async (reponses: SpQuestionReponse[], siteIndex: number) => {
    // Capture current site from state snapshot
    const site = propositionData.multisite_propositions?.[siteIndex];
    const parentId = propositionData.proposition_id;
    if (!site || !parentId) return;

    try {
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
            } catch {
              // not JSON
            }
            return sum + (parseFloat(val) || 0);
          }
          return sum;
        }, 0);

      // Clone the parent proposition for this site
      const cloneRes = await fetch(`/api/propositions/${parentId}/clone-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_nom: site.site_nom }),
      });

      if (!cloneRes.ok) {
        const err = await cloneRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erreur clone site');
      }

      const cloneData = await cloneRes.json() as {
        proposition_id: string;
        extracted_data_filtered: Record<string, unknown>;
      };

      // Load catalogue for SP generation
      const catalogueData = await fetch('/api/catalogue')
        .then((r) => r.json())
        .then((d) => d.produits ?? [])
        .catch(() => []);

      // Generate SP suggestions for this clone
      const suggestionsRes = await fetch('/api/propositions/generer-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation_actuelle: cloneData.extracted_data_filtered.situation_actuelle,
          catalogue: catalogueData,
          proposition_id: cloneData.proposition_id,
          force_regenerate: true,
          sp_questions_reponses: reponses,
          sp_fas_total: fasTotal,
          preferences: {},
        }),
      });

      if (!suggestionsRes.ok) throw new Error('Erreur génération SP');

      // Generate the file
      const generateRes = await fetch(`/api/propositions/${cloneData.proposition_id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!generateRes.ok) throw new Error('Erreur génération fichier');

      const generateData = await generateRes.json() as { file_url: string };

      // Functional update to avoid stale closure
      setPropositionData((prev) => {
        const prevProps = prev.multisite_propositions ?? [];
        const updated = prevProps.map((p, i) =>
          i === siteIndex
            ? { ...p, proposition_id: cloneData.proposition_id, reponses, generated: true, file_url: generateData.file_url }
            : p
        );
        const nextSiteIndex = siteIndex + 1;
        const isLast = nextSiteIndex >= updated.length;
        return {
          ...prev,
          multisite_propositions: updated,
          multisite_current_site_index: isLast ? siteIndex : nextSiteIndex,
        };
      });

      // Check if last site → advance to Step6
      const totalSites = propositionData.multisite_propositions?.length ?? 0;
      if (siteIndex + 1 >= totalSites) {
        nextStep();
      }
    } catch (e) {
      console.error('Erreur multisite site complete:', e);
    }
  };

  const handleReEditSiteConfirm = (siteIndex: number) => {
    updatePropositionData({ multisite_current_site_index: siteIndex });
    setReEditSiteIndex(null);
  };

  // ── Render ─────────────────────────────────────────────────────────

  const isMultisiteParSite = propositionData.multisite_mode === 'par_site';
  const currentSiteIndex = propositionData.multisite_current_site_index ?? 0;
  const multisiteProps = propositionData.multisite_propositions ?? [];
  const currentSite = isMultisiteParSite ? multisiteProps[currentSiteIndex] : null;

  return (
    <div className="space-y-8">
      {/* Steps Progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6 overflow-x-auto">
        <nav aria-label="Progress" className="min-w-[600px] md:min-w-0">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, stepIdx) => (
              <li key={step.id} className={`relative ${stepIdx !== STEPS.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex items-center">
                  <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
                    currentStep > step.id ? 'bg-green-600' : currentStep === step.id ? 'border-2 border-green-600 bg-white' : 'border-2 border-gray-300 bg-white'
                  }`}>
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : (
                      <span className={`text-sm font-semibold ${currentStep === step.id ? 'text-green-600' : 'text-gray-500'}`}>
                        {step.id}
                      </span>
                    )}
                  </div>
                  <div className="ml-4">
                    <p className={`text-sm font-medium ${currentStep >= step.id ? 'text-gray-900' : 'text-gray-500'}`}>
                      {step.name}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                  {stepIdx !== STEPS.length - 1 && (
                    <div
                      className={`absolute left-10 top-5 h-0.5 w-full ${currentStep > step.id ? 'bg-green-600' : 'bg-gray-300'}`}
                      style={{ marginLeft: '2.5rem' }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Multisite site navigation (Step 4 — SP, par_site mode) */}
      {currentStep === 4 && isMultisiteParSite && multisiteProps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">Progression des sites</p>
          <div className="flex items-center gap-2 flex-wrap">
            {multisiteProps.map((sp, i) => (
              <button
                key={sp.site_nom}
                onClick={() => {
                  if (sp.generated && i !== currentSiteIndex) {
                    setReEditSiteIndex(i);
                  }
                }}
                disabled={!sp.generated && i !== currentSiteIndex}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === currentSiteIndex
                    ? 'bg-blue-600 text-white'
                    : sp.generated
                    ? 'bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {sp.generated ? '●' : '○'} {sp.site_nom}
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-2">
              Site {currentSiteIndex + 1} sur {multisiteProps.length}
            </span>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        {currentStep === 1 && (
          <div id="step1-template-selector">
            <Step1SelectTemplate
              templates={templates}
              secteur={secteur}
              propositionData={propositionData}
              updatePropositionData={updatePropositionData}
              onNext={nextStep}
            />
          </div>
        )}
        {currentStep === 2 && (
          <div id="step2-upload-docs">
            <Step2UploadDocuments
              propositionData={propositionData}
              updatePropositionData={updatePropositionData}
              onNext={nextStep}
              onPrev={prevStep}
            />
          </div>
        )}
        {currentStep === 3 && (
          <div id="step3-extracted-data">
            <Step3ExtractData
              secteur={secteur}
              propositionData={propositionData}
              updatePropositionData={updatePropositionData}
              onNext={handleAfterExtraction}
              onPrev={prevStep}
            />
          </div>
        )}
        {currentStep === 4 && (
          <div id="step5-sp-questions">
            {(() => {
              const tpl = templates.find((t) => t.id === propositionData.template_id);
              if (tpl?.file_type !== 'word') {
                return (
                  <div className="space-y-4">
                    <p className="text-gray-500">L&apos;étape SP est disponible uniquement pour les templates Word.</p>
                    <div className="flex gap-3">
                      <button onClick={prevStep} className="px-4 py-2 border rounded">Précédent</button>
                      <button onClick={nextStep} className="px-4 py-2 bg-green-600 text-white rounded">Continuer</button>
                    </div>
                  </div>
                );
              }

              if (isMultisiteParSite && currentSite) {
                // Multisite mode: one site at a time
                const siteLabel = `Site ${currentSiteIndex + 1} sur ${multisiteProps.length} — ${currentSite.site_nom}`;

                if (currentSite.generated) {
                  // Show read-only summary for completed site
                  return (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        La proposition pour <span className="font-semibold">{currentSite.site_nom}</span> a été générée.
                      </p>
                      {currentSite.file_url && (
                        <a href={currentSite.file_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                          Télécharger
                        </a>
                      )}
                    </div>
                  );
                }

                return (
                  <Step5SpQuestions
                    key={`site-${currentSiteIndex}`}
                    propositionData={{
                      ...propositionData,
                      sp_reponses: currentSite.reponses,
                    }}
                    updatePropositionData={updatePropositionData}
                    onNext={() => {}}
                    onPrev={prevStep}
                    siteLabel={siteLabel}
                    currentSiteName={currentSite.site_nom}
                    onMultisiteComplete={(reponses) => handleMultisiteSiteComplete(reponses, currentSiteIndex)}
                  />
                );
              }

              // Normal (single-site) mode
              if (propositionData.suggestions_sp_completes) {
                return <Step5EditSp propositionData={propositionData} updatePropositionData={updatePropositionData} onNext={nextStep} onPrev={prevStep} />;
              }
              return <Step5SpQuestions propositionData={propositionData} updatePropositionData={updatePropositionData} onNext={nextStep} onPrev={prevStep} />;
            })()}
          </div>
        )}
        {currentStep === 5 && (
          <div id="btn-generate-proposition">
            <Step5Generate
              propositionData={propositionData}
              onComplete={handleComplete}
              onPrev={prevStep}
            />
          </div>
        )}
      </div>

      {/* Multisite choice modal */}
      {showMultisiteModal && propositionData.multisite_sites && (
        <MultisiteChoiceModal
          sites={propositionData.multisite_sites}
          tarifCloneSite={tarifCloneSite}
          onChoiceParSite={handleMultisiteParSite}
          onChoiceToutInclure={handleMultisiteToutInclure}
          onChoicePasMultisite={handleMultisitePasMultisite}
        />
      )}

      {/* Re-edit warning dialog */}
      {reEditSiteIndex !== null && (
        <ReEditWarningDialog
          siteNom={multisiteProps[reEditSiteIndex]?.site_nom ?? ''}
          tarifCloneSite={tarifCloneSite}
          onConfirm={() => handleReEditSiteConfirm(reEditSiteIndex)}
          onCancel={() => setReEditSiteIndex(null)}
        />
      )}
    </div>
  );
}
