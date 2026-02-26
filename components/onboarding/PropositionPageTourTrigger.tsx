'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OnboardingGuide } from './OnboardingGuide';
import { OnboardingSuccessModal } from './OnboardingSuccessModal';
import { getPropositionTourSteps } from '@/lib/onboarding/tourSteps.proposition';
import type { Secteur } from '@/lib/onboarding/onboarding.types';

interface PropositionPageTourTriggerProps {
  secteur: Secteur;
}

export function PropositionPageTourTrigger({ secteur }: PropositionPageTourTriggerProps) {
  const searchParams = useSearchParams();
  const tourParam = searchParams.get('tour');

  if (tourParam !== 'proposition') return null;

  return <PropositionPageTourSession key="proposition" secteur={secteur} />;
}

function PropositionPageTourSession({ secteur }: PropositionPageTourTriggerProps) {
  const [guideActive, setGuideActive] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  async function markSeen() {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour: 'proposition' }),
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
    return (
      <OnboardingSuccessModal
        tourName="Créer une proposition"
        onClose={() => setShowSuccess(false)}
      />
    );
  }

  if (!guideActive) return null;

  const steps = getPropositionTourSteps(secteur);

  return (
    <OnboardingGuide
      steps={steps}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
