'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { TourId, Secteur, TourStepConfig } from '@/lib/onboarding/onboarding.types';
import { getWordTourSteps } from '@/lib/onboarding/tourSteps.word';
import { getExcelTourSteps } from '@/lib/onboarding/tourSteps.excel';
import { getPropositionTourSteps } from '@/lib/onboarding/tourSteps.proposition';
import { getCatalogueTourSteps } from '@/lib/onboarding/tourSteps.catalogue';

interface UseOnboardingTourOptions {
  tourId: TourId;
  secteur?: Secteur;
  onComplete?: () => void;
  onSkip?: () => void;
}

function buildDescription(description: string, tip?: string): string {
  if (!tip) return description;
  return `${description}<div class="onboarding-tip">${tip}</div>`;
}

function getTourSteps(tourId: TourId, secteur: Secteur): TourStepConfig[] {
  switch (tourId) {
    case 'template-word':
      return getWordTourSteps(secteur);
    case 'template-excel':
      return getExcelTourSteps(secteur);
    case 'proposition':
      return getPropositionTourSteps(secteur);
    case 'catalogue':
      return getCatalogueTourSteps();
    default:
      return [];
  }
}

async function markTourSeen(tourId: TourId): Promise<void> {
  try {
    await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour: tourId }),
    });
  } catch {
    // Non-blocking: silent failure
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DriverInstance = { drive: () => void; destroy: () => void };

export function useOnboardingTour({
  tourId,
  secteur = 'telephonie',
  onComplete,
  onSkip,
}: UseOnboardingTourOptions) {
  const driverRef = useRef<DriverInstance | null>(null);

  const startTour = useCallback(async () => {
    // driver.js CSS is already imported globally via globals.css
    const { driver } = await import('driver.js');

    const steps = getTourSteps(tourId, secteur);
    if (!steps.length) return;

    // Build driver steps — filter to existing DOM elements only
    const driverSteps = steps
      .filter((s) => !s.element || !!document.querySelector(s.element))
      .map((step, index, arr) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: buildDescription(step.description, step.tip),
          side: step.side,
          align: step.align,
          nextBtnText: index === arr.length - 1 ? 'Terminer ✓' : 'Suivant →',
          prevBtnText: '← Retour',
          doneBtnText: 'Terminer ✓',
          onNextClick: index === arr.length - 1
            ? () => {
                driverRef.current?.destroy();
                driverRef.current = null;
                void markTourSeen(tourId);
                onComplete?.();
              }
            : undefined,
        },
      }));

    if (!driverSteps.length) return;

    const d = driver({
      animate: true,
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      allowClose: true,
      overlayColor: 'rgba(0,0,0,0.65)',
      smoothScroll: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      steps: driverSteps as any,
      onDestroyed: () => {
        driverRef.current = null;
        onSkip?.();
      },
    });

    driverRef.current = d;
    d.drive();
  }, [tourId, secteur, onComplete, onSkip]);

  const stopTour = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return { startTour, stopTour };
}
