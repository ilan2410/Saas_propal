'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { composedFields, retainExcelCompositionPartStyles, validateExcelMappings, type ExcelComposedMapping } from '@/lib/excel/template-config';
import { Trash2, FileSpreadsheet, Check, Table2, Plus } from 'lucide-react';
import { ExcelCellMapper } from './ExcelCellMapper';
import { ExcelFieldStyleEditor } from './ExcelFieldStyleEditor';
import { ExcelCompositionPartStylesEditor } from './ExcelCompositionPartStylesEditor';
import { ExcelArrayMapper, ArrayMapping } from './ExcelArrayMapper';
import { ArrayFieldDefinition } from '@/components/admin/organizationFormConfig';
import type { ExcelFieldStyle } from '@/types';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
  formulaCells?: string[];
  merges?: string[];
}

interface SheetMapping {
  sheetName: string;
  mapping: { [fieldName: string]: string | string[] };
  fieldStyles?: Record<string, ExcelFieldStyle>;
}

type MultiSheetFileConfig = {
  multiSheet: true;
  sheetCount: number;
  sheetMappings: SheetMapping[];
  arrayMappings?: ArrayMapping[];
  composedMappings: ExcelComposedMapping[];
};

interface Props {
  sheets: SheetInfo[];
  fields: string[];
  secteur: string;
  spFields?: string[]; // Sous-ensemble de `fields` à regrouper sous la catégorie SP
  spArrayIds?: string[]; // Sous-ensemble d'arrayFields à regrouper sous la section SP
  arrayFields?: ArrayFieldDefinition[]; // Champs de type tableau
  initialMappings?: SheetMapping[];
  initialArrayMappings?: ArrayMapping[];
  initialComposedMappings?: ExcelComposedMapping[];
  onComplete: (sheetMappings: SheetMapping[], fileConfig: MultiSheetFileConfig, isSave?: boolean) => void;
  onBack: () => void;
  onArrayMappingsChange?: (mappings: ArrayMapping[]) => void; // Callback pour sauvegarder les mappings de tableaux
  onSave?: () => void;
  onMappingsChange?: (mappings: SheetMapping[]) => void;
  onComposedMappingsChange?: (mappings: ExcelComposedMapping[]) => void;
  preserveFormulas?: boolean;
  isSaving?: boolean;
}

