'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Step1SelectTemplate } from './Step1SelectTemplate';
import { Step2UploadDocuments } from './Step2UploadDocuments';
import { Step3ExtractData } from './Step3ExtractData';
import { Step4EditData } from './Step4EditData';
import { Step5Generate } from './Step5Generate';

const STEPS = [
  { id: 1, name: 'Template', description: 'Sélection' },
  { id: 2, name: 'Documents', description: 'Upload' },
  { id: 3, name: 'Extraction', description: 'IA' },
  { id: 4, name: 'Édition', description: 'Vérification' },
  { id: 5, name: 'Génération', description: 'Finalisation' },
];

export interface PropositionData {
  template_id: string;
  nom_client?: string;
  documents_urls: string[];
  donnees_extraites: Record<string, unknown>;
  proposition_id?: string;
  copieurs_count?: number;
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

export function PropositionWizard({ templates, secteur, initialData, initialStep }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(Math.max(1, Number(initialStep || 1)));
  const [propositionData, setPropositionData] = useState<Partial<PropositionData>>({
    documents_urls: [],
    donnees_extraites: {},
    copieurs_count: 1,
    ...(initialData || {}),
  });

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

  const initializationRef = useRef(false);

  // Créer automatiquement une proposition draft si on démarre un nouveau wizard
  useEffect(() => {
    let isCancelled = false;

    async function ensureDraft() {
      // Si on a déjà un ID, ou si une initialisation est en cours/terminée, on arrête
      if (propositionData.proposition_id || initializationRef.current) return;

      initializationRef.current = true;

      try {
        const res = await fetch('/api/propositions/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: currentStep }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.details || json?.error || 'Erreur création draft');
        
        if (isCancelled) return;

        updatePropositionData({ proposition_id: json.proposition?.id });
      } catch (e) {
        console.error('Erreur création proposition draft:', e);
        initializationRef.current = false; // Réinitialiser en cas d'erreur
      }
    }

    ensureDraft();
    return () => {
      isCancelled = true;
    };
  }, [propositionData.proposition_id, currentStep]);

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
    if (propositionData.proposition_id) {
      router.push(`/propositions/${propositionData.proposition_id}`);
    } else {
      router.push('/propositions');
    }
  };

  return (
    <div className="space-y-8">
      {/* Steps Progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, stepIdx) => (
              <li
                key={step.id}
                className={`relative ${
                  stepIdx !== STEPS.length - 1 ? 'flex-1' : ''
                }`}
              >
                <div className="flex items-center">
                  {/* Step Circle */}
                  <div
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
                      currentStep > step.id
                        ? 'bg-green-600'
                        : currentStep === step.id
                        ? 'border-2 border-green-600 bg-white'
                        : 'border-2 border-gray-300 bg-white'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5 text-white" />
                    ) : (
                      <span
                        className={`text-sm font-semibold ${
                          currentStep === step.id
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {step.id}
                      </span>
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="ml-4">
                    <p
                      className={`text-sm font-medium ${
                        currentStep >= step.id
                          ? 'text-gray-900'
                          : 'text-gray-500'
                      }`}
                    >
                      {step.name}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>

                  {/* Connector Line */}
                  {stepIdx !== STEPS.length - 1 && (
                    <div
                      className={`absolute left-10 top-5 h-0.5 w-full ${
                        currentStep > step.id ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                      style={{ marginLeft: '2.5rem' }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        {currentStep === 1 && (
          <Step1SelectTemplate
            templates={templates}
            secteur={secteur}
            propositionData={propositionData}
            updatePropositionData={updatePropositionData}
            onNext={nextStep}
          />
        )}
        {currentStep === 2 && (
          <Step2UploadDocuments
            propositionData={propositionData}
            updatePropositionData={updatePropositionData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {currentStep === 3 && (
          <Step3ExtractData
            secteur={secteur}
            propositionData={propositionData}
            updatePropositionData={updatePropositionData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {currentStep === 4 && (
          <Step4EditData
            secteur={secteur}
            propositionData={propositionData}
            updatePropositionData={updatePropositionData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {currentStep === 5 && (
          <Step5Generate
            propositionData={propositionData}
            onComplete={handleComplete}
            onPrev={prevStep}
          />
        )}
      </div>
    </div>
  );
}
