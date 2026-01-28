'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

type Secteur = 'telephonie' | 'bureautique' | 'mixte';

export default function OnboardingForm() {
  const router = useRouter();
  const [secteur, setSecteur] = useState<Secteur>('telephonie');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ secteur }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Impossible d'enregistrer le secteur");
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      console.error('Erreur onboarding:', err);
      const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement";
      setError(message);
    } finally {
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Secteur
        </label>
        <select
          value={secteur}
          onChange={(e) => setSecteur(e.target.value as Secteur)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="telephonie">Téléphonie</option>
          <option value="bureautique">Bureautique</option>
          <option value="mixte">Mixte</option>
        </select>
        <p className="mt-2 text-xs text-gray-500">
          Vous pourrez le modifier plus tard dans les paramètres.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
      >
        {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
        {isLoading ? 'Enregistrement...' : 'Continuer'}
      </button>
    </form>
  );
}
