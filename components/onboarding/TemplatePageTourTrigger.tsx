'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { OnboardingGuide } from './OnboardingGuide';
import { OnboardingSuccessModal } from './OnboardingSuccessModal';
import { getWordTourSteps } from '@/lib/onboarding/tourSteps.word';
import { getExcelTourSteps } from '@/lib/onboarding/tourSteps.excel';
import type { Secteur, TourStepConfig } from '@/lib/onboarding/onboarding.types';

interface TemplatePageTourTriggerProps {
  secteur: Secteur;
}

const INITIAL_STEPS: TourStepConfig[] = [
  {
    element: '#template-step1-header',
    title: 'Configurez votre template',
    description:
      'Commencez par <strong>nommer</strong> votre template et sélectionner les informations à extraire.',
    tip: 'Vous pourrez ensuite uploader votre fichier Word ou Excel pour lancer le guide complet.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '#upload-zone',
    title: 'Uploadez votre modèle',
    description:
      'Glissez votre fichier <strong>.docx</strong> (Word) ou <strong>.xlsx</strong> (Excel). PropoBoost adaptera automatiquement le guide au type de fichier.',
    tip: 'Utilisez le même document Word ou Excel que vous remplissez manuellement aujourd\'hui.',
    side: 'bottom',
    align: 'start',
  },
];

/**
 * Guide template :
 * - Au chargement de la page, affiche l'étape "upload zone" immédiatement
 * - Quand l'utilisateur upload un fichier Word ou Excel, le wizard émet
 *   l'event 'template:file-type-selected' et on switch vers le bon guide complet.
 */
export function TemplatePageTourTrigger({ secteur }: TemplatePageTourTriggerProps) {
  const searchParams = useSearchParams();
  const tourParam = searchParams.get('tour');

  if (tourParam !== 'template') return null;

  return <TemplatePageTourSession key="template" secteur={secteur} />;
}

function TemplatePageTourSession({ secteur }: { secteur: Secteur }) {
  const [steps, setSteps] = useState<TourStepConfig[]>(INITIAL_STEPS);
  const [guideActive, setGuideActive] = useState(true);
  const [guideKey, setGuideKey] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [tourId, setTourId] = useState<'template-word' | 'template-excel'>('template-word');
  const fileTypeReceivedRef = useRef(false);

  // Écouter l'event dispatché par Step2UploadTemplate quand un fichier est uploadé
  useEffect(() => {
    function handleFileTypeSelected(e: Event) {
      if (fileTypeReceivedRef.current) return;
      const detail = (e as CustomEvent<{ fileType: 'word' | 'excel' }>).detail;
      const fileType = detail?.fileType;
      if (!fileType) return;

      fileTypeReceivedRef.current = true;
      const id = fileType === 'word' ? 'template-word' : 'template-excel';
      const newSteps = fileType === 'word'
        ? getWordTourSteps(secteur)
        : getExcelTourSteps(secteur);

      setTourId(id);
      setSteps(newSteps);
      setGuideKey((k) => k + 1); // redémarre le guide avec les nouvelles étapes
    }

    window.addEventListener('template:file-type-selected', handleFileTypeSelected);
    return () => window.removeEventListener('template:file-type-selected', handleFileTypeSelected);
  }, [secteur]);

  async function markSeen() {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour: tourId }),
      });
    } catch {}
  }

  function handleComplete() {
    setGuideActive(false);
    void markSeen();
    setShowSuccess(true);
  }

  function handleSkip() {
    setGuideActive(false);
  }

  if (showSuccess) {
    const name = tourId === 'template-word' ? 'Template Word' : 'Template Excel';
    return (
      <OnboardingSuccessModal
        tourName={name}
        onClose={() => setShowSuccess(false)}
      />
    );
  }

  if (!guideActive) return null;

  return (
    <OnboardingGuide
      key={guideKey}
      steps={steps}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
