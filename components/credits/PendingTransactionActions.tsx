'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, X } from 'lucide-react';

interface Props {
  transactionId: string;
}

export function PendingTransactionActions({ transactionId }: Props) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const handleResume = async () => {
    setIsResuming(true);
    try {
      const response = await fetch('/api/stripe/resume-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details || result.error || 'Impossible de reprendre le paiement');
      }

      if (!result.url) {
        throw new Error('URL Stripe manquante');
      }

      window.location.assign(result.url);
    } catch (error) {
      console.error('Erreur reprise paiement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      alert(`Erreur lors de la reprise du paiement:\n\n${errorMessage}`);
    } finally {
      setIsResuming(false);
    }
  };

  const handleCancel = async () => {
    const ok = window.confirm('Annuler ce paiement en attente ?');
    if (!ok) return;

    setIsCanceling(true);
    try {
      const response = await fetch('/api/stripe/cancel-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details || result.error || 'Impossible d\'annuler le paiement');
      }

      router.refresh();
    } catch (error) {
      console.error('Erreur annulation paiement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      alert(`Erreur lors de l'annulation du paiement:\n\n${errorMessage}`);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={handleResume}
        disabled={isResuming || isCanceling}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isResuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Reprendre
      </button>

      <button
        type="button"
        onClick={handleCancel}
        disabled={isResuming || isCanceling}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCanceling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Annuler
      </button>
    </div>
  );
}
