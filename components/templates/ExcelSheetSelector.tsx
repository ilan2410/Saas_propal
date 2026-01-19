'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, Grid3x3, AlertCircle } from 'lucide-react';

interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
  cells: { [key: string]: string };
  preview: { ref: string; value: string }[];
}

interface Props {
  file: File;
  onSheetSelected: (sheet: SheetInfo) => void;
  onCancel: () => void;
}

export function ExcelSheetSelector({ file, onSheetSelected, onCancel }: Props) {
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const parseFile = async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/templates/parse-excel', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Erreur parsing');

        const data = await response.json();
        setSheets(data.sheets);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du parsing');
      } finally {
        setIsLoading(false);
      }
    };

    parseFile();
  }, [file]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyse du fichier Excel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Erreur</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">Aucune feuille trouvée dans le fichier</p>
      </div>
    );
  }

  const currentSheet = sheets[selectedSheetIndex];

  return (
    <div className="space-y-6">
      {/* Sélection des feuilles */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Sélectionnez une feuille ({sheets.length} trouvée{sheets.length > 1 ? 's' : ''})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setSelectedSheetIndex(idx)}
              className={`p-4 rounded-lg border-2 transition-colors text-left ${
                selectedSheetIndex === idx
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <Grid3x3 className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 truncate">{sheet.name}</h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {sheet.rows} lignes × {sheet.cols} colonnes
                  </p>
                </div>
                {selectedSheetIndex === idx && (
                  <ChevronRight className="w-5 h-5 text-blue-600 flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Aperçu de la feuille sélectionnée */}
      <div className="border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Aperçu : {currentSheet.name}
        </h3>

        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
          <table className="text-sm">
            <tbody>
              {currentSheet.preview.map((cell) => (
                <tr key={cell.ref} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-4 py-2 font-mono text-gray-600 bg-gray-100 w-20">
                    {cell.ref}
                  </td>
                  <td className="px-4 py-2 text-gray-900">{cell.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {currentSheet.preview.length === 0 && (
            <p className="text-gray-500 text-center py-4">Aucune donnée trouvée</p>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Affichage des 20 premières cellules avec contenu
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={() => onSheetSelected(currentSheet)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Continuer avec {currentSheet.name}
        </button>
      </div>
    </div>
  );
}
