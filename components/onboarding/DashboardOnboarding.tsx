'use client';

import { useState, useEffect } from 'react';
import { OnboardingWelcomeModal } from './OnboardingWelcomeModal';
import { OnboardingRestartButton } from './OnboardingRestartButton';

interface DashboardOnboardingProps {
  onboardingCompleted: boolean;
  organizationName?: string;
  toursSeen: string[];
}

export function DashboardOnboarding({
  onboardingCompleted,
  organizationName,
  toursSeen,
}: DashboardOnboardingProps) {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Show welcome modal automatically on first visit (onboarding not completed yet)
    if (!onboardingCompleted) {
      // Small delay so the page renders first
      const t = setTimeout(() => setShowWelcome(true), 800);
      return () => clearTimeout(t);
    }
  }, [onboardingCompleted]);

  return (
    <>
      {/* Welcome modal — auto-shown on first visit */}
      {showWelcome && (
        <OnboardingWelcomeModal
          organizationName={organizationName}
          onClose={() => setShowWelcome(false)}
        />
      )}

      {/* "Revoir le guide" button — always visible after onboarding seen at least once */}
      <OnboardingRestartButton toursSeen={toursSeen} />
    </>
  );
}
