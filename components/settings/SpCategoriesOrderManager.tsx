'use client';

import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { SpCategorie } from '@/types';

const DEFAULT_ORDER: SpCategorie[] = ['internet', 'fixe', 'mobile'];

const LABELS: Record<SpCategorie, string> = {
  internet: 'Internet (fibre, satellite, backup 4G…)',
  fixe: 'Fixe / opérateur (E-standard, lignes fixes, fax…)',
  mobile: 'Mobile (forfaits, lignes data…)',
};

export function SpCategoriesOrderManager() {
  const [order, setOrder] = useState<SpCategorie[]>(DEFAULT_ORDER);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/settings/preferences')
      .then((r) => r.json())
      .then((data) => {
        const saved: SpCategorie[] | undefined = data.preferences?.sp_categories_order;
        if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length) {
          setOrder(saved);
        }
      })
      .catch(() => toast.error('Erreur lors du chargement'))
      .finally(() => setIsLoading(false));
  }, []);

  const move = (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    const next = [...order];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setOrder(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp_categories_order: order }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Ordre des catégories enregistré');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Définit l&apos;ordre d&apos;affichage des produits (internet, fixe, mobile) dans les tableaux
        de la proposition Word (situation proposée, bons de commande, etc.).
      </p>

      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}

      {!isLoading && (
        <div className="space-y-2">
          {order.map((categorie, idx) => (
            <div
              key={categorie}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 flex-shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm text-gray-900">{LABELS[categorie]}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 'down')}
                  disabled={idx === order.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={isSaving || isLoading}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
