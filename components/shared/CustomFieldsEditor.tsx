'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { toSnakeCaseKey } from '@/lib/utils/formatting';
import {
  ARRAY_FIELDS,
  getCategoryLabelForSecteur,
  getFieldsByCategoryForSecteur,
} from '@/components/admin/organizationFormConfig';

export type CustomFieldType = 'simple' | 'array';

export type CustomCategory = {
  id: string;
  label: string;
};

export type CustomArrayCategory = {
  id: string;
  label: string;
};

export type CustomFieldDefinition = {
  label: string;
  fieldPath: string;
  fieldType: CustomFieldType;
  categoryId: string;
  key: string;
  arrayId?: string;
};

interface Props {
  secteur: string;
  activeMerges: string[];
  selectedCategory: string;
  reservedFieldPaths: string[];

  customFieldDefinitions: CustomFieldDefinition[];
  legacyCustomFields: string[];
  customCategories: CustomCategory[];
  customArrayCategories: CustomArrayCategory[];

  onChange: (next: {
    customFieldDefinitions: CustomFieldDefinition[];
    legacyCustomFields: string[];
    customCategories: CustomCategory[];
    customArrayCategories: CustomArrayCategory[];
  }) => void;
}

export function CustomFieldsEditor({
  secteur,
  activeMerges,
  selectedCategory,
  reservedFieldPaths,
  customFieldDefinitions,
  legacyCustomFields,
  customCategories,
  customArrayCategories,
  onChange,
}: Props) {
  const [newCustomLabel, setNewCustomLabel] = useState<string>('');
  const [newCustomType, setNewCustomType] = useState<CustomFieldType>('simple');
  const [newCustomCategoryMode, setNewCustomCategoryMode] = useState<'existing' | 'new'>('existing');
  const [newCustomCategoryId, setNewCustomCategoryId] = useState<string>('client');
  const [newCustomCategoryLabel, setNewCustomCategoryLabel] = useState<string>('');

  const [newCustomArrayMode, setNewCustomArrayMode] = useState<'existing' | 'new'>('existing');
  const [newCustomArrayId, setNewCustomArrayId] = useState<string>('lignes_mobiles');
  const [newCustomArrayLabel, setNewCustomArrayLabel] = useState<string>('');

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const arrayCategoryIds = useMemo(() => {
    const fromConfig = (((ARRAY_FIELDS as any)[secteur] || []) as any[])
      .map((a: any) => (a && typeof a.id === 'string' ? a.id : null))
      .filter(Boolean);
    return new Set<string>([...fromConfig, 'lignes']);
  }, [secteur]);

  const fieldsByCategory = useMemo(() => {
    return getFieldsByCategoryForSecteur(secteur);
  }, [secteur]);

  const builtInNonArrayCategoryIds = useMemo(() => {
    return Object.keys(fieldsByCategory).filter((cat) => !arrayCategoryIds.has(cat));
  }, [arrayCategoryIds]);

  useEffect(() => {
    if (newCustomType !== 'simple' || newCustomCategoryMode !== 'existing') return;
    if (!builtInNonArrayCategoryIds.includes(newCustomCategoryId)) {
      setNewCustomCategoryId(builtInNonArrayCategoryIds.includes('client') ? 'client' : (builtInNonArrayCategoryIds[0] || 'client'));
    }
  }, [newCustomType, newCustomCategoryMode, newCustomCategoryId, builtInNonArrayCategoryIds]);

  const generatedKey = useMemo(() => {
    const label = newCustomLabel.trim();
    return label ? toSnakeCaseKey(label) : '';
  }, [newCustomLabel]);

  const generatedArrayId = useMemo(() => {
    const label = newCustomArrayLabel.trim();
    return label ? toSnakeCaseKey(label) : '';
  }, [newCustomArrayLabel]);

  const canAdd = useMemo(() => {
    if (!newCustomLabel.trim()) return false;
    if (newCustomType === 'simple' && newCustomCategoryMode === 'new' && !newCustomCategoryLabel.trim()) return false;
    if (newCustomType === 'array' && newCustomArrayMode === 'new' && !newCustomArrayLabel.trim()) return false;
    return true;
  }, [newCustomLabel, newCustomType, newCustomCategoryMode, newCustomCategoryLabel, newCustomArrayMode, newCustomArrayLabel]);

  const addCustomField = () => {
    const label = newCustomLabel.trim();
    if (!label) return;

    const key = toSnakeCaseKey(label);
    if (!key) return;

    let nextCategories = [...customCategories];
    let nextArrayCategories = [...customArrayCategories];

    let categoryId = newCustomCategoryId;

    if (newCustomType === 'simple' && newCustomCategoryMode === 'new') {
      const newCatLabel = newCustomCategoryLabel.trim();
      if (!newCatLabel) return;
      const newId = toSnakeCaseKey(newCatLabel);
      if (!newId) return;

      const alreadyExists = nextCategories.some((c) => c.id === newId);
      if (!alreadyExists) {
        nextCategories.push({ id: newId, label: newCatLabel });
      }
      categoryId = newId;
    }

    let fieldPath = key;
    let arrayId: string | undefined;

    if (newCustomType === 'simple') {
      const isBuiltInCategory = Object.prototype.hasOwnProperty.call(fieldsByCategory, categoryId);
      if (categoryId === 'client') {
        fieldPath = `client.${key}`;
      } else if (!isBuiltInCategory) {
        fieldPath = `${categoryId}.${key}`;
      }
    } else {
      let selectedArrayId = newCustomArrayId;

      if (newCustomArrayMode === 'new') {
        const arrLabel = newCustomArrayLabel.trim();
        if (!arrLabel) return;
        const newArrId = toSnakeCaseKey(arrLabel);
        if (!newArrId) return;

        const exists = nextArrayCategories.some((c) => c.id === newArrId);
        if (!exists) {
          nextArrayCategories = [...nextArrayCategories, { id: newArrId, label: arrLabel }];
        }
        selectedArrayId = newArrId;
      }

      const effectiveArrayId = activeMerges.length >= 2 && activeMerges.includes(selectedArrayId) ? 'lignes' : selectedArrayId;

      arrayId = effectiveArrayId;
      fieldPath = `${effectiveArrayId}[].${key}`;
      categoryId = effectiveArrayId;
    }

    const existingAll = new Set([
      ...reservedFieldPaths,
      ...customFieldDefinitions.map((d) => d.fieldPath),
      ...legacyCustomFields,
    ]);
    if (existingAll.has(fieldPath)) return;

    const nextDefs: CustomFieldDefinition[] = [
      ...customFieldDefinitions,
      {
        label,
        fieldPath,
        fieldType: newCustomType,
        categoryId,
        key,
        arrayId,
      },
    ];

    onChange({
      customFieldDefinitions: nextDefs,
      legacyCustomFields,
      customCategories: nextCategories,
      customArrayCategories: nextArrayCategories,
    });

    setNewCustomLabel('');
    setNewCustomCategoryLabel('');
    setNewCustomArrayLabel('');
    setNewCustomArrayMode('existing');
    setNewCustomType('simple');
  };

  const removeCustomField = (fieldPath: string) => {
    const nextDefs = customFieldDefinitions.filter((d) => d.fieldPath !== fieldPath);
    onChange({
      customFieldDefinitions: nextDefs,
      legacyCustomFields,
      customCategories,
      customArrayCategories,
    });
  };

  const removeLegacyCustomField = (fieldPath: string) => {
    const nextLegacy = legacyCustomFields.filter((f) => f !== fieldPath);
    onChange({
      customFieldDefinitions,
      legacyCustomFields: nextLegacy,
      customCategories,
      customArrayCategories,
    });
  };

  const filteredCustomDefs = useMemo(() => {
    return customFieldDefinitions.filter((def) => selectedCategory === 'all' || def.categoryId === selectedCategory);
  }, [customFieldDefinitions, selectedCategory]);

  const filteredLegacy = useMemo(() => {
    return legacyCustomFields.filter(
      (fieldPath) => selectedCategory === 'all' || fieldPath.startsWith(`${selectedCategory}.`)
    );
  }, [legacyCustomFields, selectedCategory]);

  const arrayLabelsById = useMemo(() => {
    const map = new Map<string, string>();
    (((ARRAY_FIELDS as any)[secteur] || []) as any[]).forEach((a: any) => {
      if (a && typeof a.id === 'string') map.set(a.id, (a.label as string) || a.id);
    });
    customArrayCategories.forEach((a) => map.set(a.id, a.label));
    map.set('lignes', getCategoryLabelForSecteur(secteur, 'lignes'));
    return map;
  }, [customArrayCategories, secteur]);

  const simpleCategoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    Object.keys(fieldsByCategory).forEach((cat) =>
      map.set(cat, getCategoryLabelForSecteur(secteur, cat))
    );
    customCategories.forEach((c) => map.set(c.id, c.label));
    return map;
  }, [customCategories, fieldsByCategory, secteur]);

  const normalizedLegacyCategoryId = (fieldPath: string) => {
    const first = fieldPath.split('.')[0] || 'autres';
    return first.replace(/\[\]$/, '');
  };

  const groupedItems = useMemo(() => {
    type Item =
      | { kind: 'def'; def: CustomFieldDefinition }
      | { kind: 'legacy'; fieldPath: string };

    const groupOrder: string[] = [];
    const groups = new Map<
      string,
      {
        id: string;
        label: string;
        count: number;
        items: Item[];
      }
    >();

    const ensureGroup = (id: string, label: string) => {
      const existing = groups.get(id);
      if (existing) return existing;
      const next = { id, label, count: 0, items: [] as Item[] };
      groups.set(id, next);
      groupOrder.push(id);
      return next;
    };

    filteredCustomDefs.forEach((def) => {
      const id = def.categoryId || 'autres';
      const label = def.fieldType === 'array'
        ? (arrayLabelsById.get(id) || id)
        : (simpleCategoryLabelById.get(id) || id);
      const g = ensureGroup(id, label);
      g.items.push({ kind: 'def', def });
      g.count += 1;
    });

    filteredLegacy.forEach((fieldPath) => {
      const id = normalizedLegacyCategoryId(fieldPath);
      const label = arrayLabelsById.get(id) || simpleCategoryLabelById.get(id) || id;
      const g = ensureGroup(id, label);
      g.items.push({ kind: 'legacy', fieldPath });
      g.count += 1;
    });

    return groupOrder.map((id) => groups.get(id)!).filter(Boolean);
  }, [arrayLabelsById, filteredCustomDefs, filteredLegacy, simpleCategoryLabelById]);

  const copyFieldPath = async (fieldPath: string) => {
    try {
      await navigator.clipboard.writeText(fieldPath);
    } catch {
      // Fallback silencieux
      const el = document.createElement('textarea');
      el.value = fieldPath;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div className="border-t pt-6">
      <h3 className="font-semibold text-gray-900 mb-4">Champs personnalisés</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Libellé</label>
          <input
            type="text"
            value={newCustomLabel}
            onChange={(e) => setNewCustomLabel(e.target.value)}
            placeholder="Ex: numéro de ligne fibre"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={newCustomType}
            onChange={(e) => setNewCustomType(e.target.value as CustomFieldType)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="simple">Champ simple</option>
            <option value="array">Champ tableau</option>
          </select>
        </div>

        {newCustomType === 'simple' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
              <select
                value={newCustomCategoryMode}
                onChange={(e) => setNewCustomCategoryMode(e.target.value as 'existing' | 'new')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="existing">Catégorie existante</option>
                <option value="new">Nouvelle catégorie</option>
              </select>
            </div>

            {newCustomCategoryMode === 'existing' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Choix</label>
                <select
                  value={newCustomCategoryId}
                  onChange={(e) => setNewCustomCategoryId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  {builtInNonArrayCategoryIds.map((cat) => (
                    <option key={cat} value={cat}>
                      {getCategoryLabelForSecteur(secteur, cat)}
                    </option>
                  ))}
                  {customCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la catégorie</label>
                <input
                  type="text"
                  value={newCustomCategoryLabel}
                  onChange={(e) => setNewCustomCategoryLabel(e.target.value)}
                  placeholder="Ex: Fibre"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tableau</label>
            <select
              value={newCustomArrayMode}
              onChange={(e) => setNewCustomArrayMode(e.target.value as 'existing' | 'new')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-2"
            >
              <option value="existing">Tableau existant</option>
              <option value="new">Nouveau tableau</option>
            </select>

            {newCustomArrayMode === 'new' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du tableau</label>
                <input
                  type="text"
                  value={newCustomArrayLabel}
                  onChange={(e) => setNewCustomArrayLabel(e.target.value)}
                  placeholder="Ex: Équipements optionnels"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <div className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <div className="font-medium text-gray-700">ID du tableau</div>
                  <div className="font-mono">{generatedArrayId}</div>
                </div>
              </div>
            ) : (
              <select
                value={newCustomArrayId}
                onChange={(e) => setNewCustomArrayId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                {(((ARRAY_FIELDS as any)[secteur] || []) as any[]).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.label || a.id}
                  </option>
                ))}
                {customArrayCategories.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="md:col-span-2">
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="font-medium text-gray-700">Clé générée</div>
            <div className="font-mono">{generatedKey}</div>
          </div>
        </div>

        <div className="md:col-span-2">
          <button
            type="button"
            onClick={addCustomField}
            disabled={!canAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {groupedItems.map((group) => {
          const isCollapsed = Boolean(collapsedGroups[group.id]);

          return (
            <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((prev) => ({
                    ...prev,
                    [group.id]: !prev[group.id],
                  }))
                }
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">{group.label}</div>
                  <span className="text-xs text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                    {group.count}
                  </span>
                </div>
                <span className="text-xs text-gray-600">{isCollapsed ? 'Afficher' : 'Masquer'}</span>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-gray-100">
                  {group.items.map((item) => {
                    if (item.kind === 'def') {
                      const def = item.def;
                      const categoryLabel = def.fieldType === 'array'
                        ? (arrayLabelsById.get(def.categoryId) || def.categoryId)
                        : (simpleCategoryLabelById.get(def.categoryId) || def.categoryId);

                      return (
                        <div
                          key={def.fieldPath}
                          className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="font-medium text-gray-900 truncate">{def.label}</div>
                              <span
                                className={
                                  def.fieldType === 'array'
                                    ? 'text-[11px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5'
                                    : 'text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5'
                                }
                              >
                                {def.fieldType === 'array' ? 'Tableau' : 'Simple'}
                              </span>
                              <span className="text-[11px] bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 truncate max-w-[160px]">
                                {categoryLabel}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 font-mono truncate">{def.fieldPath}</div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => copyFieldPath(def.fieldPath)}
                              title="Copier le chemin"
                              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition px-2 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCustomField(def.fieldPath)}
                              title="Supprimer"
                              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const fieldPath = item.fieldPath;
                    const legacyCatId = normalizedLegacyCategoryId(fieldPath);
                    const legacyLabel = arrayLabelsById.get(legacyCatId) || simpleCategoryLabelById.get(legacyCatId) || legacyCatId;
                    const isArrayLegacy = fieldPath.includes('[]');

                    return (
                      <div
                        key={fieldPath}
                        className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{fieldPath}</div>
                            <span
                              className={
                                isArrayLegacy
                                  ? 'text-[11px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5'
                                  : 'text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5'
                              }
                            >
                              {isArrayLegacy ? 'Tableau' : 'Simple'}
                            </span>
                            <span className="text-[11px] bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 truncate max-w-[160px]">
                              {legacyLabel}
                            </span>
                            <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5">
                              Legacy
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 font-mono truncate">{fieldPath}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => copyFieldPath(fieldPath)}
                            title="Copier le chemin"
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition px-2 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLegacyCustomField(fieldPath)}
                            title="Supprimer"
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {groupedItems.length === 0 && (
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Aucun champ personnalisé.
          </div>
        )}
      </div>
    </div>
  );
}
