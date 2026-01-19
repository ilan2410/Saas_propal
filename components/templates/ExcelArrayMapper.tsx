'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Table2, X, Check, HelpCircle, ArrowLeft } from 'lucide-react';
import { ArrayFieldDefinition } from '@/components/admin/organizationFormConfig';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
}

export interface ArrayMapping {
  arrayId: string;
  sheetName: string;
  startRow: number;
  stopCondition: 'empty_first_col' | 'max_rows';
  maxRows?: number;
  // Mapping colonne -> champ (ex: "numero" -> "B", "type" -> "C")
  columnMapping: { [fieldId: string]: string };
}

interface Props {
  sheets: SheetInfo[];
  arrayFields: ArrayFieldDefinition[];
  initialMappings?: ArrayMapping[];
  onMappingsChange: (mappings: ArrayMapping[]) => void;
}

// Générer le nom de colonne Excel (A, B, ..., Z, AA, AB, ...)
function getColumnName(colIndex: number): string {
  let name = '';
  let index = colIndex;
  while (index >= 0) {
    name = String.fromCharCode((index % 26) + 65) + name;
    index = Math.floor(index / 26) - 1;
  }
  return name;
}

// Extraire la colonne d'une référence de cellule (ex: "B5" -> "B")
function getColumnFromRef(ref: string): string {
  return ref.replace(/[0-9]/g, '');
}

