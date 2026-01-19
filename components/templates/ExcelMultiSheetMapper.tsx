'use client';

import { useState, useMemo } from 'react';
import { Trash2, FileSpreadsheet, Check, Table2 } from 'lucide-react';
import { ExcelCellMapper } from './ExcelCellMapper';
import { ExcelArrayMapper, ArrayMapping } from './ExcelArrayMapper';
import { ArrayFieldDefinition } from '@/components/admin/organizationFormConfig';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
}

interface SheetMapping {
  sheetName: string;
  mapping: { [fieldName: string]: string | string[] };
}

interface Props {
  sheets: SheetInfo[];
  fields: string[];
  secteur: string;
  arrayFields?: ArrayFieldDefinition[]; // Champs de type tableau
  initialMappings?: SheetMapping[];
  initialArrayMappings?: ArrayMapping[];
  onComplete: (sheetMappings: SheetMapping[], fileConfig: any, isSave?: boolean) => void;
  onBack: () => void;
  onArrayMappingsChange?: (mappings: ArrayMapping[]) => void; // Callback pour sauvegarder les mappings de tableaux
  onSave?: () => void;
}

export function ExcelMultiSheetMapper({ 
  sheets, 
  fields, 
  secteur,
  arrayFields = [],
  initialMappings, 
  initialArrayMappings,
  onComplete, 
  onBack,
  onArrayMappingsChange,
  onSave
}: Props) {
  const [sheetMappings, setSheetMappings] = useState<SheetMapping[]>(initialMappings || []);
  const [arrayMappings, setArrayMappings] = useState<ArrayMapping[]>(initialArrayMappings || []);
  
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
    return mapped;
  }, [sheetMappings]);

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

  const handleMappingComplete = (mapping: { [fieldName: string]: string | string[] }, fileConfig: any) => {
    if (!editingSheet) return;

    const newMapping: SheetMapping = {
      sheetName: editingSheet.name,
      mapping,
    };

    setSheetMappings(prev => {
      if (activeSheetIndex !== null && activeSheetIndex < prev.length) {
        // Modifier un mapping existant
        const updated = [...prev];
        updated[activeSheetIndex] = newMapping;
        return updated;
      } else {
        // Ajouter un nouveau mapping
        return [...prev, newMapping];
      }
    });

    setEditingSheet(null);
    setActiveSheetIndex(null);
  };

  const handleComplete = () => {
    onComplete(sheetMappings, {
      multiSheet: true,
      sheetCount: sheetMappings.length,
      sheetMappings: sheetMappings, // Inclure tous les mappings de feuilles
      arrayMappings: arrayMappings.length > 0 ? arrayMappings : undefined,
    }, false);
  };

  const handleSave = () => {
    if (onSave) {
      onComplete(sheetMappings, {
        multiSheet: true,
        sheetCount: sheetMappings.length,
        sheetMappings: sheetMappings,
        arrayMappings: arrayMappings.length > 0 ? arrayMappings : undefined,
      }, true);
    }
  };

  // Si on est en train d'éditer une feuille, afficher le mapper
  if (editingSheet) {
    // Récupérer les mappings existants pour cette feuille
    const currentSheetMapping = activeSheetIndex !== null && activeSheetIndex < sheetMappings.length
      ? sheetMappings[activeSheetIndex].mapping
      : {};
    
    // Filtrer les champs : ceux non mappés + ceux déjà mappés sur cette feuille
    const availableFields = fields.filter(f => 
      !mappedFields.has(f) || Object.keys(currentSheetMapping).includes(f)
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Feuille : <strong>{editingSheet.name}</strong></span>
        </div>
        <ExcelCellMapper
          sheet={editingSheet}
          fields={availableFields}
          secteur={secteur}
          initialMapping={currentSheetMapping}
          onMappingComplete={handleMappingComplete}
          onBack={() => {
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
          initialMappings={arrayMappings}
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
      {remainingFields.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
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
              disabled={sheetMappings.length === 0 && arrayMappings.length === 0}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Sauvegarder
            </button>
          )}
          <button
            onClick={handleComplete}
            disabled={sheetMappings.length === 0 && arrayMappings.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuer ({sheetMappings.length + arrayMappings.length > 0 ? 'Mapping configuré' : 'Configurer au moins un élément'})
          </button>
        </div>
      </div>
    </div>
  );
}
