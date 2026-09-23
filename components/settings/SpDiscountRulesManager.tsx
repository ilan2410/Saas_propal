'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SpConditionEditor } from './SpConditionEditor';
import { calculerPrixRemiseProduit, resolveRemiseProduit } from '@/lib/sp/evaluateDiscountRules';
import { supportsSp } from '@/lib/templates/supportsSp';
import type {
  CatalogueProduit,
  PropositionTemplate,
  SpConditionLogique,
  SpConfigRemises,
  SpQuestion,
  SpRegleRemise,
  SpRemiseProduitTemplate,
  WordConfig,
} from '@/types';

interface Props {
  templates: PropositionTemplate[];
  fallbackRules: SpRegleRemise[];
  products: CatalogueProduit[];
  questions: SpQuestion[];
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

function getConfig(template: PropositionTemplate | undefined, fallbackRules: SpRegleRemise[]): SpConfigRemises {
  const fileConfig = template?.file_config as WordConfig | undefined;
  const saved = fileConfig?.sp_config_remises;
  return saved
    ? { actif: saved.actif ?? true, produits: { ...saved.produits }, regles: saved.regles ?? fallbackRules }
    : { actif: true, produits: {}, regles: fallbackRules };
}

function formatPrice(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(2).replace('.', ',')} €/mois`;
}

export function SpDiscountRulesManager({ templates, fallbackRules, products, questions }: Props) {
  const wordTemplates = templates.filter((template) => supportsSp(template.file_type));
  const [templateId, setTemplateId] = useState(wordTemplates[0]?.id ?? '');
  const [config, setConfig] = useState<SpConfigRemises>(() => getConfig(wordTemplates[0], fallbackRules));
  const [savedConfigs, setSavedConfigs] = useState<Record<string, SpConfigRemises>>({});
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(config.regles[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [productToAdd, setProductToAdd] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate = wordTemplates.find((template) => template.id === templateId);
  const templateQuestions = questions.filter((question) => question.template_id === templateId);
  const monthlyProducts = useMemo(
    () => products
      .filter((product) => product.actif && product.type_frequence === 'mensuel')
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [products],
  );
  const configuredProducts = monthlyProducts.filter(
    (product) => product.remise_valeur != null || config.produits[product.id] != null,
  );
  const availableProducts = monthlyProducts.filter(
    (product) => product.remise_valeur == null && config.produits[product.id] == null,
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleProducts = normalizedSearch
    ? configuredProducts.filter((product) => [product.nom, product.fournisseur].some((value) => value?.toLowerCase().includes(normalizedSearch)))
    : configuredProducts;
  const effectiveDiscountProducts = monthlyProducts
    .map((product) => resolveRemiseProduit(product, config))
    .filter((product) => calculerPrixRemiseProduit(product) != null);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const template = wordTemplates.find((item) => item.id === id);
    const next = savedConfigs[id] ?? getConfig(template, fallbackRules);
    setConfig(next);
    setExpandedRuleId(next.regles[0]?.id ?? null);
    setSearch('');
    setIsAddingProduct(false);
    setProductToAdd('');
  };

  const updateProduct = (product: CatalogueProduit, patch: Partial<SpRemiseProduitTemplate>) => {
    setConfig((prev) => {
      const current = prev.produits[product.id] ?? { mode: 'catalogue' as const };
      const next = { ...current, ...patch };
      const produits = { ...prev.produits };
      if (next.mode === 'catalogue') delete produits[product.id];
      else produits[product.id] = next;
      return { ...prev, produits };
    });
  };

  const changeProductMode = (product: CatalogueProduit, mode: SpRemiseProduitTemplate['mode']) => {
    if (mode === 'personnalisee') {
      updateProduct(product, {
        mode,
        remise_type: product.remise_type ?? 'pourcentage',
        remise_valeur: product.remise_valeur ?? 0,
      });
    } else {
      updateProduct(product, { mode });
    }
  };

  const addProduct = () => {
    const product = monthlyProducts.find((item) => item.id === productToAdd);
    if (!product) return;
    updateProduct(product, {
      mode: 'personnalisee',
      remise_type: product.remise_type ?? 'pourcentage',
      remise_valeur: product.remise_valeur ?? 0,
    });
    setProductToAdd('');
    setIsAddingProduct(false);
  };

  const removeAddedProduct = (product: CatalogueProduit) => {
    setConfig((prev) => {
      const produits = { ...prev.produits };
      delete produits[product.id];
      return { ...prev, produits };
    });
  };

  const updateRule = (id: string, patch: Partial<SpRegleRemise>) => {
    setConfig((prev) => ({
      ...prev,
      regles: prev.regles.map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }));
  };

  const addRule = () => {
    const rule = emptyRule();
    setConfig((prev) => ({ ...prev, regles: [...prev.regles, rule] }));
    setExpandedRuleId(rule.id);
  };

  const removeRule = (id: string) => {
    setConfig((prev) => {
      const regles = prev.regles.filter((rule) => rule.id !== id);
      setExpandedRuleId(regles[0]?.id ?? null);
      return { ...prev, regles };
    });
  };

  const toggleProduct = (rule: SpRegleRemise, productId: string) => {
    const current = new Set(rule.produits_ids ?? []);
    if (current.has(productId)) current.delete(productId);
    else current.add(productId);
    updateRule(rule.id, { produits_ids: Array.from(current) });
  };

  const handleSave = async () => {
    if (!selectedTemplate || isSaving) return;
    setIsSaving(true);
    try {
      const currentFileConfig = (selectedTemplate.file_config ?? {}) as WordConfig;
      const res = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: { ...currentFileConfig, sp_config_remises: config } }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      setSavedConfigs((prev) => ({ ...prev, [selectedTemplate.id]: config }));
      toast.success('Remises du template enregistrées');
    } catch {
      toast.error('Erreur lors de la sauvegarde des remises');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return <p className="text-sm text-gray-500">Aucun template SP disponible.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700" htmlFor="discount-template">Template :</label>
        <select
          id="discount-template"
          value={templateId}
          onChange={(event) => handleTemplateChange(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          {wordTemplates.map((template) => <option key={template.id} value={template.id}>{template.nom}</option>)}
        </select>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={config.actif}
          onChange={(event) => setConfig((prev) => ({ ...prev, actif: event.target.checked }))}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium text-gray-900">Activer les remises opérateurs pour ce template</span>
          <span className="block text-xs text-gray-500 mt-0.5">Si cette option est désactivée, aucun tarif remisé ne sera proposé pendant le questionnaire.</span>
        </span>
      </label>

      <div className={`space-y-4 ${config.actif ? '' : 'opacity-50 pointer-events-none'}`} aria-disabled={!config.actif}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Tarifs par produit</h3>
            <p className="text-xs text-gray-500 mt-1">Les produits ayant déjà une remise sont affichés automatiquement.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-600">
              <span className="sr-only">Rechercher dans les produits affichés</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher"
                className="w-56 max-w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingProduct((current) => !current)}>
              <Plus className="w-4 h-4 mr-1" />Ajouter un produit
            </Button>
          </div>
        </div>

        {isAddingProduct && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <label className="flex-1 min-w-64 space-y-1 text-xs font-medium text-blue-900">
              <span className="block">Produit à ajouter</span>
              <select
                value={productToAdd}
                onChange={(event) => setProductToAdd(event.target.value)}
                className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm bg-white text-gray-900"
              >
                <option value="">Sélectionner un produit mensuel</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.nom}{product.fournisseur ? ` — ${product.fournisseur}` : ''}</option>
                ))}
              </select>
            </label>
            <Button type="button" size="sm" onClick={addProduct} disabled={!productToAdd}>Ajouter</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsAddingProduct(false); setProductToAdd(''); }}>Annuler</Button>
            {availableProducts.length === 0 && <p className="w-full text-xs text-blue-800">Tous les produits mensuels sont déjà configurés.</p>}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Produit</th>
                <th className="px-3 py-2 text-left font-medium">Prix catalogue</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Valeur</th>
                <th className="px-3 py-2 text-left font-medium">Prix final</th>
                <th className="w-10 px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleProducts.map((product) => {
                const override = config.produits[product.id];
                const mode = override?.mode ?? 'catalogue';
                const effectiveProduct = resolveRemiseProduit(product, config);
                const finalPrice = calculerPrixRemiseProduit(effectiveProduct);
                return (
                  <tr key={product.id}>
                    <td className="px-3 py-2">
                      <span className="block font-medium text-gray-800">{product.nom}</span>
                      <span className="block text-xs text-gray-500">{product.fournisseur || 'Sans opérateur'}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{formatPrice(product.prix_mensuel)}</td>
                    <td className="px-3 py-2">
                      <select
                        value={mode}
                        onChange={(event) => changeProductMode(product, event.target.value as SpRemiseProduitTemplate['mode'])}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        {product.remise_valeur != null && <option value="catalogue">Remise catalogue</option>}
                        <option value="personnalisee">Personnalisée</option>
                        <option value="aucune">Aucune remise</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {mode === 'personnalisee' ? (
                        <select
                          value={override?.remise_type ?? 'pourcentage'}
                          onChange={(event) => updateProduct(product, { remise_type: event.target.value as 'fixe' | 'pourcentage' })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                        >
                          <option value="pourcentage">Pourcentage</option>
                          <option value="fixe">Montant fixe</option>
                        </select>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {mode === 'personnalisee' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={override?.remise_valeur ?? 0}
                            onChange={(event) => updateProduct(product, { remise_valeur: Number(event.target.value) || 0 })}
                            className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm tabular-nums"
                          />
                          <span className="text-xs text-gray-500">{override?.remise_type === 'fixe' ? '€' : '%'}</span>
                        </div>
                      ) : mode === 'catalogue' && product.remise_valeur != null ? (
                        <span className="tabular-nums text-gray-600">{product.remise_valeur}{product.remise_type === 'fixe' ? ' €' : ' %'}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 font-medium tabular-nums text-gray-800">{formatPrice(finalPrice ?? product.prix_mensuel)}</td>
                    <td className="px-3 py-2 text-right">
                      {product.remise_valeur == null && config.produits[product.id] != null && (
                        <button
                          type="button"
                          onClick={() => removeAddedProduct(product)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Retirer ce produit du template"
                          aria-label={`Retirer ${product.nom}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleProducts.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">Aucun produit remisé pour ce template.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Conditions d’application</h3>
            <p className="text-xs text-gray-500 mt-1">Optionnel : sans règle active, les remises sont proposées sans condition.</p>
          </div>
          <Button size="sm" onClick={addRule}><Plus className="w-4 h-4 mr-1" />Ajouter une règle</Button>
        </div>