export function ExcelArrayMapper({ sheets, arrayFields, initialMappings, onMappingsChange }: Props) {
  const [mappings, setMappings] = useState<ArrayMapping[]>(initialMappings || []);
  const [expandedArray, setExpandedArray] = useState<string | null>(null);
  const [editingArray, setEditingArray] = useState<ArrayFieldDefinition | null>(null);
  const [editingMapping, setEditingMapping] = useState<Partial<ArrayMapping> | null>(null);

  // Mettre à jour le parent quand les mappings changent
  const updateMappings = (newMappings: ArrayMapping[]) => {
    setMappings(newMappings);
    onMappingsChange(newMappings);
  };

  // Trouver le mapping existant pour un array
  const getMappingForArray = (arrayId: string) => {
    return mappings.find(m => m.arrayId === arrayId);
  };

  // Commencer à éditer un array
  const startEditing = (arrayField: ArrayFieldDefinition) => {
    const existing = getMappingForArray(arrayField.id);
    setEditingArray(arrayField);
    setEditingMapping(existing || {
      arrayId: arrayField.id,
      sheetName: sheets[0]?.name || '',
      startRow: 2,
      stopCondition: 'empty_first_col',
      columnMapping: {},
    });
  };

  // Sauvegarder le mapping
  const saveMapping = () => {
    if (!editingMapping || !editingArray) return;

    const newMapping: ArrayMapping = {
      arrayId: editingArray.id,
      sheetName: editingMapping.sheetName || sheets[0]?.name || '',
      startRow: editingMapping.startRow || 2,
      stopCondition: editingMapping.stopCondition || 'empty_first_col',
      maxRows: editingMapping.maxRows,
      columnMapping: editingMapping.columnMapping || {},
    };

    const existingIndex = mappings.findIndex(m => m.arrayId === editingArray.id);
    if (existingIndex >= 0) {
      const updated = [...mappings];
      updated[existingIndex] = newMapping;
      updateMappings(updated);
    } else {
      updateMappings([...mappings, newMapping]);
    }

    setEditingArray(null);
    setEditingMapping(null);
  };

  // Supprimer un mapping
  const removeMapping = (arrayId: string) => {
    updateMappings(mappings.filter(m => m.arrayId !== arrayId));
  };

  // Obtenir les colonnes disponibles pour une feuille
  const getColumnsForSheet = (sheetName: string) => {
    const sheet = sheets.find(s => s.name === sheetName);
    if (!sheet) return [];
    
    const cols = Math.min(sheet.cols, 26); // Max 26 colonnes (A-Z)
    return Array.from({ length: cols }, (_, i) => getColumnName(i));
  };

  // Obtenir un aperçu des données d'une colonne
  const getColumnPreview = (sheetName: string, column: string, startRow: number) => {
    const sheet = sheets.find(s => s.name === sheetName);
    if (!sheet) return [];
    
    const previews: string[] = [];
    for (let row = startRow; row < startRow + 3 && row <= sheet.rows; row++) {
      const cellRef = `${column}${row}`;
      const value = sheet.cells[cellRef] || '';
      previews.push(value || '(vide)');
    }
    return previews;
  };

  // État pour le champ sélectionné dans l'éditeur
  const [selectedField, setSelectedField] = useState<string | null>(null);

  // Obtenir la feuille sélectionnée
  const selectedSheet = editingMapping?.sheetName 
    ? sheets.find(s => s.name === editingMapping.sheetName) 
    : null;

  // Dimensions de la grille
  const maxRows = selectedSheet ? Math.min(selectedSheet.rows || 50, 50) : 30;
  const maxCols = selectedSheet ? Math.min(selectedSheet.cols || 10, 26) : 10;

  // Mapper un champ à une colonne (via clic sur une cellule)
  const handleCellClick = (cellRef: string) => {
    if (!selectedField || !editingMapping) return;
    
    const column = getColumnFromRef(cellRef);
    setEditingMapping({
      ...editingMapping,
      columnMapping: {
        ...editingMapping.columnMapping,
        [selectedField]: column,
      },
    });
  };

  // Retirer le mapping d'un champ
  const handleRemoveFieldMapping = (fieldId: string) => {
    if (!editingMapping) return;
    const newMapping = { ...editingMapping.columnMapping };
    delete newMapping[fieldId];
    setEditingMapping({
      ...editingMapping,
      columnMapping: newMapping,
    });
  };

  // Si on est en mode édition
  if (editingArray && editingMapping) {
    const mappedCount = Object.keys(editingMapping.columnMapping || {}).length;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => {
                setEditingArray(null);
                setEditingMapping(null);
                setSelectedField(null);
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingArray.label}
            </h3>
          </div>
          <p className="text-gray-600">
            Mappez chaque champ à une colonne Excel. Mappé : {mappedCount}/{editingArray.rowFields.length}
          </p>
          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
            <p className="font-medium mb-1">💡 Comment mapper un tableau :</p>
            <ul className="text-xs space-y-1 ml-4">
              <li>• Sélectionnez un champ à gauche</li>
              <li>• Cliquez sur une cellule dans la grille pour associer sa <strong>colonne</strong></li>
              <li>• Le système lira toutes les lignes de cette colonne à partir de la ligne de départ</li>
            </ul>
          </div>
        </div>

        {/* Configuration de base */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          {/* Feuille */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Feuille Excel
            </label>
            <select
              value={editingMapping.sheetName || ''}
              onChange={(e) => setEditingMapping({
                ...editingMapping,
                sheetName: e.target.value,
                columnMapping: {},
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            >
              {sheets.map(sheet => (
                <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
              ))}
            </select>
          </div>

          {/* Ligne de départ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ligne de départ
            </label>
            <input
              type="number"
              min={1}
              value={editingMapping.startRow || 2}
              onChange={(e) => setEditingMapping({
                ...editingMapping,
                startRow: parseInt(e.target.value) || 2,
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            />
          </div>

          {/* Condition d'arrêt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arrêter quand
            </label>
            <select
              value={editingMapping.stopCondition || 'empty_first_col'}
              onChange={(e) => setEditingMapping({
                ...editingMapping,
                stopCondition: e.target.value as 'empty_first_col' | 'max_rows',
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
            >
              <option value="empty_first_col">1ère colonne vide</option>
              <option value="max_rows">Nombre max de lignes</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colonne gauche : Champs du tableau */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Champs du tableau</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {editingArray.rowFields.map((field, idx) => {
                const mappedColumn = editingMapping.columnMapping?.[field.id];
                const isSelected = selectedField === field.id;

                return (
                  <div
                    key={field.id}
                    onClick={() => setSelectedField(field.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      mappedColumn
                        ? 'border-green-300 bg-green-50'
                        : isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{field.label}</p>
                        <p className="text-xs text-gray-500">Type: {field.type}</p>
                      </div>
                      {mappedColumn && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-green-200 text-green-800 px-2 py-1 rounded">
                            Colonne {mappedColumn}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFieldMapping(field.id);
                            }}
                            className="text-green-600 hover:text-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {idx === 0 && editingMapping.stopCondition === 'empty_first_col' && (
                      <p className="text-xs text-purple-600 mt-1">
                        ⚡ Colonne de contrôle (arrêt si vide)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {mappedCount === editingArray.rowFields.length && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">✓ Tous les champs sont mappés !</p>
              </div>
            )}
          </div>

          {/* Colonne droite : Grille Excel */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">Grille Excel</h4>
              <span className="text-xs text-gray-500">
                Cliquez sur une cellule pour mapper sa colonne
              </span>
            </div>

            {!selectedField && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  👈 Sélectionnez d'abord un champ à gauche
                </p>
              </div>
            )}

            {selectedSheet && (
              <div className="overflow-auto max-h-80 border border-gray-200 rounded">
                <table className="text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      <th className="border border-gray-300 px-2 py-1 bg-gray-200 w-10"></th>
                      {Array.from({ length: maxCols }, (_, i) => {
                        const colName = getColumnName(i);
                        // Vérifier si cette colonne est déjà mappée
                        const mappedToField = Object.entries(editingMapping.columnMapping || {})
                          .find(([_, col]) => col === colName)?.[0];
                        const fieldDef = mappedToField 
                          ? editingArray.rowFields.find(f => f.id === mappedToField)
                          : null;

                        return (
                          <th 
                            key={i} 
                            className={`border border-gray-300 px-2 py-1 min-w-16 ${
                              mappedToField ? 'bg-green-200' : 'bg-gray-200'
                            }`}
                            title={fieldDef ? `Mappé à: ${fieldDef.label}` : colName}
                          >
                            {colName}
                            {mappedToField && <span className="block text-green-700">✓</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Math.min(maxRows, 20) }, (_, rowIdx) => {
                      const rowNum = rowIdx + 1;
                      const isStartRow = rowNum === (editingMapping.startRow || 2);

                      return (
                        <tr key={rowIdx} className={isStartRow ? 'bg-purple-50' : ''}>
                          <td className={`border border-gray-300 px-2 py-1 text-center font-semibold ${
                            isStartRow ? 'bg-purple-200 text-purple-800' : 'bg-gray-100'
                          }`}>
                            {rowNum}
                            {isStartRow && <span className="block text-xs">▶</span>}
                          </td>
                          {Array.from({ length: maxCols }, (_, colIdx) => {
                            const colName = getColumnName(colIdx);
                            const ref = `${colName}${rowNum}`;
                            const value = selectedSheet.cells[ref] || '';
                            
                            // Vérifier si cette colonne est mappée
                            const mappedToField = Object.entries(editingMapping.columnMapping || {})
                              .find(([_, col]) => col === colName)?.[0];
                            
                            return (
                              <td
                                key={colIdx}
                                onClick={() => selectedField && handleCellClick(ref)}
                                className={`border border-gray-300 px-2 py-1 truncate max-w-24 transition-colors text-xs ${
                                  mappedToField
                                    ? 'bg-green-100 text-green-800'
                                    : selectedField
                                    ? 'hover:bg-purple-100 cursor-pointer'
                                    : 'bg-white'
                                }`}
                                title={`${ref}: ${value || '(vide)'}`}
                              >
                                {value || <span className="text-gray-300">-</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Ligne de départ : {editingMapping.startRow || 2} (surlignée en violet)
            </p>
          </div>
        </div>

        {/* Résumé du mapping */}
        {mappedCount > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-900 mb-3">Colonnes mappées</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(editingMapping.columnMapping || {}).map(([fieldId, column]) => {
                const fieldDef = editingArray.rowFields.find(f => f.id === fieldId);
                return (
                  <div
                    key={fieldId}
                    className="bg-white px-3 py-2 rounded border border-purple-200 text-sm"
                  >
                    <span className="text-gray-700">{fieldDef?.label || fieldId}</span>
                    <span className="mx-2 text-gray-400">→</span>
                    <span className="font-mono font-semibold text-purple-700">Col {column}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-6 border-t border-gray-200">
          <button
            onClick={() => {
              setEditingArray(null);
              setEditingMapping(null);
              setSelectedField(null);
            }}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={saveMapping}
            disabled={mappedCount === 0}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enregistrer ({mappedCount} colonnes)
          </button>
        </div>
      </div>
    );
  }

  // Vue liste des arrays
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Table2 className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-gray-900">Tableaux à mapper</h3>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Ces champs représentent des listes de données (lignes répétées). 
        Configurez le mapping pour chaque tableau.
      </p>

      <div className="space-y-2">
        {arrayFields.map(arrayField => {
          const mapping = getMappingForArray(arrayField.id);
          const isConfigured = !!mapping;

          return (
            <div
              key={arrayField.id}
              className={`border rounded-lg overflow-hidden ${
                isConfigured ? 'border-green-300 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isConfigured && (
                    <Check className="w-5 h-5 text-green-600" />
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{arrayField.label}</div>
                    <div className="text-sm text-gray-500">{arrayField.description}</div>
                    {isConfigured && mapping && (
                      <div className="text-xs text-green-700 mt-1">
                        Feuille "{mapping.sheetName}" • Ligne {mapping.startRow} • 
                        {Object.keys(mapping.columnMapping).length} colonnes mappées
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConfigured && (
                    <button
                      onClick={() => removeMapping(arrayField.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Supprimer
                    </button>
                  )}
                  <button
                    onClick={() => startEditing(arrayField)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      isConfigured
                        ? 'border border-green-600 text-green-700 hover:bg-green-100'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {isConfigured ? 'Modifier' : 'Configurer'}
                  </button>
                </div>
              </div>

              {/* Détails du mapping si configuré */}
              {isConfigured && mapping && expandedArray === arrayField.id && (
                <div className="px-4 py-3 bg-white border-t border-green-200">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(mapping.columnMapping).map(([fieldId, column]) => {
                      const fieldDef = arrayField.rowFields.find(f => f.id === fieldId);
                      return (
                        <div key={fieldId} className="flex items-center gap-2">
                          <span className="text-gray-600">{fieldDef?.label || fieldId}:</span>
                          <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                            Colonne {column}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Toggle détails */}
              {isConfigured && (
                <button
                  onClick={() => setExpandedArray(
                    expandedArray === arrayField.id ? null : arrayField.id
                  )}
                  className="w-full px-4 py-2 bg-green-100 text-green-700 text-sm flex items-center justify-center gap-1 hover:bg-green-200"
                >
                  {expandedArray === arrayField.id ? (
                    <>Masquer les détails <ChevronDown className="w-4 h-4" /></>
                  ) : (
                    <>Voir les détails <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {arrayFields.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Aucun tableau à configurer pour ce secteur.
        </div>
      )}
    </div>
  );
}
