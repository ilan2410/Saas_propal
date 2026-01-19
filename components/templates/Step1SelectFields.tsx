'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Settings, Sparkles, X } from 'lucide-react';
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
  defaultFields: string[]; // Champs définis par l'admin
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

  useEffect(() => {
    if (!promptTemplate && templateData.prompt_template) {
      setPromptTemplate(templateData.prompt_template);
    }
  }, [promptTemplate, templateData.prompt_template]);
  
  // Initialiser les questions et champs à partir des defaultFields de l'admin
  const currentQuestions = getQuestionsForSecteur(secteur);
  const fieldsByCategory = useMemo(
    () => getFieldsByCategoryForSecteur(secteur),
    [secteur]
  );
  const allKnownFields = getAllKnownFields();
  
  // Séparer les champs connus des champs personnalisés
  const knownDefaultFields = defaultFields.filter(f => allKnownFields.includes(f));
  const customDefaultFields = defaultFields.filter(f => !allKnownFields.includes(f));
  
  // Initialiser les questions sélectionnées basées sur les defaultFields
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

  const defsFromConfig: CustomFieldDefinition[] = (templateData.file_config as any)?.custom_fields || [];
  const defPaths = new Set(defsFromConfig.map((d) => d.fieldPath));

  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>(defsFromConfig);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(
    (templateData.file_config as any)?.custom_categories || []
  );
  const [customArrayCategories, setCustomArrayCategories] = useState<CustomArrayCategory[]>(
    (templateData.file_config as any)?.custom_array_fields || []
  );

  const [legacyCustomFields, setLegacyCustomFields] = useState<string[]>(
    templateData.champs_actifs?.filter((f) => !allKnownFields.includes(f) && !defPaths.has(f)) || customDefaultFields
  );
  
  // État pour les fusions actives (initialisé depuis templateData ou vide)
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
  const didInitExpectedJsonSync = useRef(false);

  useEffect(() => {
    if (!didInitExpectedJsonSync.current) {
      didInitExpectedJsonSync.current = true;
      return;
    }
    setIsExpectedJsonOutOfSync(true);
  }, [viewMode, selectedQuestions, selectedFields, customFieldDefinitions, legacyCustomFields, activeMerges]);

  const didInitMergePromptSync = useRef(false);

  useEffect(() => {
    if (!didInitMergePromptSync.current) {
      didInitMergePromptSync.current = true;
      return;
    }

    let nextPrompt = updateExpectedJsonStructureFromFields(promptTemplateForActions, allSelectedFieldsForJson, { prune: true });
    if (activeMerges.length > 1) {
      nextPrompt = generateMergedPrompt(nextPrompt, activeMerges);
    }

    if (nextPrompt !== promptTemplateForActions) {
      setPromptTemplate(nextPrompt);
      updateTemplateData({ prompt_template: nextPrompt });
      setIsExpectedJsonOutOfSync(false);
    }
  }, [activeMerges]);

  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);

  const toggleQuestion = (questionId: string) => {
    const newQuestions = selectedQuestions.includes(questionId) 
      ? selectedQuestions.filter(id => id !== questionId) 
      : [...selectedQuestions, questionId];
    
    setSelectedQuestions(newQuestions);
    
    // Mettre à jour les fusions si une catégorie télécom est décochée
    const isTelecomCategory = TELECOM_LINES_CATEGORIES.some(cat => cat.id === questionId);
    if (isTelecomCategory && activeMerges.includes(questionId)) {
      // Si on décoche une catégorie qui était dans la fusion, la retirer
      const newMerges = activeMerges.filter(id => id !== questionId);
      // Si moins de 2 catégories restent, désactiver la fusion
      setActiveMerges(newMerges.length >= 2 ? newMerges : []);
    }
  };

  const selectAllQuestions = () => {
    const newQuestions = selectedQuestions.length === currentQuestions.length 
      ? [] 
      : currentQuestions.map(q => q.id);
    
    setSelectedQuestions(newQuestions);
    
    // Réinitialiser les fusions si on désélectionne tout
    if (newQuestions.length === 0) {
      setActiveMerges([]);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const selectAllInCategory = (category: string) => {
    const fields = fieldsByCategory[category] || [];
    const allSelected = fields.every(f => selectedFields.includes(f));
    if (allSelected) {
      setSelectedFields(prev => prev.filter(f => !fields.includes(f)));
    } else {
      setSelectedFields(prev => [...new Set([...prev, ...fields])]);
    }
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Étape 1 : Informations et champs
        </h2>
        <p className="text-gray-600">
          Nommez votre template et sélectionnez les champs à extraire
        </p>
      </div>

      {/* Nom et description */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nom du template *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={
              secteur === 'telephonie'
                ? 'Ex: Proposition Téléphonie Standard'
                : 'Ex: Proposition Bureautique Standard'
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description (optionnel)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Décrivez ce template..."
          />
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">Prompt (avancé)</div>
              <div className="text-sm text-gray-600 mt-1">
                Modifier le prompt est une fonctionnalité avancée. Un mauvais réglage peut dégrader la qualité des résultats.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPromptWarningOpen(true)}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
            >
              Modifier le prompt
            </button>
          </div>

          <div className="mt-3">
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
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Vous avez modifié les champs à extraire. Pensez à cliquer sur “Mettre à jour la structure JSON…” pour synchroniser la structure.
              </div>
            )}
          </div>

          {isPromptEditorEnabled && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Prompt personnalisé</label>
              <textarea
                value={promptTemplate}
                onChange={(e) => {
                  setPromptTemplate(e.target.value);
                }}
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                placeholder="Saisissez votre prompt..."
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPromptTemplate(templateData.prompt_template || initialPromptValue || '');
                    setIsPromptEditorEnabled(false);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateTemplateData({ prompt_template: promptTemplate });
                    setIsPromptEditorEnabled(false);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Enregistrer
                </button>
              </div>
              <div className="text-xs text-gray-600 mt-2">
                Assure-toi de conserver le placeholder <span className="font-mono">{'{liste_champs_actifs}'}</span>.
              </div>
            </div>
          )}
        </div>
      </div>

      {isPromptWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsPromptWarningOpen(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div className="font-semibold text-gray-900">Modification avancée</div>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptWarningOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
              <div>
                Modifier le prompt peut impacter fortement le résultat d'extraction.
              </div>
              <div>
                En cas d'erreur, les données extraites peuvent être incomplètes, incorrectes, ou au mauvais format.
              </div>
              <div className="text-xs text-gray-600">
                Conseil : garde le placeholder <span className="font-mono">{'{liste_champs_actifs}'}</span>.
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPromptWarningOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPromptEditorEnabled(true);
                  const nextValue =
                    promptTemplate ||
                    templateData.prompt_template ||
                    initialPromptValue ||
                    '';

                  if (!promptTemplate && nextValue) {
                    setPromptTemplate(nextValue);
                  }

                  if (!templateData.prompt_template && nextValue) {
                    updateTemplateData({ prompt_template: nextValue });
                  }
                  setIsPromptWarningOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                J'ai compris, modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sélection des champs */}
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Données à extraire</h3>
            <p className="text-sm text-gray-600 mt-1">
              Champs pré-configurés par votre administrateur. Vous pouvez les modifier.
            </p>
          </div>
          <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
            {fieldsCount} champ{fieldsCount > 1 ? 's' : ''}
          </span>
        </div>

        {/* Toggle Simple/Avancé */}
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => handleViewModeChange('simple')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
              viewMode === 'simple' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Vue Simple
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('advanced')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
              viewMode === 'advanced' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            Vue Avancée
          </button>
        </div>

        {/* Vue Simple */}
        {viewMode === 'simple' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">Sélectionnez ce que vous souhaitez extraire</p>
              <button
                type="button"
                onClick={selectAllQuestions}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {selectedQuestions.length === currentQuestions.length ? '✓ Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => toggleQuestion(q.id)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedQuestions.includes(q.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedQuestions.includes(q.id)}
                      onChange={() => {}}
                      className="w-5 h-5 text-blue-600 rounded mt-1"
                    />
                    <div>
                      <h4 className="font-semibold text-gray-900">{q.question}</h4>
                      <p className="text-sm text-gray-600 mt-1">{q.description}</p>
                      <span className="inline-block mt-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {q.fields.length} champs
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Option de fusion dynamique - apparaît quand 2+ catégories télécom sont sélectionnées */}
            {(() => {
              const selectedTelecomCats = getSelectedTelecomCategories(selectedQuestions);
              if (selectedTelecomCats.length >= 2) {
                return (
                  <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h3 className="font-semibold text-purple-800 mb-2">
                      🔗 Fusionner des catégories
                    </h3>
                    <p className="text-sm text-purple-600 mb-3">
                      Cochez les catégories à fusionner dans un tableau unique (minimum 2).
                    </p>
                    
                    {/* Checkboxes pour chaque catégorie télécom sélectionnée */}
                    <div className="space-y-2 mb-3">
                      {selectedTelecomCats.map((catId) => {
                        const cat = TELECOM_LINES_CATEGORIES.find(c => c.id === catId);
                        return (
                          <label key={catId} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activeMerges.includes(catId)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setActiveMerges([...activeMerges, catId]);
                                } else {
                                  const newMerges = activeMerges.filter(id => id !== catId);
                                  setActiveMerges(newMerges.length >= 2 ? newMerges : []);
                                }
                              }}
                              className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500"
                            />
                            <span className="text-sm text-purple-700">{cat?.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    {/* Affichage du résultat de la fusion */}
                    {activeMerges.length >= 2 && (
                      <div className="p-3 bg-purple-100 rounded-lg">
                        <p className="text-sm text-purple-800 font-medium mb-2">
                          ✓ Fusion : <strong>{getMergeLabel(activeMerges)}</strong>
                        </p>
                        {selectedTelecomCats.filter(c => !activeMerges.includes(c)).length > 0 && (
                          <p className="text-xs text-purple-600 mt-2">
                            📌 Non fusionné(s) : {getMergeLabel(selectedTelecomCats.filter(c => !activeMerges.includes(c)))} → tableau(x) séparé(s)
                          </p>
                        )}
                      </div>
                    )}

                    {activeMerges.length === 1 && (
                      <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                        ⚠️ Sélectionnez au moins 2 catégories pour activer la fusion.
                      </p>
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {Object.keys(fieldsByCategory).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                <div key={cat} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">{getCategoryLabelForSecteur(secteur, cat)}</h4>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(cat)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {fields.every(f => selectedFields.includes(f)) ? '✓ Désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {fields.map((field) => (
                      <label
                        key={field}
                        className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field)}
                          onChange={() => toggleField(field)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">{field}</span>
                      </label>
                    ))}
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
      <div className="flex justify-end pt-6 border-t border-gray-200 gap-3">
        {onSave && (
          <button
            onClick={handleSave}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sauvegarder
          </button>
        )}
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
