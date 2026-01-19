'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TemplateData } from './TemplateWizard';

interface Props {
  templateData: Partial<TemplateData>;
  onComplete: () => void;
  onPrev: () => void;
}

export function Step3Test({ templateData, onComplete, onPrev }: Props) {
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete();
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Étape 3 : Récapitulatif
        </h2>
        <p className="text-gray-600">
          Vérifiez les informations avant de sauvegarder votre template
        </p>
      </div>

      {/* Récapitulatif */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4">
          📋 Récapitulatif du template
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-600">Nom</dt>
            <dd className="text-sm font-medium text-gray-900">
              {templateData.nom}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Type</dt>
            <dd className="text-sm font-medium text-gray-900">
              {templateData.file_type?.toUpperCase()}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Champs actifs</dt>
            <dd className="text-sm font-medium text-gray-900">
              {templateData.champs_actifs?.length || 0} champs
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Mappings</dt>
            <dd className="text-sm font-medium text-gray-900">
              {Object.keys(templateData.file_config || {}).length} configurés
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onPrev}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Précédent
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isCompleting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isCompleting ? 'Création...' : 'Créer le template'}
          </button>
        </div>
      </div>
    </div>
  );
}
