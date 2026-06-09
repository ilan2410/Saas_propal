'use client';

import type { SpConfigMoisOfferts, SpMoisOffertsCategorieIncluse } from '@/types';

interface Props {
  value?: SpConfigMoisOfferts;
  onChange: (value: SpConfigMoisOfferts) => void;
}

const DEFAULT_CATEGORIES: SpMoisOffertsCategorieIncluse[] = ['fixe', 'mobile'];

const OPTIONS: Array<{
  id: SpMoisOffertsCategorieIncluse;
  label: string;
  description: string;
}> = [
  {
    id: 'fixe',
    label: 'Abonnements fixe',
    description: 'Inclure les lignes mensuelles de téléphonie fixe.',
  },
  {
    id: 'mobile',
    label: 'Abonnements mobile',
    description: 'Inclure les lignes mensuelles mobiles.',
  },
  {
    id: 'internet',
    label: 'Abonnements internet',
    description: 'Inclure les accès internet mensuels.',
  },
  {
    id: 'autres_mensuels',
    label: 'Autres mensuels',
    description: 'Inclure les autres produits mensuels du catalogue.',
  },
];

export function getDefaultSpConfigMoisOfferts(): SpConfigMoisOfferts {
  return { categories_inclues: DEFAULT_CATEGORIES };
}

export function SpMoisOffertsManager({ value, onChange }: Props) {
  const selected = new Set(value?.categories_inclues ?? DEFAULT_CATEGORIES);

  const toggle = (id: SpMoisOffertsCategorieIncluse) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ categories_inclues: Array.from(next) });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Catégories prises en compte</h3>
        <p className="text-sm text-gray-500 mt-1">
          Sélectionnez les types d&apos;abonnements mensuels utilisés pour calculer la remise mois offerts.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
        {OPTIONS.map((option) => (
          <label key={option.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(option.id)}
              onChange={() => toggle(option.id)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-800">{option.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
        Le montant affiché dans le panier “Situation Proposée” et dans la variable Word sp_remise_mois_offert sera calculé uniquement sur les catégories cochées.
      </div>
    </div>
  );
}
