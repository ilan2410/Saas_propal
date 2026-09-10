'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Info, ListOrdered, Plus, RotateCcw, Search, Table2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supportsSp } from '@/lib/templates/supportsSp';
import {
  SP_SORTABLE_TABLE_IDS,
  SP_SORTABLE_TABLE_LABELS,
} from '@/lib/sp/productTableOrder';
import type {
  CatalogueProduit,
  PropositionTemplate,
  SpCategorie,
  SpSortableTableId,
  SpTableProductOrders,
  WordConfig,
} from '@/types';

const DEFAULT_ORDER: SpCategorie[] = ['internet', 'fixe', 'mobile'];

const LABELS: Record<SpCategorie, string> = {
  internet: 'Internet (fibre, satellite, backup 4G…)',
  fixe: 'Fixe / opérateur (E-standard, lignes fixes, fax…)',
  mobile: 'Mobile (forfaits, lignes data…)',
};

interface Props {
  templates: PropositionTemplate[];
}

type OrderSection = 'categories' | 'tables';

function CategoriesOrderSection() {
  const [order, setOrder] = useState<SpCategorie[]>(DEFAULT_ORDER);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/settings/preferences')
      .then((r) => r.json())
      .then((data) => {
        const saved: SpCategorie[] | undefined = data.preferences?.sp_categories_order;
        if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length) setOrder(saved);
      })
      .catch(() => toast.error('Erreur lors du chargement'))
      .finally(() => setIsLoading(false));
  }, []);

  const move = (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= order.length) return;
    const next = [...order];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setOrder(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp_categories_order: order }),
      });
      if (!response.ok) throw new Error('Erreur');
      toast.success('Ordre des catégories enregistré');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-gray-600">
        Définit l&apos;ordre général des catégories Internet, Fixe et Mobile dans les tableaux de la proposition.
        Ce réglage s&apos;applique à toute l&apos;organisation.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {order.map((categorie, index) => (
            <div key={categorie} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {index + 1}
              </span>
              <span className="flex-1 text-sm text-gray-900">{LABELS[categorie]}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, 'up')}
                  disabled={index === 0}
                  aria-label={`Monter ${LABELS[categorie]}`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 'down')}
                  disabled={index === order.length - 1}
                  aria-label={`Descendre ${LABELS[categorie]}`}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
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

function isProductEligible(tableId: SpSortableTableId, product: CatalogueProduit): boolean {
  const isTelecom = ['internet', 'fixe', 'mobile'].includes(product.categorie);
  if (tableId === 'sp_situation_proposee_forfaits') return isTelecom && product.type_frequence === 'mensuel';
  if (tableId === 'sp_situation_proposee_complet') {
    return (isTelecom && product.type_frequence === 'mensuel') || (!isTelecom && product.categorie !== 'cadeau');
  }
  if (tableId === 'sp_bdc_operateur_table' || tableId === 'sp_bdc_operateur_numeros_table') {
    return ['fixe', 'mobile'].includes(product.categorie)
      && product.type_frequence === 'mensuel'
      && product.destinations?.bdc_operateur !== false;
  }
  if (tableId === 'sp_bdc_internet_table') {
    return product.categorie === 'internet'
      && product.type_frequence === 'mensuel'
      && product.destinations?.bdc_operateur !== false;
  }
  return !isTelecom
    && product.categorie !== 'cadeau'
    && (tableId !== 'sp_bdc_materiel_table' || product.destinations?.bdc_materiel !== false);
}

function ProductPositionInput({
  position,
  maximum,
  productName,
  onMove,
}: {
  position: number;
  maximum: number;
  productName: string;
  onMove: (position: number) => void;
}) {
  const commit = (input: HTMLInputElement) => {
    const next = Number.parseInt(input.value, 10);
    if (Number.isFinite(next)) onMove(Math.min(maximum, Math.max(1, next)));
    else input.value = String(position);
  };

  return (
    <input
      type="number"
      min={1}
      max={maximum}
      defaultValue={position}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.currentTarget.value = String(position);
          event.currentTarget.blur();
        }
      }}
      aria-label={`Position de ${productName}`}
      title="Saisir une position puis appuyer sur Entrée"
      className="h-7 w-12 rounded-md border border-gray-200 bg-gray-50 px-1 text-center text-xs font-semibold tabular-nums text-gray-700 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
    />
  );
}

