'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  const fetchCredits = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('credits')
        .eq('id', organizationId)
        .single();
      
      if (data && !error) {
        setCredits(data.credits || 0);
      }
    } catch (e) {
      console.error('Erreur fetch credits:', e);
    }
  }, [organizationId, supabase]);

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

    // 3. Souscription Realtime
    const channel = supabase
      .channel('credits-update')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new.credits === 'number') {
            setCredits(payload.new.credits);
            router.refresh();
          }
        }
      )
      .subscribe();

    // 4. Écouter un événement custom pour forcer le refresh
    const handleForceRefresh = () => {
        fetchCredits();
        router.refresh();
    };
    
    window.addEventListener('force-credits-refresh', handleForceRefresh);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
      window.removeEventListener('force-credits-refresh', handleForceRefresh);
    };
  }, [organizationId, supabase, router, fetchCredits]);

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
