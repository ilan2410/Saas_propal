'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpConditionEditor } from './SpConditionEditor';
import type { CatalogueProduit, SpConditionLogique, SpQuestion, SpRegleRemise } from '@/types';

interface Props {
  rules: SpRegleRemise[];
  products: CatalogueProduit[];
  questions: SpQuestion[];
  onChange: (rules: SpRegleRemise[]) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRule(): SpRegleRemise {
  return {
    id: generateId(),
    nom: 'Nouvelle règle de remise',
    actif: true,
    groupes_conditions: [],
    logique_declencheur: 'ET',
    produits_ids: [],
    categories: [],
    fournisseurs: [],
  };
}

function calculateDiscountedPrice(product: CatalogueProduit): number | null {
  if (!product.prix_mensuel || !product.remise_valeur) return null;
  if (product.remise_type === 'fixe') {
    return product.prix_mensuel - product.remise_valeur;
  }
  if (product.remise_type === 'pourcentage') {
    return product.prix_mensuel * (1 - product.remise_valeur / 100);
  }
  return null;
}

function formatDiscount(product: CatalogueProduit): string {
  const discounted = calculateDiscountedPrice(product);
  if (!discounted) return '—';
  return `${discounted.toFixed(2).replace('.', ',')} €/mois`;
}

function formatDiscountLabel(product: CatalogueProduit): string {
  if (!product.remise_valeur) return '';
  if (product.remise_type === 'fixe') {
    return `-${product.remise_valeur.toFixed(2).replace('.', ',')} €/mois`;
  }
  if (product.remise_type === 'pourcentage') {
    return `-${product.remise_valeur}%`;
  }
  return '';
}

export function SpDiscountRulesManager({ rules, products, questions, onChange }: Props) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(rules[0]?.id ?? null);
  const monthlyDiscountProducts = products.filter((p) => p.actif && p.type_frequence === 'mensuel' && p.remise_valeur != null);

  const updateRule = (id: string, patch: Partial<SpRegleRemise>) => {
    onChange(rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  };

  const addRule = () => {
    const rule = emptyRule();
    onChange([...rules, rule]);
    setExpandedRuleId(rule.id);
  };

  const removeRule = (id: string) => {
    const next = rules.filter((rule) => rule.id !== id);
    onChange(next);
    if (expandedRuleId === id) setExpandedRuleId(next[0]?.id ?? null);
  };

  const toggleProduct = (rule: SpRegleRemise, productId: string) => {
    const current = new Set(rule.produits_ids ?? []);
    if (current.has(productId)) current.delete(productId);
    else current.add(productId);
    updateRule(rule.id, { produits_ids: Array.from(current) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Règles de remise SP</h3>
          <p className="text-sm text-gray-500">Déclenchez des tarifs remisés selon les réponses du questionnaire SP.</p>
        </div>
        <Button size="sm" onClick={addRule}>
          <Plus className="w-4 h-4 mr-1" />
          Ajouter une règle
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Aucune règle configurée. Ajoutez une règle pour appliquer les tarifs remisés du catalogue.
        </div>
      )}

      {rules.map((rule) => {
        const isExpanded = expandedRuleId === rule.id;
        const selectedCount = rule.produits_ids?.length ?? 0;
        const scopedProducts = selectedCount > 0
          ? monthlyDiscountProducts.filter((p) => rule.produits_ids?.includes(p.id))
          : monthlyDiscountProducts;

        return (
          <div key={rule.id} className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{rule.nom}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${rule.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {rule.actif ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedCount > 0 ? `${selectedCount} produit(s) ciblé(s)` : 'Tous les produits remisés éligibles'}
                </p>
              </div>
              <span className="text-xs text-gray-400">{isExpanded ? 'Réduire' : 'Configurer'}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-4 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nom de la règle</label>
                    <input
                      value={rule.nom}
                      onChange={(e) => updateRule(rule.id, { nom: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                    <input
                      type="checkbox"
                      checked={rule.actif}
                      onChange={(e) => updateRule(rule.id, { actif: e.target.checked })}
                    />
                    Règle active
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Conditions d&apos;application</p>
                  <SpConditionEditor
                    groupes={rule.groupes_conditions ?? []}
                    logiqueRacine={rule.logique_declencheur ?? 'ET'}
                    onChange={(groupes, logique: SpConditionLogique) => updateRule(rule.id, {
                      groupes_conditions: groupes,
                      logique_declencheur: logique,
                    })}
                    otherQuestions={questions}
                    catalogueProduits={products}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Produits concernés</p>
                  <p className="text-xs text-gray-500">Si aucun produit n&apos;est coché, la règle cible tous les produits mensuels avec une remise.</p>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                    {monthlyDiscountProducts.map((product) => {
                      const selected = rule.produits_ids?.includes(product.id) ?? false;
                      return (
                        <label key={product.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleProduct(rule, product.id)}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium text-gray-800 truncate">{product.nom}</span>
                            <span className="block text-xs text-gray-500">
                              {product.prix_mensuel?.toFixed(2).replace('.', ',')} €/mois → {formatDiscount(product)}
                              <span className="ml-2 text-green-600 font-medium">{formatDiscountLabel(product)}</span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {monthlyDiscountProducts.length === 0 && (
                      <div className="px-3 py-4 text-sm text-gray-400">Aucun produit mensuel avec remise.</div>
                    )}
                  </div>
                </div>

                {scopedProducts.length > 0 && (
                  <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                    Aperçu : {scopedProducts.length} produit(s) pourront être proposés à tarif remisé si les conditions sont vraies et validées dans le SP.
                  </div>
                )}

                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => removeRule(rule.id)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Supprimer
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
