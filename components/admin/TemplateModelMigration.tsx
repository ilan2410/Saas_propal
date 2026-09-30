'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '@/lib/ai/claude-models';

type Apercu = { target: string; total: number; parModele: Record<string, number> };

/**
 * Bascule de tous les templates vers un modèle Claude. Deux temps : l'aperçu
 * dit combien de templates seraient modifiés, la confirmation applique.
 */
export function TemplateModelMigration() {
  const [target, setTarget] = useState<string>(DEFAULT_CLAUDE_MODEL);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(false);
  const [application, setApplication] = useState(false);

  const label = (value: string) => CLAUDE_MODELS.find((m) => m.value === value)?.label ?? value;

  const previsualiser = async () => {
    setChargement(true);
    try {
      const response = await fetch(`/api/admin/templates/migrate-model?target=${encodeURIComponent(target)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Aperçu impossible');
      if (data.total === 0) {
        toast.success('Tous les templates utilisent déjà ce modèle.');
        return;
      }
      setApercu(data as Apercu);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Aperçu impossible');
    } finally {
      setChargement(false);
    }
  };

  const appliquer = async () => {
    if (!apercu || application) return;
    setApplication(true);
    try {
      const response = await fetch('/api/admin/templates/migrate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: apercu.target, confirm: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Bascule impossible');
      toast.success(`${data.modifies} template(s) basculé(s) vers ${label(apercu.target)}.`);
      setApercu(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bascule impossible');
    } finally {
      setApplication(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="migrate-target" className="text-sm font-medium text-gray-700">
            Modèle cible
          </label>
          <select
            id="migrate-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={() => void previsualiser()} disabled={chargement}>
          {chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Basculer tous les templates
        </Button>
      </div>

      {apercu && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Basculer {apercu.total} template(s) vers {label(apercu.target)} ?
            </h3>
            <ul className="space-y-1 text-sm text-gray-600">
              {Object.entries(apercu.parModele).map(([modele, n]) => (
                <li key={modele}>{n} × {modele === '(non renseigné)' ? modele : label(modele)}</li>
              ))}
            </ul>
            <p className="text-sm text-gray-600">
              Le réglage d&apos;effort de chaque template est conservé. Les extractions suivantes
              utiliseront ce modèle, dont le comportement et le coût peuvent différer.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setApercu(null)} disabled={application}>Annuler</Button>
              <Button onClick={() => void appliquer()} disabled={application}>
                {application && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmer la bascule
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
