'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

type Secteur = 'telephonie' | 'bureautique' | 'mixte';

type PromptDefaultRow = {
  secteur: Secteur;
  prompt_template: string | null;
  updated_at?: string | null;
};

export function PromptDefaultsForm({
  initialPromptDefaults,
}: {
  initialPromptDefaults: PromptDefaultRow[];
}) {
  const initialMap = useMemo(() => {
    const map = new Map<Secteur, PromptDefaultRow>();
    for (const row of initialPromptDefaults || []) {
      map.set(row.secteur, row);
    }
    return map;
  }, [initialPromptDefaults]);

  const [activeSecteur, setActiveSecteur] = useState<Secteur>('telephonie');
  const [values, setValues] = useState<Record<Secteur, string>>({
    telephonie: initialMap.get('telephonie')?.prompt_template || '',
    bureautique: initialMap.get('bureautique')?.prompt_template || '',
    mixte: initialMap.get('mixte')?.prompt_template || '',
  });

  useEffect(() => {
    setValues({
      telephonie: initialMap.get('telephonie')?.prompt_template || '',
      bureautique: initialMap.get('bureautique')?.prompt_template || '',
      mixte: initialMap.get('mixte')?.prompt_template || '',
    });
  }, [initialMap]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admin/prompt-defaults', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secteur: activeSecteur,
          prompt_template: values[activeSecteur],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'Erreur lors de la sauvegarde');
      }

      setSuccess('Prompt sauvegardé. Il sera utilisé pour les nouveaux templates.');
    } catch (err: unknown) {
      console.error('Erreur sauvegarde prompt default:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Prompts par défaut</h2>
        <p className="text-sm text-gray-600 mt-1">
          {"Utilisés uniquement lors de la création d'un nouveau template."}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveSecteur('telephonie')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            activeSecteur === 'telephonie'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Téléphonie
        </button>
        <button
          type="button"
          onClick={() => setActiveSecteur('bureautique')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            activeSecteur === 'bureautique'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Bureautique
        </button>
        <button
          type="button"
          onClick={() => setActiveSecteur('mixte')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            activeSecteur === 'mixte'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Mixte
        </button>
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prompt ({activeSecteur})
        </label>
        <textarea
          value={values[activeSecteur]}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [activeSecteur]: e.target.value }))
          }
          rows={18}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          Enregistrer
        </button>
      </div>
    </div>
  );
}