function ProductTablesOrderSection({ templates }: Props) {
  const compatibleTemplates = useMemo(() => templates.filter((template) => supportsSp(template.file_type)), [templates]);
  const [templateId, setTemplateId] = useState(compatibleTemplates[0]?.id ?? '');
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [orders, setOrders] = useState<SpTableProductOrders>({});
  const [liveFileConfig, setLiveFileConfig] = useState<WordConfig | null>(null);
  const [tableToAdd, setTableToAdd] = useState<SpSortableTableId | ''>('');
  const [expandedTable, setExpandedTable] = useState<SpSortableTableId | null>(null);
  const [searchByTable, setSearchByTable] = useState<Partial<Record<SpSortableTableId, string>>>({});
  const [draggedProduct, setDraggedProduct] = useState<{ tableId: SpSortableTableId; productId: string } | null>(null);
  const [isCatalogueLoading, setIsCatalogueLoading] = useState(true);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (compatibleTemplates.some((template) => template.id === templateId)) return;
    setTemplateId(compatibleTemplates[0]?.id ?? '');
  }, [compatibleTemplates, templateId]);

  useEffect(() => {
    let cancelled = false;
    setIsCatalogueLoading(true);
    fetch('/api/catalogue')
      .then((response) => {
        if (!response.ok) throw new Error('Erreur catalogue');
        return response.json();
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data?.produits)) {
          setCatalogue((data.produits as CatalogueProduit[]).filter((product) => product.actif));
        }
      })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger le catalogue'); })
      .finally(() => { if (!cancelled) setIsCatalogueLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!templateId) {
      setOrders({});
      setLiveFileConfig(null);
      setExpandedTable(null);
      return;
    }
    let cancelled = false;
    setIsTemplateLoading(true);
    setTableToAdd('');
    setExpandedTable(null);
    setSearchByTable({});
    fetch(`/api/templates/${templateId}`)
      .then((response) => {
        if (!response.ok) throw new Error('Erreur template');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const config = (data?.template?.file_config ?? {}) as WordConfig;
        const savedOrders = config.sp_table_product_orders ?? {};
        setLiveFileConfig(config);
        setOrders(savedOrders);
        setExpandedTable(SP_SORTABLE_TABLE_IDS.find((tableId) => Array.isArray(savedOrders[tableId])) ?? null);
      })
      .catch(() => { if (!cancelled) toast.error('Impossible de charger la configuration du template'); })
      .finally(() => { if (!cancelled) setIsTemplateLoading(false); });
    return () => { cancelled = true; };
  }, [templateId]);

  const configuredTables = SP_SORTABLE_TABLE_IDS.filter((tableId) => Array.isArray(orders[tableId]));
  const availableTables = SP_SORTABLE_TABLE_IDS.filter((tableId) => !configuredTables.includes(tableId));

  const eligibleProducts = (tableId: SpSortableTableId) => catalogue.filter((product) => isProductEligible(tableId, product));

  const resolvedOrder = (tableId: SpSortableTableId) => {
    const eligible = eligibleProducts(tableId);
    const eligibleIds = new Set(eligible.map((product) => product.id));
    const saved = (orders[tableId] ?? []).filter((id) => eligibleIds.has(id));
    const savedIds = new Set(saved);
    return [...saved, ...eligible.map((product) => product.id).filter((id) => !savedIds.has(id))];
  };

  const addTable = () => {
    if (!tableToAdd) return;
    const addedTable = tableToAdd;
    setOrders((current) => ({ ...current, [addedTable]: eligibleProducts(addedTable).map((product) => product.id) }));
    setExpandedTable(addedTable);
    setTableToAdd('');
  };

  const removeTable = (tableId: SpSortableTableId) => {
    setOrders((current) => {
      const next = { ...current };
      delete next[tableId];
      return next;
    });
    if (expandedTable === tableId) setExpandedTable(null);
  };

  const resetTable = (tableId: SpSortableTableId) => {
    setOrders((current) => ({ ...current, [tableId]: eligibleProducts(tableId).map((product) => product.id) }));
  };

  const moveProductToIndex = (tableId: SpSortableTableId, productId: string, targetIndex: number) => {
    const order = resolvedOrder(tableId);
    const currentIndex = order.indexOf(productId);
    if (currentIndex < 0) return;
    const boundedIndex = Math.min(order.length - 1, Math.max(0, targetIndex));
    if (currentIndex === boundedIndex) return;
    order.splice(currentIndex, 1);
    order.splice(boundedIndex, 0, productId);
    setOrders((current) => ({ ...current, [tableId]: order }));
  };

  const moveProduct = (tableId: SpSortableTableId, index: number, direction: 'up' | 'down') => {
    const order = resolvedOrder(tableId);
    const productId = order[index];
    if (!productId) return;
    moveProductToIndex(tableId, productId, direction === 'up' ? index - 1 : index + 1);
  };

  const dropProduct = (tableId: SpSortableTableId, targetProductId: string) => {
    if (!draggedProduct || draggedProduct.tableId !== tableId) return;
    const targetIndex = resolvedOrder(tableId).indexOf(targetProductId);
    moveProductToIndex(tableId, draggedProduct.productId, targetIndex);
    setDraggedProduct(null);
  };

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const normalizedOrders = Object.fromEntries(
        configuredTables.map((tableId) => [tableId, resolvedOrder(tableId)]),
      ) as SpTableProductOrders;
      const newFileConfig: WordConfig = {
        ...(liveFileConfig ?? { formatVariables: '', fieldMappings: {} }),
        sp_table_product_orders: normalizedOrders,
      };
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!response.ok) throw new Error('Erreur serveur');
      const data = await response.json();
      const updatedConfig = (data?.template?.file_config ?? newFileConfig) as WordConfig;
      setLiveFileConfig(updatedConfig);
      setOrders(updatedConfig.sp_table_product_orders ?? normalizedOrders);
      toast.success('Ordre des produits enregistré pour ce template');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (compatibleTemplates.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-sm text-amber-900">Aucun template Word ou Excel compatible avec la Situation Proposée.</p>
      </div>
    );
  }

  const productById = new Map(catalogue.map((product) => [product.id, product]));
  const isLoading = isCatalogueLoading || isTemplateLoading;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label htmlFor="product-order-template" className="text-sm font-medium text-gray-800">Template</label>
        <select
          id="product-order-template"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className="block h-9 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {compatibleTemplates.map((template) => (
            <option key={template.id} value={template.id}>{template.nom} ({template.file_type === 'excel' ? 'Excel' : 'Word'})</option>
          ))}
        </select>
        <p className="max-w-3xl text-sm text-gray-600">
          Chaque template conserve ses propres ordres. Sans configuration, Word et Excel gardent l&apos;ordre actuel des produits.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement de la configuration…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full max-w-md space-y-1.5">
              <label htmlFor="table-to-add" className="text-sm font-medium text-gray-800">Variable tableau</label>
              <select
                id="table-to-add"
                value={tableToAdd}
                onChange={(event) => setTableToAdd(event.target.value as SpSortableTableId | '')}
                disabled={availableTables.length === 0}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">{availableTables.length === 0 ? 'Tous les tableaux sont configurés' : 'Sélectionner un tableau'}</option>
                {availableTables.map((tableId) => (
                  <option key={tableId} value={tableId}>{SP_SORTABLE_TABLE_LABELS[tableId]} — {tableId}</option>
                ))}
              </select>
            </div>
            <Button type="button" variant="outline" onClick={addTable} disabled={!tableToAdd}>
              <Plus className="h-4 w-4" />
              Ajouter le tableau
            </Button>
          </div>

          {configuredTables.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center">
              <Table2 className="mx-auto h-6 w-6 text-gray-400" />
              <p className="mt-3 text-sm font-medium text-gray-800">Aucun ordre personnalisé</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
                Sélectionnez une variable tableau pour organiser l&apos;ordre de ses produits dans ce template.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {configuredTables.map((tableId) => {
                const productIds = resolvedOrder(tableId);
                const isExpanded = expandedTable === tableId;
                const search = searchByTable[tableId] ?? '';
                const normalizedSearch = search.trim().toLocaleLowerCase('fr');
                const displayedProductIds = normalizedSearch
                  ? productIds.filter((productId) => {
                      const product = productById.get(productId);
                      return product
                        ? [product.nom, product.categorie, product.fournisseur]
                            .filter(Boolean)
                            .some((value) => value!.toLocaleLowerCase('fr').includes(normalizedSearch))
                        : false;
                    })
                  : productIds;
                const contentId = `product-order-${tableId}`;

                return (
                  <section key={tableId} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className={`flex flex-col gap-3 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${isExpanded ? 'border-b border-gray-200' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedTable(isExpanded ? null : tableId)}
                        aria-expanded={isExpanded}
                        aria-controls={contentId}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{SP_SORTABLE_TABLE_LABELS[tableId]}</span>
                          <span className="mt-0.5 block truncate text-xs text-gray-600">{tableId}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-medium tabular-nums text-gray-600 ring-1 ring-gray-200">
                          {productIds.length} produit{productIds.length > 1 ? 's' : ''}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => resetTable(tableId)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Ordre du catalogue
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTable(tableId)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div id={contentId}>
                        {productIds.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-gray-600">Aucun produit du catalogue n&apos;est éligible pour ce tableau.</p>
                        ) : (
                          <>
                            <div className="flex flex-col gap-2 border-b border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="relative w-full max-w-md">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="search"
                                  value={search}
                                  onChange={(event) => setSearchByTable((current) => ({ ...current, [tableId]: event.target.value }))}
                                  placeholder="Rechercher un produit…"
                                  aria-label={`Rechercher dans ${SP_SORTABLE_TABLE_LABELS[tableId]}`}
                                  className="h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                                {search && (
                                  <button
                                    type="button"
                                    onClick={() => setSearchByTable((current) => ({ ...current, [tableId]: '' }))}
                                    aria-label="Effacer la recherche"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-gray-600">
                                Glissez une ligne ou saisissez directement sa position.
                              </p>
                            </div>

                            {displayedProductIds.length === 0 ? (
                              <div className="px-4 py-8 text-center">
                                <p className="text-sm font-medium text-gray-800">Aucun produit trouvé</p>
                                <p className="mt-1 text-xs text-gray-600">Essayez un autre nom, fournisseur ou catégorie.</p>
                              </div>
                            ) : (
                              <ol className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                                {displayedProductIds.map((productId) => {
                                  const product = productById.get(productId);
                                  if (!product) return null;
                                  const index = productIds.indexOf(productId);
                                  const isDragging = draggedProduct?.tableId === tableId && draggedProduct.productId === productId;
                                  return (
                                    <li
                                      key={productId}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={() => dropProduct(tableId, productId)}
                                      className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${isDragging ? 'bg-blue-50 opacity-60' : 'bg-white hover:bg-gray-50'}`}
                                    >
                                      <span
                                        draggable
                                        onDragStart={() => setDraggedProduct({ tableId, productId })}
                                        onDragEnd={() => setDraggedProduct(null)}
                                        title={`Déplacer ${product.nom}`}
                                        className="shrink-0 cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
                                      >
                                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                                      </span>
                                      <ProductPositionInput
                                        key={`${productId}-${index}`}
                                        position={index + 1}
                                        maximum={productIds.length}
                                        productName={product.nom}
                                        onMove={(position) => moveProductToIndex(tableId, productId, position - 1)}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-900" title={product.nom}>{product.nom}</p>
                                        <p className="truncate text-xs text-gray-600">
                                          {product.categorie}{product.fournisseur ? ` · ${product.fournisseur}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => moveProduct(tableId, index, 'up')}
                                          disabled={index === 0}
                                          aria-label={`Monter ${product.nom}`}
                                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
                                        >
                                          <ArrowUp className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => moveProduct(tableId, index, 'down')}
                                          disabled={index === productIds.length - 1}
                                          aria-label={`Descendre ${product.nom}`}
                                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
                                        >
                                          <ArrowDown className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end border-t border-gray-200 pt-4">
        <Button onClick={handleSave} disabled={isSaving || isLoading || !templateId}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer pour ce template'}
        </Button>
      </div>
    </div>
  );
}

export function SpCategoriesOrderManager({ templates }: Props) {
  const [section, setSection] = useState<OrderSection>('categories');

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Ordre d’affichage">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'categories'}
          onClick={() => setSection('categories')}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            section === 'categories' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ListOrdered className="h-4 w-4" />
          Ordre des catégories
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'tables'}
          onClick={() => setSection('tables')}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            section === 'tables' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Table2 className="h-4 w-4" />
          Produits dans les tableaux
        </button>
      </div>

      {section === 'categories'
        ? <CategoriesOrderSection />
        : <ProductTablesOrderSection templates={templates} />}
    </div>
  );
}