export function ExcelMultiSheetMapper({
  sheets,
  fields,
  secteur,
  spFields,
  spArrayIds,
  arrayFields = [],
  initialMappings,
  initialArrayMappings,
  initialComposedMappings,
  onComplete,
  onBack,
  onArrayMappingsChange,
  onSave,
  onMappingsChange,
  onComposedMappingsChange,
  preserveFormulas = true,
  isSaving = false,
}: Props) {
  const [sheetMappings, setSheetMappings] = useState<SheetMapping[]>(initialMappings || []);
  const [arrayMappings, setArrayMappings] = useState<ArrayMapping[]>(initialArrayMappings || []);
  const [composedMappings, setComposedMappings] = useState<ExcelComposedMapping[]>(initialComposedMappings || []);
  const [newCell, setNewCell] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newSheet, setNewSheet] = useState(sheets[0]?.name ?? '');
  const [compositionError, setCompositionError] = useState<string | null>(null);
  useEffect(() => {
    onMappingsChange?.(sheetMappings);
    // The parent callback is recreated on render; only mapping changes notify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMappings]);
  const composedChangeRef = useRef(onComposedMappingsChange);
  composedChangeRef.current = onComposedMappingsChange;
  useEffect(() => {
    composedChangeRef.current?.(composedMappings);
  }, [composedMappings]);
  const validationErrors = validateExcelMappings({ sheetMappings, arrayMappings, composedMappings }, sheets);
  for (const mapping of composedMappings) {
    const unknown = composedFields(mapping.template)?.find(field => !fields.includes(field));
    if (unknown) validationErrors.push(`${mapping.sheetName}!${mapping.cellRef} : variable simple inconnue : ${unknown}.`);
  }
  if (preserveFormulas) {
    for (const mapping of sheetMappings) {
      const formulaCells = new Set(sheets.find(sheet => sheet.name === mapping.sheetName)?.formulaCells ?? []);
      for (const refs of Object.values(mapping.mapping)) for (const ref of Array.isArray(refs) ? refs : [refs]) {
        if (formulaCells.has(ref)) validationErrors.push(`${mapping.sheetName}!${ref} contient une formule protégée.`);
      }
    }
    for (const mapping of composedMappings) {
      if (sheets.find(sheet => sheet.name === mapping.sheetName)?.formulaCells?.includes(mapping.cellRef.toUpperCase())) {
        validationErrors.push(`${mapping.sheetName}!${mapping.cellRef} contient une formule protégée.`);
      }
    }
    for (const mapping of arrayMappings) {
      const formulas = sheets.find(sheet => sheet.name === mapping.sheetName)?.formulaCells ?? [];
      for (const ref of formulas) {
        const match = /^([A-Z]+)(\d+)$/.exec(ref);
        if (match && [...Object.values(mapping.columnMapping), ...(mapping.composedColumns ?? []).map(entry => entry.column)].includes(match[1]) && +match[2] >= mapping.startRow && +match[2] < mapping.startRow + (mapping.maxRows ?? 1)) {
          validationErrors.push(`${mapping.sheetName}!${ref} contient une formule protégée.`);
        }
      }
    }
  }
  // Mapping en cours d'édition (mis à jour en continu par ExcelCellMapper) pour
  // pouvoir basculer de feuille sans perdre les associations.
  const editMappingRef = useRef<{ [fieldName: string]: string | string[] }>({});

  const upsertSheetMapping = (sheetName: string, mapping: { [fieldName: string]: string | string[] }) => {
    setSheetMappings((prev) => {
      const idx = prev.findIndex((sm) => sm.sheetName === sheetName);
      if (Object.keys(mapping).length === 0) {
        return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      }
      const fieldStyles = { ...prev[idx]?.fieldStyles };
      for (const field of Object.keys(fieldStyles)) if (!mapping[field]) delete fieldStyles[field];
      const next: SheetMapping = { sheetName, mapping, fieldStyles };
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = next;
        return updated;
      }
      return [...prev, next];
    });
  };
  
  // Sauvegarder les arrayMappings dans l'état parent quand ils changent
  const handleArrayMappingsChange = (newMappings: ArrayMapping[]) => {
    setArrayMappings(newMappings);
    onArrayMappingsChange?.(newMappings);
  };
  const [activeSheetIndex, setActiveSheetIndex] = useState<number | null>(null);
  const [editingSheet, setEditingSheet] = useState<SheetInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'cells' | 'arrays'>('cells');

  // Champs déjà mappés sur toutes les feuilles
  const mappedFields = useMemo(() => {
    const mapped = new Set<string>();
    sheetMappings.forEach(sm => {
      Object.keys(sm.mapping).forEach(field => mapped.add(field));
    });
    composedMappings.forEach(entry => composedFields(entry.template)?.forEach(field => mapped.add(field)));
    return mapped;
  }, [sheetMappings, composedMappings]);

  // Champs restants à mapper
  const remainingFields = useMemo(() => {
    return fields.filter(f => !mappedFields.has(f));
  }, [fields, mappedFields]);

  const handleAddSheet = (sheet: SheetInfo) => {
    // Vérifier si cette feuille est déjà configurée
    const existingIndex = sheetMappings.findIndex(sm => sm.sheetName === sheet.name);
    if (existingIndex >= 0) {
      // Éditer la feuille existante
      setEditingSheet(sheet);
      setActiveSheetIndex(existingIndex);
    } else {
      // Ajouter une nouvelle feuille
      setEditingSheet(sheet);
      setActiveSheetIndex(sheetMappings.length);
    }
  };

  const handleEditSheet = (index: number) => {
    const sm = sheetMappings[index];
    const sheet = sheets.find(s => s.name === sm.sheetName);
    if (sheet) {
      setEditingSheet(sheet);
      setActiveSheetIndex(index);
    }
  };

  const handleRemoveSheet = (index: number) => {
    setSheetMappings(prev => prev.filter((_, i) => i !== index));
  };

  const handleMappingComplete = (mapping: { [fieldName: string]: string | string[] }) => {
    if (!editingSheet) return;
    upsertSheetMapping(editingSheet.name, mapping);
    editMappingRef.current = {};
    setEditingSheet(null);
    setActiveSheetIndex(null);
  };

  // Bascule vers une autre feuille sans quitter le mapping : on enregistre d'abord
  // les associations en cours de la feuille active.
  const switchEditingSheet = (sheet: SheetInfo) => {
    if (editingSheet) {
      upsertSheetMapping(editingSheet.name, editMappingRef.current);
    }
    editMappingRef.current = {};
    setEditingSheet(sheet);
    setActiveSheetIndex(null);
  };

  const handleComplete = () => {
    if (validationErrors.length) return;
    onComplete(sheetMappings, {
      multiSheet: true,
      sheetCount: sheetMappings.length,
      sheetMappings: sheetMappings, // Inclure tous les mappings de feuilles
      arrayMappings: arrayMappings.length > 0 ? arrayMappings : undefined,
      composedMappings,
    }, false);
  };

  const handleSave = () => {
    if (validationErrors.length) return;
    if (onSave) {
      onComplete(sheetMappings, {
        multiSheet: true,
        sheetCount: sheetMappings.length,
        sheetMappings: sheetMappings,
        arrayMappings: arrayMappings.length > 0 ? arrayMappings : undefined,
        composedMappings,
      }, true);
    }
  };

  const addComposition = () => {
    const candidate = { sheetName: newSheet, cellRef: newCell.trim().toUpperCase(), template: newTemplate };
    const unknown = composedFields(candidate.template)?.find(field => !fields.includes(field));
    const errors = validateExcelMappings({ sheetMappings, arrayMappings, composedMappings: [...composedMappings, candidate] }, sheets);
    if (preserveFormulas && sheets.find(sheet => sheet.name === newSheet)?.formulaCells?.includes(candidate.cellRef)) errors.push(`${newSheet}!${candidate.cellRef} contient une formule protégée.`);
    if (unknown) errors.push(`Variable simple inconnue : ${unknown}.`);
    if (errors.length) {
      setCompositionError(errors[0]);
      return;
    }
    setComposedMappings(prev => [...prev, candidate]);
    setNewCell('');
    setNewTemplate('');
    setCompositionError(null);
  };

  // Si on est en train d'éditer une feuille, afficher le mapper
  if (editingSheet) {
    // Récupérer les mappings existants pour cette feuille (par nom)
    const currentSheetMapping =
      sheetMappings.find((sm) => sm.sheetName === editingSheet.name)?.mapping ?? {};

    // Filtrer les champs : ceux non mappés + ceux déjà mappés sur cette feuille
    const availableFields = fields;

    return (
      <div className="space-y-4">
        {/* Onglets de feuilles : basculer sans quitter le mapping */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
          <span className="text-sm text-gray-500 mr-1">Feuilles :</span>
          {sheets.map((s) => {
            const isActive = s.name === editingSheet.name;
            const configured = sheetMappings.some((sm) => sm.sheetName === s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => { if (!isActive) switchEditingSheet(s); }}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                {s.name}
                {configured && <span className="ml-1.5 text-green-600">✓</span>}
              </button>
            );
          })}
        </div>

        <ExcelCellMapper
          key={editingSheet.name}
          sheet={editingSheet}
          fields={availableFields}
          secteur={secteur}
          spFields={spFields}
          initialMapping={currentSheetMapping}
          fieldStyles={sheetMappings.find(sm => sm.sheetName === editingSheet.name)?.fieldStyles}
          onFieldStylesChange={fieldStyles => {
            setSheetMappings(prev => {
              const current = prev.find(sm => sm.sheetName === editingSheet.name);
              const mapping = editMappingRef.current;
              const next = { sheetName: editingSheet.name, mapping, fieldStyles };
              return current ? prev.map(sm => sm.sheetName === editingSheet.name ? next : sm) : [...prev, next];
            });
          }}
          onMappingComplete={handleMappingComplete}
          onMappingChange={(m) => {
            editMappingRef.current = m;
            onMappingsChange?.([...sheetMappings.filter(sm => sm.sheetName !== editingSheet.name), { sheetName: editingSheet.name, mapping: m, fieldStyles: sheetMappings.find(sm => sm.sheetName === editingSheet.name)?.fieldStyles }]);
          }}
          preserveFormulas={preserveFormulas}
          onBack={() => {
            upsertSheetMapping(editingSheet.name, editMappingRef.current);
            editMappingRef.current = {};
            setEditingSheet(null);
            setActiveSheetIndex(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Mapping multi-feuilles
        </h3>
        <p className="text-gray-600">
          Mappez vos champs sur une ou plusieurs feuilles Excel.
        </p>
      </div>

      {/* Onglets si on a des champs tableau */}
      {arrayFields.length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('cells')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'cells'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 inline-block mr-2" />
              Champs simples ({fields.length})
            </button>
            <button
              onClick={() => setActiveTab('arrays')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'arrays'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Table2 className="w-4 h-4 inline-block mr-2" />
              Tableaux ({arrayFields.length})
              {arrayMappings.length > 0 && (
                <span className="ml-2 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">
                  {arrayMappings.length} configuré{arrayMappings.length > 1 ? 's' : ''}
                </span>
              )}
            </button>
          </nav>
        </div>
      )}

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'arrays' && arrayFields.length > 0 ? (
        <ExcelArrayMapper
          sheets={sheets}
          arrayFields={arrayFields}
          spArrayIds={spArrayIds}
          initialMappings={arrayMappings}
          sheetMappings={sheetMappings}
          composedMappings={composedMappings}
          onMappingsChange={handleArrayMappingsChange}
        />
      ) : (
        <>
          {/* Contenu existant pour les champs simples */}

      {/* Résumé des mappings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-900">Feuilles configurées</h4>
          <span className="text-sm text-gray-500">
            {mappedFields.size}/{fields.length} champs mappés
          </span>
        </div>

        {sheetMappings.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">
              Aucune feuille configurée. Ajoutez une feuille pour commencer le mapping.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sheetMappings.map((sm, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 bg-white"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-gray-900">{sm.sheetName}</h5>
                      <p className="text-sm text-gray-500">
                        {Object.keys(sm.mapping).length} champs mappés
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditSheet(index)}
                      className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleRemoveSheet(index)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Aperçu des champs mappés */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sm.mapping).slice(0, 8).map(([field, cells]) => {
                    const cellArray = typeof cells === 'string' ? [cells] : cells;
                    return (
                      <div
                        key={field}
                        className="text-xs bg-gray-100 px-2 py-1 rounded"
                      >
                        <span className="text-gray-700">{field}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-mono text-blue-600">
                          {cellArray.join(', ')}
                        </span>
                      </div>
                    );
                  })}
                  {Object.keys(sm.mapping).length > 8 && (
                    <div className="text-xs text-gray-500 px-2 py-1">
                      +{Object.keys(sm.mapping).length - 8} autres
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajouter une feuille */}
      {sheets.length > 0 && (
        <div id="excel-sheet-selector" className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">
            Ajouter une feuille
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            {remainingFields.length} champs restants à mapper
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sheets.map((sheet) => {
              const isAlreadyUsed = sheetMappings.some(sm => sm.sheetName === sheet.name);
              return (
                <button
                  key={sheet.name}
                  onClick={() => handleAddSheet(sheet)}
                  className={`p-4 border rounded-lg text-left transition-colors ${
                    isAlreadyUsed
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className={`w-5 h-5 ${isAlreadyUsed ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className="font-medium text-gray-900 truncate">{sheet.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {sheet.rows} lignes × {sheet.cols} colonnes
                  </p>
                  {isAlreadyUsed && (
                    <p className="text-xs text-green-600 mt-1">✓ Déjà configurée</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Champs restants */}
      {remainingFields.length > 0 && sheetMappings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-900 mb-2">
            ⚠️ Champs non mappés ({remainingFields.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {remainingFields.map(field => (
              <span
                key={field}
                className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tous les champs mappés */}
      {remainingFields.length === 0 && sheetMappings.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            ✓ Tous les champs sont mappés !
          </p>
        </div>
      )}
        </>
      )}

      <section className="space-y-4 border-t border-gray-200 pt-6" aria-labelledby="composed-cells-title">
        <div>
          <h4 id="composed-cells-title" className="font-semibold text-gray-900">Cellules composées</h4>
          <p className="mt-1 text-sm text-gray-600">Réunissez plusieurs variables simples dans une seule cellule, avec le texte et les espaces de votre choix.</p>
        </div>
        {composedMappings.map((mapping, index) => (
          <div key={`${mapping.sheetName}-${mapping.cellRef}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <div className="min-w-0 text-sm font-medium text-gray-700">{mapping.sheetName} · {mapping.cellRef}</div>
            <label className="block min-w-0 text-xs font-medium text-gray-700">
              Contenu de la cellule
              <input
                value={mapping.template}
                onChange={event => setComposedMappings(prev => prev.map((entry, i) => i === index ? { ...entry, template: event.target.value, fieldStyles: retainExcelCompositionPartStyles(entry.fieldStyles, event.target.value) } : entry))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <button type="button" onClick={() => setComposedMappings(prev => prev.filter((_, i) => i !== index))} aria-label={`Supprimer la composition ${mapping.sheetName} ${mapping.cellRef}`} className="inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <Trash2 className="h-4 w-4" /> Supprimer
            </button>
            </div>
            <p className="mt-3 text-xs font-semibold text-gray-800">Mise en forme de toute la cellule</p>
            <ExcelFieldStyleEditor field={`Cellule composée ${mapping.sheetName} ${mapping.cellRef}`} style={mapping.style} onChange={style => setComposedMappings(prev => prev.map((entry, i) => i === index ? { ...entry, style } : entry))} />
            <ExcelCompositionPartStylesEditor template={mapping.template} styles={mapping.fieldStyles} onChange={fieldStyles => setComposedMappings(prev => prev.map((entry, i) => i === index ? { ...entry, fieldStyles } : entry))} />
          </div>
        ))}
        <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] sm:items-end">
          <label className="block text-xs font-medium text-gray-800">
            Feuille
            <select value={newSheet} onChange={event => setNewSheet(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
              {sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-800">
            Cellule
            <input value={newCell} onChange={event => setNewCell(event.target.value)} placeholder="A1" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
          <label className="block text-xs font-medium text-gray-800">
            Ajouter une variable
            <select value="" onChange={event => setNewTemplate(prev => `${prev}${prev.endsWith('}}') ? ' ' : ''}{{${event.target.value}}}`)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Choisir un champ simple…</option>
              {fields.map(field => <option key={field} value={field}>{field}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-800 sm:col-span-3">
            Contenu (au moins deux variables distinctes)
            <input value={newTemplate} onChange={event => setNewTemplate(event.target.value)} placeholder="{{prenom}} {{nom}}" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
          {compositionError && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{compositionError}</p>}
          <button type="button" onClick={addComposition} className="inline-flex w-fit items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-span-3">
            <Plus className="h-4 w-4" /> Ajouter la composition
          </button>
        </div>
      </section>

      {validationErrors.length > 0 && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Corrigez le mapping avant de sauvegarder :</p>
          <ul className="mt-2 list-disc pl-5">{Array.from(new Set(validationErrors)).map(error => <li key={error}>{error}</li>)}</ul>
        </div>
      )}
      {/* Actions */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Retour
        </button>
        <div className="flex gap-3">
          {onSave && (
            <button
              onClick={handleSave}
              disabled={isSaving || validationErrors.length > 0 || (sheetMappings.length === 0 && arrayMappings.length === 0 && composedMappings.length === 0)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Sauvegarder
            </button>
          )}
          <button
            id="btn-save-excel-template"
            onClick={handleComplete}
            disabled={isSaving || validationErrors.length > 0 || (sheetMappings.length === 0 && arrayMappings.length === 0 && composedMappings.length === 0)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuer ({sheetMappings.length + arrayMappings.length + composedMappings.length > 0 ? 'Mapping configuré' : 'Configurer au moins un élément'})
          </button>
        </div>
      </div>
    </div>
  );
}
