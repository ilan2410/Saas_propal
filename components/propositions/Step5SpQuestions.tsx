'use client';

import { useState, useEffect } from 'react';
import { Loader2, Database, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropositionData } from './PropositionWizard';
import type { SpQuestion, SpQuestionReponse, SpAdresse, SuggestionsSpCompletes, CatalogueProduit } from '@/types';
import { SpQuestionnaireUI } from '@/components/sp/SpQuestionnaireUI';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
  // Multisite: label shown above the chat (e.g. "Site 1 sur 3 — Paris")
  siteLabel?: string;
  // Multisite: when provided, bypasses generer-suggestions and returns raw reponses
  onMultisiteComplete?: (reponses: SpQuestionReponse[]) => void;
}

export function Step5SpQuestions({ propositionData, updatePropositionData, onNext, onPrev, siteLabel, onMultisiteComplete }: Props) {
  const [questions, setQuestions] = useState<SpQuestion[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [generateError, setGenerateError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSaResume, setShowSaResume] = useState(false);

  const templateId = propositionData.template_id;

  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch('/api/catalogue/fournisseurs').then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
    ]).then(([qData, fData, cData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setQuestions(qs);
      setFournisseurs(fData.fournisseurs ?? []);
      setCatalogue(cData.produits ?? []);
      setLoadingQuestions(false);
    }).catch(() => setLoadingQuestions(false));
  }, [templateId]);

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
      const adresseRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && (q.affichage === 'adresse_complete' || q.affichage === 'edition_sa'))
      );
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
          adresse_facturation: adresseRep?.valeur as SpAdresse | undefined,
          livraison_identique: true,
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

  const saResume = (propositionData.donnees_extraites as Record<string, unknown> | undefined);
  const saResumeText = saResume
    ? ((saResume.resume as string) || (saResume['résumé'] as string) || '')
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
          <p className="text-gray-600 mt-1">Répondez aux questions pour paramétrer votre proposition.</p>
        </div>
        {saResumeText && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowSaResume((v) => !v);
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0 mt-1"
          >
            <Database className="w-3.5 h-3.5" />
            Données SA
          </button>
        )}
      </div>

      <div>
        {showSaResume && saResumeText && (
          <div className="border border-green-200 rounded-lg bg-green-50/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-green-800">Résumé SA</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowSaResume(false);
                }}
                className="text-green-400 hover:text-green-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="text-xs text-green-900 overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
              {saResumeText}
            </pre>
          </div>
        )}
      </div>

      {generateError && (
        <div className="border border-red-200 rounded-lg bg-red-50 p-3">
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
          fournisseurs={fournisseurs}
          initialReponses={propositionData.sp_reponses}
          onComplete={handleComplete}
          siteLabel={siteLabel}
        />
      )}

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
      </div>
    </div>
  );
}
