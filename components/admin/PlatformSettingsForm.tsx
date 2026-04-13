'use client';

import { useState } from 'react';
import { Loader2, Save, Euro, Info } from 'lucide-react';

interface Props {
  initialTarifDefaut: number;
}

export function PlatformSettingsForm({ initialTarifDefaut }: Props) {
  const [tarif, setTarif] = useState<string>(String(initialTarifDefaut));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = parseFloat(tarif);
    if (isNaN(parsed) || parsed < 0) {
      setError('Veuillez saisir un montant valide (≥ 0)');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'tarif_par_proposition_defaut',
          value: parsed,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'Erreur lors de la sauvegarde');
      }

      setSuccess('Prix par défaut mis à jour. Il sera appliqué aux nouveaux clients.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Tarification par défaut</h2>
        <p className="text-sm text-gray-600 mt-1">
          Prix appliqué automatiquement aux nouveaux clients lors de leur création.
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Ce prix <strong>n&apos;a pas de priorité</strong> sur le tarif défini par client. Si un tarif
          spécifique est configuré pour un client, il sera toujours utilisé à la place.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      <div className="max-w-xs">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prix par proposition (€)
        </label>
        <div className="relative">
          <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="number"
            step="0.01"
            min="0"
            value={tarif}
            onChange={(e) => setTarif(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="5.00"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Déduit des crédits du client à chaque proposition générée.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