        {config.regles.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Aucune condition : les remises de ce template seront proposées dès qu’un produit concerné est sélectionné.
          </div>
        )}

        {config.regles.map((rule) => {
          const isExpanded = expandedRuleId === rule.id;
          const selectedCount = rule.produits_ids?.length ?? 0;
          const scopedProducts = selectedCount > 0
            ? effectiveDiscountProducts.filter((product) => rule.produits_ids?.includes(product.id))
            : effectiveDiscountProducts;
          return (
            <div key={rule.id} className="rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{rule.nom}</span>
                    {rule.actif ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactive</span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">{selectedCount > 0 ? `${selectedCount} produit(s) ciblé(s)` : 'Tous les produits remisés éligibles'}</span>
                </span>
                <span className="text-xs text-gray-400">{isExpanded ? 'Réduire' : 'Configurer'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-1 text-xs font-medium text-gray-700">
                      <span className="block">Nom de la règle</span>
                      <input value={rule.nom} onChange={(event) => updateRule(rule.id, { nom: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                      <input type="checkbox" checked={rule.actif} onChange={(event) => updateRule(rule.id, { actif: event.target.checked })} />
                      Règle active
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Conditions d’application</p>
                    <SpConditionEditor
                      groupes={rule.groupes_conditions ?? []}
                      logiqueRacine={rule.logique_declencheur ?? 'ET'}
                      onChange={(groupes, logique: SpConditionLogique) => updateRule(rule.id, { groupes_conditions: groupes, logique_declencheur: logique })}
                      otherQuestions={templateQuestions}
                      catalogueProduits={products}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Produits concernés</p>
                    <p className="text-xs text-gray-500">Si aucun produit n’est coché, la règle cible tous les produits remisés de ce template.</p>
                    <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                      {effectiveDiscountProducts.map((product) => {
                        const selected = rule.produits_ids?.includes(product.id) ?? false;
                        return (
                          <label key={product.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                            <input type="checkbox" checked={selected} onChange={() => toggleProduct(rule, product.id)} />
                            <span className="flex-1 min-w-0">
                              <span className="block font-medium text-gray-800 truncate">{product.nom}</span>
                              <span className="block text-xs text-gray-500">{formatPrice(product.prix_mensuel)} → {formatPrice(calculerPrixRemiseProduit(product))}</span>
                            </span>
                          </label>
                        );
                      })}
                      {effectiveDiscountProducts.length === 0 && <div className="px-3 py-4 text-sm text-gray-400">Aucun produit avec remise pour ce template.</div>}
                    </div>
                  </div>

                  {scopedProducts.length > 0 && (
                    <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                      Aperçu : {scopedProducts.length} produit(s) pourront être proposés à tarif remisé si les conditions sont vraies.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => removeRule(rule.id)}><Trash2 className="w-4 h-4 mr-1" />Supprimer</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Sauvegarde...' : 'Enregistrer les remises du template'}</Button>
      </div>
    </div>
  );
}
