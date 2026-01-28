'use client';

import { useState, useMemo } from 'react';
import { Search, X, Grid3x3, ChevronRight } from 'lucide-react';
import {
  getCategoryLabelForSecteur,
  getFieldsByCategoryForSecteur,
} from '@/components/admin/organizationFormConfig';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
}

interface CellMapping {
  [fieldName: string]: string | string[]; // fieldName -> cellRef ou array de cellRefs
}

export type MappingContext = {
  sheetName: string;
  totalRows: number;
  totalCols: number;
};

interface Props {
  sheet: SheetInfo;
  fields: string[]; // Champs à mapper
  secteur: string;
  initialMapping?: CellMapping; // Mappings existants à restaurer
  onMappingComplete: (mapping: CellMapping, fileConfig: MappingContext) => void;
  onBack: () => void;
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

export function ExcelCellMapper({ sheet, fields, secteur, initialMapping, onMappingComplete, onBack }: Props) {
  const [mapping, setMapping] = useState<CellMapping>(initialMapping || {});
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedField, setExpandedField] = useState<string | null>(fields[0] || null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fieldsByCategoryRef = useMemo(() => {
    return getFieldsByCategoryForSecteur(secteur);
  }, [secteur]);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(fieldsByCategoryRef))
  );

  // Grouper les champs par catégorie
  const fieldsByCategory = useMemo(() => {
    const grouped: { [key: string]: string[] } = {};
    
    // Initialiser avec toutes les catégories
    Object.keys(fieldsByCategoryRef).forEach(cat => {
      grouped[cat] = [];
    });
    
    // Ajouter les champs connus à leurs catégories
    fields.forEach(field => {
      let found = false;
      Object.entries(fieldsByCategoryRef).forEach(([cat, catFields]) => {
        if (catFields.includes(field)) {
          grouped[cat].push(field);
          found = true;
        }
      });
      // Si le champ n'est pas dans une catégorie connue, l'ajouter à "Personnalisés"
      if (!found) {
        if (!grouped['custom']) {
          grouped['custom'] = [];
        }
        grouped['custom'].push(field);
      }
    });
    
    // Supprimer les catégories vides
    Object.keys(grouped).forEach(cat => {
      if (grouped[cat].length === 0) {
        delete grouped[cat];
      }
    });
    
    return grouped;
  }, [fields, fieldsByCategoryRef]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Générer toutes les cellules de la grille (max 200 lignes x 26 colonnes)
  const maxRows = Math.min(sheet.rows || 100, 200);
  const maxCols = Math.min(sheet.cols || 26, 26);

  const allCells = useMemo(() => {
    const cells: { ref: string; value: string }[] = [];
    for (let row = 1; row <= maxRows; row++) {
      for (let col = 0; col < maxCols; col++) {
        const colName = getColumnName(col);
        const ref = `${colName}${row}`;
        const value = sheet.cells[ref] || '';
        cells.push({ ref, value });
      }
    }
    return cells;
  }, [sheet.cells, maxRows, maxCols]);

  // Filtrer les cellules selon la recherche
  const filteredCells = useMemo(() => {
    if (!searchTerm) return allCells;
    return allCells.filter(
      (cell) =>
        cell.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cell.value.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allCells, searchTerm]);

  const handleMapField = (fieldName: string, cellRef: string) => {
    setMapping((prev) => {
      const current = prev[fieldName];
      
      if (!current) {
        // Première cellule
        return { ...prev, [fieldName]: cellRef };
      }
      
      if (typeof current === 'string') {
        // Deuxième cellule : convertir en array
        if (current === cellRef) {
          // Même cellule, ne rien faire
          return prev;
        }
        return { ...prev, [fieldName]: [current, cellRef] };
      }
      
      // Array de cellules
      if (Array.isArray(current)) {
        if (current.includes(cellRef)) {
          // Cellule déjà présente, la retirer
          const newCells = current.filter(c => c !== cellRef);
          return {
            ...prev,
            [fieldName]: newCells.length === 1 ? newCells[0] : newCells,
          };
        }
        // Ajouter la nouvelle cellule
        return { ...prev, [fieldName]: [...current, cellRef] };
      }
      
      return prev;
    });
  };

  const handleUnmapField = (fieldName: string) => {
    setMapping((prev) => {
      const newMapping = { ...prev };
      delete newMapping[fieldName];
      return newMapping;
    });
  };

  const handleRemoveCellFromField = (fieldName: string, cellRef: string) => {
    setMapping((prev) => {
      const current = prev[fieldName];
      
      if (typeof current === 'string') {
        if (current === cellRef) {
          const newMapping = { ...prev };
          delete newMapping[fieldName];
          return newMapping;
        }
        return prev;
      }
      
      if (Array.isArray(current)) {
        const newCells = current.filter(c => c !== cellRef);
        if (newCells.length === 0) {
          const newMapping = { ...prev };
          delete newMapping[fieldName];
          return newMapping;
        }
        return {
          ...prev,
          [fieldName]: newCells.length === 1 ? newCells[0] : newCells,
        };
      }
      
      return prev;
    });
  };

  const handleComplete = () => {
    onMappingComplete(mapping, {
      sheetName: sheet.name,
      totalRows: sheet.rows,
      totalCols: sheet.cols,
    });
  };

  const unmappedFields = fields.filter((f) => !mapping[f]);
  const mappedCount = Object.keys(mapping).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Mapper les cellules Excel
        </h3>
        <p className="text-gray-600">
          Associez chaque champ à une ou plusieurs cellules Excel. Mappé : {mappedCount}/{fields.length}
        </p>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-1">💡 Comment mapper :</p>
          <ul className="text-xs space-y-1 ml-4">
            <li>• Sélectionnez un champ à gauche</li>
            <li>• Cliquez sur une cellule dans la grille pour l’ajouter</li>
            <li>• Cliquez à nouveau pour ajouter une deuxième cellule (les données seront concaténées)</li>
            <li>• Cliquez sur le × pour retirer une cellule</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne gauche : Champs à mapper par catégorie */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-4">Champs à mapper</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(fieldsByCategory).map(([category, categoryFields]) => (
              <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* En-tête de catégorie */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={`w-4 h-4 text-gray-600 transition-transform ${
                        expandedCategories.has(category) ? 'rotate-90' : ''
                      }`}
                    />
                    <span className="font-semibold text-gray-900">
                      {category === 'custom'
                        ? 'Personnalisés'
                        : getCategoryLabelForSecteur(secteur, category)}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {categoryFields.length}
                    </span>
                  </div>
                </button>

                {/* Champs de la catégorie */}
                {expandedCategories.has(category) && (
                  <div className="space-y-1 p-2 bg-white">
                    {categoryFields.map((field) => {
                      const fieldMapping = mapping[field];
                      const mappedCells = fieldMapping
                        ? typeof fieldMapping === 'string'
                          ? [fieldMapping]
                          : fieldMapping
                        : [];

                      return (
                        <div
                          key={field}
                          onClick={() => setExpandedField(expandedField === field ? null : field)}
                          className={`p-2 rounded border cursor-pointer transition-colors ${
                            mappedCells.length > 0
                              ? 'border-green-200 bg-green-50'
                              : expandedField === field
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{field}</p>
                            {mappedCells.length > 0 && (
                              <span className="text-xs text-green-700 font-semibold">
                                {mappedCells.length} cellule{mappedCells.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {mappedCells.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {mappedCells.map((cell) => (
                                <div
                                  key={cell}
                                  className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-green-300 text-xs"
                                >
                                  <span className="font-mono font-semibold text-green-700">
                                    {cell}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveCellFromField(field, cell);
                                    }}
                                    className="text-green-600 hover:text-red-600 ml-0.5"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {unmappedFields.length === 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">✓ Tous les champs sont mappés !</p>
            </div>
          )}
        </div>

        {/* Colonne droite : Cellules disponibles */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">Cellules disponibles</h4>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Vue grille"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                title="Vue liste"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barre de recherche */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Chercher une cellule (ex: B2, I3)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!expandedField && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                👈 Sélectionnez d’abord un champ à gauche
              </p>
            </div>
          )}

          {/* Vue Grille Excel */}
          {viewMode === 'grid' && (
            <div className="overflow-auto max-h-[500px] border border-gray-200 rounded">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-2 py-1 bg-gray-200 w-10"></th>
                    {Array.from({ length: maxCols }, (_, i) => (
                      <th key={i} className="border border-gray-300 px-2 py-1 bg-gray-200 min-w-16">
                        {getColumnName(i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRows }, (_, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="border border-gray-300 px-2 py-1 bg-gray-100 text-center font-semibold">
                        {rowIdx + 1}
                      </td>
                      {Array.from({ length: maxCols }, (_, colIdx) => {
                        const ref = `${getColumnName(colIdx)}${rowIdx + 1}`;
                        const value = sheet.cells[ref] || '';
                        
                        // Vérifier si cette cellule est mappée
                        let isMapped = false;
                        const mappedFields: string[] = [];
                        
                        Object.entries(mapping).forEach(([field, cells]) => {
                          if (typeof cells === 'string') {
                            if (cells === ref) {
                              isMapped = true;
                              mappedFields.push(field);
                            }
                          } else if (Array.isArray(cells)) {
                            if (cells.includes(ref)) {
                              isMapped = true;
                              mappedFields.push(field);
                            }
                          }
                        });
                        
                        return (
                          <td
                            key={colIdx}
                            onClick={() => expandedField && handleMapField(expandedField, ref)}
                            className={`border border-gray-300 px-1 py-0.5 truncate max-w-32 cursor-pointer transition-colors text-xs ${
                              isMapped
                                ? 'bg-green-100 text-green-800 font-semibold'
                                : expandedField
                                ? 'hover:bg-blue-100'
                                : 'bg-white'
                            }`}
                            title={isMapped ? `Mappé à: ${mappedFields.join(', ')}` : `${ref}: ${value || '(vide)'}`}
                          >
                            {isMapped ? (
                              <div className="flex items-center gap-1">
                                <span className="text-green-600">✓</span>
                                <span className="truncate text-green-700" style={{ maxWidth: '80px' }}>
                                  {mappedFields[0]}
                                </span>
                              </div>
                            ) : value || <span className="text-gray-300">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Vue Liste */}
          {viewMode === 'list' && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredCells.length > 0 ? (
                filteredCells.slice(0, 100).map((cell) => {
                  const isMapped = Object.values(mapping).includes(cell.ref);
                  return (
                    <button
                      key={cell.ref}
                      onClick={() => expandedField && handleMapField(expandedField, cell.ref)}
                      disabled={!expandedField}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isMapped
                          ? 'border-green-300 bg-green-50'
                          : !expandedField
                          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-semibold text-gray-900">
                            {cell.ref}
                          </p>
                          <p className="text-xs text-gray-600 truncate mt-1">
                            {cell.value || <span className="italic text-gray-400">(vide)</span>}
                          </p>
                        </div>
                        {expandedField && !isMapped && (
                          <div className="ml-2 text-blue-600">→</div>
                        )}
                        {isMapped && (
                          <span className="ml-2 text-xs text-green-600">✓ mappé</span>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-center text-gray-500 py-4">Aucune cellule trouvée</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3">
            {maxRows} lignes × {maxCols} colonnes
          </p>
        </div>
      </div>

      {/* Résumé du mapping */}
      {mappedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-3">Mappings configurés</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(mapping).map(([field, cells]) => {
              const cellArray = typeof cells === 'string' ? [cells] : cells;
              return (
                <div
                  key={field}
                  className="bg-white p-3 rounded border border-blue-200"
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900">{field}</p>
                    <button
                      onClick={() => handleUnmapField(field)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cellArray.map((cell) => (
                      <span
                        key={cell}
                        className="inline-block text-xs font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded"
                      >
                        {cell}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
        <button
          onClick={handleComplete}
          disabled={mappedCount === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continuer ({mappedCount} mappings)
        </button>
      </div>
    </div>
  );
}
