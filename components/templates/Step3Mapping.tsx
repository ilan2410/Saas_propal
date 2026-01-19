'use client';

import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { TemplateData } from './TemplateWizard';

interface Props {
  templateData: Partial<TemplateData>;
  updateTemplateData: (data: Partial<TemplateData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Step3Mapping({
  templateData,
  updateTemplateData,
  onNext,
  onPrev,
}: Props) {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);

  useEffect(() => {
    // Simuler la détection automatique des variables dans le template
    // En production, cela viendrait d'une API qui analyse le fichier
    if (templateData.file_type === 'word') {
      setDetectedVariables([
        '{{nom_entreprise}}',
        '{{contact_nom}}',
        '{{total_mensuel_ht}}',
      ]);
    } else if (templateData.file_type === 'excel') {
      setDetectedVariables(['A1', 'B2', 'C3', 'D4']);
    } else {
      setDetectedVariables(['field_1', 'field_2', 'field_3']);
    }
  }, [templateData.file_type]);

  const handleMappingChange = (variable: string, field: string) => {
    setMappings((prev) => ({
      ...prev,
      [variable]: field,
    }));
  };

  const handleNext = () => {
    // Créer la configuration selon le type de fichier
    let fileConfig: any = {};

    if (templateData.file_type === 'word') {
      fileConfig = {
        fieldMappings: mappings,
      };
    } else if (templateData.file_type === 'excel') {
      fileConfig = {
        feuilleCiblee: 'Feuil1',
        cellMappings: mappings,
        preserverFormules: true,
      };
    } else if (templateData.file_type === 'pdf') {
      fileConfig = {
        champsFormulaire: mappings,
      };
    }

    updateTemplateData({
      file_config: fileConfig,
    });

    onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Étape 3 : Mapping des champs
        </h2>
        <p className="text-gray-600">
          Associez les variables du template aux champs à extraire
        </p>
      </div>

      {/* Info sur le type de fichier */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-700">
          <strong>Type de fichier :</strong> {templateData.file_type?.toUpperCase()}
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {templateData.file_type === 'word' &&
            'Mappez les variables {{variable}} aux champs'}
          {templateData.file_type === 'excel' &&
            'Mappez les cellules (A1, B2...) aux champs'}
          {templateData.file_type === 'pdf' &&
            'Mappez les champs du formulaire PDF aux champs'}
        </p>
      </div>

      {/* Mapping automatique suggéré */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">
          💡 Mapping automatique suggéré
        </h3>
        <p className="text-sm text-blue-800">
          Les correspondances ci-dessous sont détectées automatiquement. Vous pouvez
          les modifier si nécessaire.
        </p>
      </div>

      {/* Mappings */}
      <div className="space-y-4">
        {detectedVariables.map((variable) => (
          <div
            key={variable}
            className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg"
          >
            {/* Variable du template */}
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Variable dans le template
              </label>
              <div className="px-3 py-2 bg-gray-100 rounded font-mono text-sm">
                {variable}
              </div>
            </div>

            {/* Arrow */}
            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

            {/* Champ à extraire */}
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                Champ à extraire
              </label>
              <select
                value={mappings[variable] || ''}
                onChange={(e) => handleMappingChange(variable, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sélectionner un champ...</option>
                {templateData.champs_actifs?.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Ajouter un mapping manuel */}
      <div className="border-t border-gray-200 pt-6">
        <button className="text-sm text-blue-600 hover:text-blue-700">
          + Ajouter un mapping manuel
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onPrev}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Précédent
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
