'use client';

import { useMemo, useState } from 'react';
import { 
  AlertTriangle, 
  Settings, 
  Sparkles, 
  X, 
  FileText, 
  Layers,
  CheckCircle2,
  Grid3x3,
  Link2,
  ChevronRight,
  Info
} from 'lucide-react';
import { TemplateData } from './TemplateWizard';
import {
  CustomFieldsEditor,
  type CustomArrayCategory,
  type CustomCategory,
  type CustomFieldDefinition,
} from '@/components/shared/CustomFieldsEditor';
import { UpdateExpectedJsonStructureButton } from '@/components/shared/UpdateExpectedJsonStructureButton';
import {
  getFieldsByCategoryForSecteur,
  getCategoryLabelForSecteur,
  getQuestionsForSecteur,
  syncSimpleToAdvanced,
  syncAdvancedToSimple,
  getFieldsCount,
  getAllSelectedFields,
  getAllKnownFields,
  TELECOM_LINES_CATEGORIES,
  getSelectedTelecomCategories,
  getMergeLabel,
  generateMergedPrompt,
  type ViewMode,
} from '@/components/admin/organizationFormConfig';
import { updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';

interface Props {
  templateData: Partial<TemplateData>;
  updateTemplateData: (data: Partial<TemplateData>) => void;
  onNext: () => void;
  onSave?: () => void;
  defaultFields: string[];
  secteur: string;
}

export function Step1SelectFields({ templateData, updateTemplateData, onNext, onSave, defaultFields, secteur }: Props) {
  const [nom, setNom] = useState(templateData.nom || '');
  const [description, setDescription] = useState(templateData.description || '');
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [isPromptWarningOpen, setIsPromptWarningOpen] = useState(false);
  const [isPromptEditorEnabled, setIsPromptEditorEnabled] = useState(false);

  const initialPromptValue = useMemo(() => templateData.prompt_template || '', [templateData.prompt_template]);
  const [promptTemplate, setPromptTemplate] = useState<string>(templateData.prompt_template || '');

  const currentQuestions = getQuestionsForSecteur(secteur);
  const fieldsByCategory = useMemo(
    () => getFieldsByCategoryForSecteur(secteur),
    [secteur]
  );
  const allKnownFields = getAllKnownFields();
  
  const knownDefaultFields = defaultFields.filter(f => allKnownFields.includes(f));
  const customDefaultFields = defaultFields.filter(f => !allKnownFields.includes(f));
  
  const initialQuestions = currentQuestions
    .filter(q => q.fields.length > 0 && q.fields.every(f => defaultFields.includes(f)))
    .map(q => q.id);
  
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
    templateData.champs_actifs ? 
      currentQuestions.filter(q => q.fields.every(f => (templateData.champs_actifs || []).includes(f))).map(q => q.id) :
      initialQuestions
  );
  const [selectedFields, setSelectedFields] = useState<string[]>(
    templateData.champs_actifs?.filter(f => allKnownFields.includes(f)) || knownDefaultFields
  );

  const fileConfig =
    templateData.file_config && typeof templateData.file_config === 'object' && !Array.isArray(templateData.file_config)
      ? (templateData.file_config as Record<string, unknown>)
      : {};

  const defsFromConfigRaw = fileConfig.custom_fields;
  const defsFromConfig: CustomFieldDefinition[] = Array.isArray(defsFromConfigRaw)
    ? (defsFromConfigRaw as CustomFieldDefinition[])
    : [];
  const defPaths = new Set(defsFromConfig.map((d) => d.fieldPath));

  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>(defsFromConfig);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(
    Array.isArray(fileConfig.custom_categories) ? (fileConfig.custom_categories as CustomCategory[]) : []
  );
  const [customArrayCategories, setCustomArrayCategories] = useState<CustomArrayCategory[]>(
    Array.isArray(fileConfig.custom_array_fields)
      ? (fileConfig.custom_array_fields as CustomArrayCategory[])
      : []
  );

  const [legacyCustomFields, setLegacyCustomFields] = useState<string[]>(
    templateData.champs_actifs?.filter((f) => !allKnownFields.includes(f) && !defPaths.has(f)) || customDefaultFields
  );
  
  const [activeMerges, setActiveMerges] = useState<string[]>(templateData.merge_config || []);

  const customFieldsList = [...customFieldDefinitions.map((d) => d.fieldPath), ...legacyCustomFields].filter(Boolean);

  const allSelectedFieldsForJson = getAllSelectedFields(
    viewMode,
    selectedQuestions,
    currentQuestions,
    selectedFields,
    customFieldsList
  );

  const promptTemplateForActions =
    promptTemplate || templateData.prompt_template || initialPromptValue || '';

  const [isExpectedJsonOutOfSync, setIsExpectedJsonOutOfSync] = useState(false);

  const applyActiveMerges = (nextActiveMerges: string[]) => {
    setActiveMerges(nextActiveMerges);

    let nextPrompt = updateExpectedJsonStructureFromFields(
      promptTemplateForActions,
      allSelectedFieldsForJson,
      { prune: true }
    );
    if (nextActiveMerges.length > 1) {
      nextPrompt = generateMergedPrompt(nextPrompt, nextActiveMerges);
    }

    if (nextPrompt !== promptTemplateForActions) {
      setPromptTemplate(nextPrompt);
      updateTemplateData({ prompt_template: nextPrompt });
    }
    setIsExpectedJsonOutOfSync(false);
  };

  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);

  const toggleQuestion = (questionId: string) => {
    const newQuestions = selectedQuestions.includes(questionId) 
      ? selectedQuestions.filter(id => id !== questionId) 
      : [...selectedQuestions, questionId];
    
    setSelectedQuestions(newQuestions);
    setIsExpectedJsonOutOfSync(true);
    
    const isTelecomCategory = TELECOM_LINES_CATEGORIES.some(cat => cat.id === questionId);
    if (isTelecomCategory && activeMerges.includes(questionId)) {
      const newMerges = activeMerges.filter(id => id !== questionId);
      applyActiveMerges(newMerges.length >= 2 ? newMerges : []);
    }
  };

  const selectAllQuestions = () => {
    const newQuestions = selectedQuestions.length === currentQuestions.length 
      ? [] 
      : currentQuestions.map(q => q.id);
    
    setSelectedQuestions(newQuestions);
    setIsExpectedJsonOutOfSync(true);
    
    if (newQuestions.length === 0) {
      applyActiveMerges([]);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
    setIsExpectedJsonOutOfSync(true);
  };

  const selectAllInCategory = (category: string) => {
    const fields = fieldsByCategory[category] || [];
    const allSelected = fields.every(f => selectedFields.includes(f));
    if (allSelected) {
      setSelectedFields(prev => prev.filter(f => !fields.includes(f)));
    } else {
      setSelectedFields(prev => [...new Set([...prev, ...fields])]);
    }
    setIsExpectedJsonOutOfSync(true);
  };

  const handleCustomFieldsChange = (next: {
    customFieldDefinitions: CustomFieldDefinition[];
    legacyCustomFields: string[];
    customCategories: CustomCategory[];
    customArrayCategories: CustomArrayCategory[];
  }) => {
    setCustomFieldDefinitions(next.customFieldDefinitions);
    setLegacyCustomFields(next.legacyCustomFields);
    setCustomCategories(next.customCategories);
    setCustomArrayCategories(next.customArrayCategories);
    setIsExpectedJsonOutOfSync(true);

    updateTemplateData({
      file_config: {
        ...(templateData.file_config || {}),
        custom_fields: next.customFieldDefinitions,
        custom_categories: next.customCategories,
        custom_array_fields: next.customArrayCategories,
      },
    });
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'advanced') {
      setSelectedFields(syncSimpleToAdvanced(selectedQuestions, currentQuestions, selectedFields));
    } else {
      setSelectedQuestions(syncAdvancedToSimple(selectedFields, currentQuestions));
    }
    setViewMode(mode);
    setIsExpectedJsonOutOfSync(true);
  };

  const validateAndUpdateData = () => {
    if (!nom.trim()) {
      alert('Veuillez entrer un nom pour le template');
      return false;
    }

    const allFields = getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);
    
    if (allFields.length === 0) {
      alert('Veuillez sélectionner au moins un champ');
      return false;
    }

    updateTemplateData({
      nom: nom.trim(),
      description: description.trim(),
      champs_actifs: allFields,
      merge_config: activeMerges,
      prompt_template: isPromptEditorEnabled ? promptTemplate : templateData.prompt_template,
    });

    return true;
  };

  const handleNext = () => {
    if (validateAndUpdateData()) {
      onNext();
    }
  };

  const handleSave = () => {
    if (validateAndUpdateData() && onSave) {
      onSave();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/30">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Configuration du template
        </h2>
        <p className="text-gray-600 text-lg">
          Nommez votre template et sélectionnez les informations à extraire
        </p>
      </div>

      {/* Nom et description */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            Informations générales
          </h3>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom du template *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder={
              secteur === 'telephonie'
                ? 'Ex: Proposition Téléphonie Standard'
                : 'Ex: Proposition Bureautique Standard'
            }
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Description (optionnel)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            placeholder="Décrivez ce template..."
          />
        </div>

        {/* Prompt avancé */}
        <div className="border-2 border-amber-200 rounded-xl p-5 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-amber-900 mb-1">Prompt personnalisé (avancé)</div>
                <div className="text-sm text-amber-700">
                  Modifier le prompt est une fonctionnalité avancée. Un mauvais réglage peut dégrader la qualité des résultats.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPromptWarningOpen(true)}
              className="shrink-0 px-4 py-2 text-sm font-semibold rounded-lg bg-white border-2 border-amber-200 text-amber-700 hover:bg-amber-50 transition-all"
            >
              Modifier
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-amber-200">
            <UpdateExpectedJsonStructureButton
              promptTemplate={promptTemplateForActions}
              fields={allSelectedFieldsForJson}
              prune
              postProcess={(nextPrompt) => (activeMerges.length > 1 ? generateMergedPrompt(nextPrompt, activeMerges) : nextPrompt)}
              onUpdate={(nextPrompt) => {
                setPromptTemplate(nextPrompt);
                updateTemplateData({ prompt_template: nextPrompt });
                setIsExpectedJsonOutOfSync(false);
              }}
            />
            {isExpectedJsonOutOfSync && (
              <div className="mt-3 flex items-start gap-2 text-xs text-orange-700 bg-white/60 border border-orange-300 rounded-lg px-3 py-2.5">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {'Vous avez modifié les champs à extraire. Pensez à cliquer sur "Mettre à jour la structure JSON..." pour synchroniser.'}
                </span>
              </div>
            )}
          </div>

          {isPromptEditorEnabled && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              <label className="block text-sm font-semibold text-amber-900 mb-2">Prompt personnalisé</label>
              <textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-xs bg-white"
                placeholder="Saisissez votre prompt..."
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-amber-700">
                  Conservez le placeholder <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">{'{liste_champs_actifs}'}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromptTemplate(templateData.prompt_template || initialPromptValue || '');
                      setIsPromptEditorEnabled(false);
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-gray-200 bg-white hover:bg-gray-50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateTemplateData({ prompt_template: promptTemplate });
                      setIsPromptEditorEnabled(false);
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal d'avertissement */}
      {isPromptWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsPromptWarningOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-xl text-gray-900">Modification avancée</h3>
              <button
                type="button"
                onClick={() => setIsPromptWarningOpen(false)}
                className="ml-auto p-2 rounded-lg hover:bg-white/50 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3 text-gray-700">
              <p className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠️</span>
                <span>{"Modifier le prompt peut impacter fortement le résultat d'extraction."}</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">❌</span>
                <span>{"En cas d'erreur, les données extraites peuvent être incomplètes, incorrectes, ou au mauvais format."}</span>
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  <strong>Conseil :</strong> Conservez le placeholder{' '}
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-blue-200">{'{liste_champs_actifs}'}</span>
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsPromptWarningOpen(false)}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg border-2 border-gray-200 bg-white hover:bg-gray-50 transition-all"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPromptEditorEnabled(true);
                  const nextValue = promptTemplate || templateData.prompt_template || initialPromptValue || '';
                  if (!promptTemplate && nextValue) setPromptTemplate(nextValue);
                  if (!templateData.prompt_template && nextValue) updateTemplateData({ prompt_template: nextValue });
                  setIsPromptWarningOpen(false);
                }}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30"
              >
                {"J'ai compris, modifier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sélection des champs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
              <Grid3x3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Données à extraire</h3>
              <p className="text-sm text-gray-600">
                Sélectionnez les informations que vous souhaitez extraire des documents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">
              {fieldsCount} champ{fieldsCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Toggle Simple/Avancé */}
        <div className="flex gap-2 mb-6 p-1.5 bg-gray-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => handleViewModeChange('simple')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
              viewMode === 'simple' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Vue Simple
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('advanced')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
              viewMode === 'advanced' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            Vue Avancée
          </button>
        </div>

        {/* Vue Simple */}
        {viewMode === 'simple' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{"Sélectionnez les catégories d'informations à extraire"}</p>
              <button
                type="button"
                onClick={selectAllQuestions}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5 hover:gap-2 transition-all"
              >
                {selectedQuestions.length === currentQuestions.length ? '✓ Tout désélectionner' : 'Tout sélectionner'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestions.map((q) => {
                const isSelected = selectedQuestions.includes(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleQuestion(q.id)}
                    className={`group p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-lg scale-[1.02]'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-600' 
                          : 'border-gray-300 group-hover:border-gray-400'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-semibold mb-1.5 ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                          {q.question}
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed mb-2">{q.description}</p>
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md ${
                          isSelected 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {q.fields.length} champ{q.fields.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fusion de catégories */}
            {(() => {
              const selectedTelecomCats = getSelectedTelecomCategories(selectedQuestions);
              if (selectedTelecomCats.length >= 2) {
                return (
                  <div className="border-2 border-purple-300 rounded-xl p-6 bg-gradient-to-r from-purple-50 to-pink-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Link2 className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="font-bold text-purple-900 text-lg">
                        Fusion de catégories
                      </h3>
                    </div>
                    <p className="text-sm text-purple-700 mb-4">
                      Fusionnez plusieurs catégories dans un tableau unique (minimum 2 catégories requises)
                    </p>
                    
                    <div className="space-y-2.5 mb-4">
                      {selectedTelecomCats.map((catId) => {
                        const cat = TELECOM_LINES_CATEGORIES.find(c => c.id === catId);
                        const isChecked = activeMerges.includes(catId);
                        return (
                          <label key={catId} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-200 cursor-pointer hover:bg-purple-50 transition-all">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              isChecked 
                                ? 'bg-purple-600 border-purple-600' 
                                : 'border-purple-300'
                            }`}>
                              {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  applyActiveMerges([...activeMerges, catId]);
                                } else {
                                  const newMerges = activeMerges.filter(id => id !== catId);
                                  applyActiveMerges(newMerges.length >= 2 ? newMerges : []);
                                }
                              }}
                              className="sr-only"
                            />
                            <span className="text-sm font-semibold text-purple-800">{cat?.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    {activeMerges.length >= 2 && (
                      <div className="p-4 bg-white rounded-lg border-2 border-purple-300">
                        <p className="text-sm text-purple-900 font-semibold mb-2 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-600" />
                          Fusion active : <strong>{getMergeLabel(activeMerges)}</strong>
                        </p>
                        {selectedTelecomCats.filter(c => !activeMerges.includes(c)).length > 0 && (
                          <p className="text-xs text-purple-700 mt-2 flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>Non fusionné(s) : {getMergeLabel(selectedTelecomCats.filter(c => !activeMerges.includes(c)))} → tableaux séparés</span>
                          </p>
                        )}
                      </div>
                    )}

                    {activeMerges.length === 1 && (
                      <div className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-300 rounded-lg px-3 py-2.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Sélectionnez au moins 2 catégories pour activer la fusion.</span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Vue Avancée */}
        {viewMode === 'advanced' && (
          <div className="space-y-6">
            {/* Filtres par catégorie */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  selectedCategory === 'all' 
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {Object.keys(fieldsByCategory).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedCategory === cat 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {getCategoryLabelForSecteur(secteur, cat)}
                </button>
              ))}
              {customCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedCategory === cat.id 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Champs par catégorie */}
            {Object.entries(fieldsByCategory)
              .filter(([cat]) => selectedCategory === 'all' || selectedCategory === cat)
              .map(([cat, fields]) => (
                <div key={cat} className="border-2 border-gray-200 rounded-xl p-6 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-5">
                    <h4 className="text-lg font-bold text-gray-900">{getCategoryLabelForSecteur(secteur, cat)}</h4>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(cat)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5 hover:gap-2 transition-all"
                    >
                      {fields.every(f => selectedFields.includes(f)) ? '✓ Désélectionner' : 'Tout sélectionner'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {fields.map((field) => {
                      const isSelected = selectedFields.includes(field);
                      return (
                        <label
                          key={field}
                          title={field}
                          className={`flex items-center gap-2.5 cursor-pointer p-3 rounded-lg transition-all min-w-0 ${
                            isSelected 
                              ? 'bg-blue-50 border-2 border-blue-300' 
                              : 'hover:bg-gray-50 border-2 border-transparent'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                            isSelected 
                              ? 'bg-blue-600 border-blue-600' 
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleField(field)}
                            className="sr-only"
                          />
                          <span className={`text-sm truncate ${isSelected ? 'font-semibold text-blue-900' : 'text-gray-700'}`}>
                            {field}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

            <CustomFieldsEditor
              secteur={secteur}
              activeMerges={activeMerges}
              selectedCategory={selectedCategory}
              reservedFieldPaths={getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, [])}
              customFieldDefinitions={customFieldDefinitions}
              legacyCustomFields={legacyCustomFields}
              customCategories={customCategories}
              customArrayCategories={customArrayCategories}
              onChange={handleCustomFieldsChange}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t-2 border-gray-200">
        <div className="text-sm text-gray-500">
          Étape 1 sur 3
        </div>
        <div className="flex gap-3">
          {onSave && (
            <button
              onClick={handleSave}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
            >
              Sauvegarder
            </button>
          )}
          <button
            onClick={handleNext}
            className="group px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            Continuer
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
