'use client';

import { useState } from 'react';
import { FileText, CheckCircle2, ArrowRight, Sparkles, Hash } from 'lucide-react';
import { PropositionData } from './PropositionWizard';

function countMappedFields(fileConfig: any): number {
  if (!fileConfig || typeof fileConfig !== 'object') return 0;

  const mappedFields = new Set<string>();

  const sheetMappings = Array.isArray(fileConfig.sheetMappings)
    ? fileConfig.sheetMappings
    : [];
  for (const sheetMapping of sheetMappings) {
    const mapping = sheetMapping?.mapping;
    if (!mapping || typeof mapping !== 'object') continue;
    for (const [field, value] of Object.entries(mapping)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  const arrayMappings = Array.isArray(fileConfig.arrayMappings)
    ? fileConfig.arrayMappings
    : [];
  for (const arrayMapping of arrayMappings) {
    const columnMapping = arrayMapping?.columnMapping;
    if (!columnMapping || typeof columnMapping !== 'object') continue;
    for (const [field, value] of Object.entries(columnMapping)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  return mappedFields.size;
}

interface Props {
  templates: any[];
  secteur: string;
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
}

export function Step1SelectTemplate({
  templates,
  secteur,
  propositionData,
  updatePropositionData,
  onNext,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    propositionData.template_id || ''
  );
  const [copieursCount, setCopieursCount] = useState<number>(
    Math.max(1, Number(propositionData.copieurs_count || 1))
  );

  const handleNext = () => {
    if (!selectedTemplateId) {
      alert('Veuillez sélectionner un template');
      return;
    }

    const nextData = {
      template_id: selectedTemplateId,
      copieurs_count: secteur === 'bureautique' ? Math.max(1, Number(copieursCount || 1)) : 1,
    };

    updatePropositionData(nextData);

    if (propositionData.proposition_id) {
      fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          current_step: 2,
          statut: 'draft',
        }),
      }).catch(() => {});
    }

    onNext();
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Configuration des couleurs par type de fichier
  const getFileTypeConfig = (fileType: string) => {
    switch (fileType) {
      case 'excel':
        return {
          bg: 'from-emerald-500 to-emerald-600',
          lightBg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          icon: 'text-emerald-600',
          hover: 'hover:border-emerald-300',
          selected: 'border-emerald-600 bg-emerald-50',
          shadow: 'shadow-emerald-500/30'
        };
      case 'word':
        return {
          bg: 'from-blue-500 to-blue-600',
          lightBg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: 'text-blue-600',
          hover: 'hover:border-blue-300',
          selected: 'border-blue-600 bg-blue-50',
          shadow: 'shadow-blue-500/30'
        };
      default:
        return {
          bg: 'from-red-500 to-red-600',
          lightBg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: 'text-red-600',
          hover: 'hover:border-red-300',
          selected: 'border-red-600 bg-red-50',
          shadow: 'shadow-red-500/30'
        };
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/30">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Sélection du template
        </h2>
        <p className="text-gray-600 text-lg">
          Choisissez le modèle qui servira de base à votre proposition commerciale
        </p>
      </div>

      {/* Configuration bureautique */}
      {secteur === 'bureautique' && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <label className="block text-base font-semibold text-blue-900 mb-3">
                Nombre de copieurs
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={copieursCount}
                onChange={(e) => {
                  const n = Math.max(1, Number(e.target.value || 1));
                  setCopieursCount(n);
                }}
                className="w-full max-w-xs px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white font-semibold text-lg shadow-sm"
              />
              <p className="text-sm text-blue-700 mt-3 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">ℹ️</span>
                Cette information structure la proposition selon le nombre de matériels à inclure
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sélection du template */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            Templates disponibles
          </h3>
          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold">
            {templates.length} {templates.length > 1 ? 'modèles' : 'modèle'}
          </span>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Aucun template disponible
            </h3>
            <p className="text-gray-600 text-sm">
              Créez d'abord un template avant de générer une proposition
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => {
              const config = getFileTypeConfig(template.file_type);
              const isSelected = selectedTemplateId === template.id;
              const mappedFieldsCount = countMappedFields(template.file_config);
              const totalFields = template.champs_actifs?.length || 0;

              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`group relative p-6 rounded-xl border-2 text-left transition-all duration-300 ${
                    isSelected
                      ? `${config.selected} shadow-lg scale-105`
                      : `border-gray-200 ${config.hover} hover:shadow-md bg-white`
                  }`}
                >
                  {/* Badge de sélection */}
                  {isSelected && (
                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/50 animate-in zoom-in duration-300">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  )}

                  {/* Header du template */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${config.bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${config.shadow} group-hover:scale-110 transition-transform duration-300`}>
                      <FileText className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 text-lg mb-1 truncate">
                        {template.nom}
                      </h3>
                      <span className={`inline-block px-2 py-1 ${config.lightBg} ${config.text} text-xs font-semibold rounded-md uppercase tracking-wide`}>
                        {template.file_type}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-4 leading-relaxed">
                      {template.description}
                    </p>
                  )}

                  {/* Statistiques */}
                  <div className="pt-4 border-t border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 font-medium">Champs configurés</span>
                      <span className="font-bold text-gray-900">{totalFields}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 font-medium">Champs mappés</span>
                      <span className="font-bold text-gray-900">{mappedFieldsCount}</span>
                    </div>
                    
                    {/* Barre de progression */}
                    <div className="pt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`bg-gradient-to-r ${config.bg} h-full rounded-full transition-all duration-500`}
                          style={{ 
                            width: totalFields > 0 
                              ? `${(mappedFieldsCount / totalFields) * 100}%` 
                              : '0%' 
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 text-center font-medium">
                        {totalFields > 0 
                          ? `${Math.round((mappedFieldsCount / totalFields) * 100)}% complété`
                          : 'Aucun champ'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Indicateur de sélection en bas */}
                  {isSelected && (
                    <div className={`mt-4 pt-4 border-t ${config.border} flex items-center justify-center gap-2 text-sm font-semibold ${config.text}`}>
                      <CheckCircle2 className="w-4 h-4" />
                      Template sélectionné
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Résumé de sélection */}
      {selectedTemplate && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 shadow-lg animate-in slide-in-from-bottom duration-500">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-500/30">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-green-900 text-lg mb-2">
                Template sélectionné
              </h3>
              <div className="space-y-2 text-sm text-green-800">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Nom :</span>
                  <span>{selectedTemplate.nom}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Type :</span>
                  <span className="uppercase font-mono">{selectedTemplate.file_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Configuration :</span>
                  <span>
                    {selectedTemplate.champs_actifs?.length || 0} champs configurés • {' '}
                    {countMappedFields(selectedTemplate.file_config)} mappés
                  </span>
                </div>
                {selectedTemplate.description && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <p className="italic">{selectedTemplate.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t-2 border-gray-200">
        <div className="text-sm text-gray-500">
          Étape 1 sur 3
        </div>
        <button
          onClick={handleNext}
          disabled={!selectedTemplateId}
          className="group px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all font-semibold text-lg shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-3 hover:scale-105 active:scale-95"
        >
          Continuer
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}