'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/formatting';
import { useRouter, usePathname } from 'next/navigation';

interface CreditsDisplayProps {
  organizationId: string;
  initialCredits: number;
  tarifParProposition: number;
}

export function CreditsDisplay({
  organizationId,
  initialCredits,
  tarifParProposition
}: CreditsDisplayProps) {
  const [credits, setCredits] = useState(initialCredits);
  const router = useRouter();
  const pathname = usePathname();

  const fetchCredits = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/tarifs', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setCredits(data.credits ?? 0);
      }
    } catch (e) {
      console.error('Erreur fetch credits:', e);
    }
  }, []);

  // Mettre à jour si les props changent
  useEffect(() => {
    setCredits(initialCredits);
  }, [initialCredits]);

  // Fetch au changement de route
  useEffect(() => {
    fetchCredits();
  }, [pathname, fetchCredits]);

  // Fetch périodique (toutes les 10s) et Realtime
  useEffect(() => {
    // 1. Fetch initial
    fetchCredits();

    // 2. Polling toutes les 10 secondes (backup si realtime échoue)
    const intervalId = setInterval(fetchCredits, 10000);

    // 4. Écouter un événement custom pour forcer le refresh
    const handleForceRefresh = () => {
        fetchCredits();
        router.refresh();
    };

    window.addEventListener('force-credits-refresh', handleForceRefresh);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('force-credits-refresh', handleForceRefresh);
    };
  }, [organizationId, router, fetchCredits]);

  const propositionsRestantes = Math.floor(credits / (tarifParProposition || 1));

  return (
    <div className="mb-4 p-3 bg-blue-50 rounded-lg transition-all duration-300">
      <p className="text-xs text-gray-600 mb-1">Crédits disponibles</p>
      <p className="text-xl font-bold text-blue-600">
        {formatCurrency(credits)}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        ≈ {propositionsRestantes} propositions
      </p>
    </div>
  );
}
