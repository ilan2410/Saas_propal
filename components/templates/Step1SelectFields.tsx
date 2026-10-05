'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Settings,
  Sparkles,
  FileText,
  Layers,
  CheckCircle2,
  Grid3x3,
  Link2,
  ChevronRight,
  Info,
  Lock
} from 'lucide-react';
import { TemplateData } from './TemplateWizard';
import {
  CustomFieldsEditor,
  type CustomArrayCategory,
  type CustomCategory,
  type CustomFieldDefinition,
} from '@/components/shared/CustomFieldsEditor';
import {
  getFieldsByCategoryForSecteur,
  getCategoryLabelForSecteur,
  getQuestionsForSecteur,
  syncSimpleToAdvanced,
  syncAdvancedToSimple,
  getFieldsCount,
  getAllSelectedFields,
  getAllKnownFields,
  MERGEABLE_CATEGORIES,
  getSelectedTelecomCategories,
  getMergeLabel,
  generateMergedPrompt,
  normalizeTemplateFieldPaths,
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

const SA_QUESTION_ID = 'situation_actuelle';

export function Step1SelectFields({ templateData, updateTemplateData, onNext, onSave, defaultFields, secteur }: Props) {
  const [nom, setNom] = useState(templateData.nom || '');
  const [description, setDescription] = useState(templateData.description || '');
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const currentQuestions = getQuestionsForSecteur(secteur);
  // La situation actuelle est toujours extraite par le pipeline SA (prompts codés
  // en dur) : la catégorie est cochée d'office et ne peut pas être décochée.
  const saQuestion = currentQuestions.find((q) => q.id === SA_QUESTION_ID);
  const isSaLocked = Boolean(saQuestion);
  const saLockedFields = new Set(saQuestion?.fields ?? []);
  const fieldsByCategory = useMemo(
    () => getFieldsByCategoryForSecteur(secteur),
    [secteur]
  );
  const allKnownFields = getAllKnownFields();
  const normalizedChampsActifs = normalizeTemplateFieldPaths(templateData.champs_actifs || []);
  
  const knownDefaultFields = defaultFields.filter(f => allKnownFields.includes(f));
  const customDefaultFields = defaultFields.filter(f => !allKnownFields.includes(f));
  
  const initialQuestions = currentQuestions
    .filter(q => q.fields.length > 0 && q.fields.every(f => defaultFields.includes(f)))
    .map(q => q.id);
  
  const withLockedQuestion = (ids: string[]) =>
    isSaLocked && !ids.includes(SA_QUESTION_ID) ? [...ids, SA_QUESTION_ID] : ids;
  const withLockedFields = (fields: string[]) =>
    isSaLocked ? [...new Set([...fields, ...saLockedFields])] : fields;

  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
    withLockedQuestion(
      templateData.champs_actifs ?
        currentQuestions.filter(q => q.fields.every(f => normalizedChampsActifs.includes(f))).map(q => q.id) :
        initialQuestions
    )
  );
  const [selectedFields, setSelectedFields] = useState<string[]>(
    withLockedFields(
      templateData.champs_actifs ? normalizedChampsActifs.filter(f => allKnownFields.includes(f)) : knownDefaultFields
    )
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
    templateData.champs_actifs ? normalizedChampsActifs.filter((f) => !allKnownFields.includes(f) && !defPaths.has(f)) : customDefaultFields
  );
  
  const [activeMerges, setActiveMerges] = useState<string[]>(templateData.merge_config || []);

  // Règle de calcul SA : les charges variables (consommations hors forfait,
  // pénalités, frais ponctuels) comptent-elles dans le total mensuel ? Défaut : oui.
  const [inclureChargesVariables, setInclureChargesVariables] = useState<boolean>(
    fileConfig.inclure_charges_variables_sa !== false
  );

  const toggleInclureChargesVariables = () => {
    const next = !inclureChargesVariables;
    setInclureChargesVariables(next);
    updateTemplateData({
      file_config: {
        ...(templateData.file_config || {}),
        inclure_charges_variables_sa: next,
      },
    });
  };

  // Rendu Word : forcer toutes les variables ({{...}}) du document généré en
  // MAJUSCULES. Le texte fixe du modèle n'est pas modifié. Défaut : non.
  const [forcerMajusculesVariables, setForcerMajusculesVariables] = useState<boolean>(
    fileConfig.forcerMajusculesVariables === true
  );

  const toggleForcerMajusculesVariables = () => {
    const next = !forcerMajusculesVariables;
    setForcerMajusculesVariables(next);
    updateTemplateData({
      file_config: {
        ...(templateData.file_config || {}),
        forcerMajusculesVariables: next,
      },
    });
  };

  const customFieldsList = [...customFieldDefinitions.map((d) => d.fieldPath), ...legacyCustomFields].filter(Boolean);

  const allSelectedFieldsForJson = getAllSelectedFields(
    viewMode,
    selectedQuestions,
    currentQuestions,
    selectedFields,
    customFieldsList
  );

  // Le prompt n'est plus éditable côté client (réservé à l'admin). On le garde
  // simplement synchronisé avec les champs choisis : il ne sert qu'aux templates
  // hors pipeline SA (bureautique), le pipeline SA utilisant ses prompts codés en dur.
  const buildSyncedPrompt = (fields: string[], merges: string[]) => {
    const current = templateData.prompt_template || '';
    let next = updateExpectedJsonStructureFromFields(current, fields, { prune: true });
    if (merges.length > 1) next = generateMergedPrompt(next, merges);
    return next;
  };

  const applyActiveMerges = (nextActiveMerges: string[]) => {
    setActiveMerges(nextActiveMerges);
    const nextPrompt = buildSyncedPrompt(allSelectedFieldsForJson, nextActiveMerges);
    if (nextPrompt !== (templateData.prompt_template || '')) {
      updateTemplateData({ prompt_template: nextPrompt });
    }
  };

  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);

  const toggleQuestion = (questionId: string) => {
    if (isSaLocked && questionId === SA_QUESTION_ID) return;
    const newQuestions = selectedQuestions.includes(questionId)
      ? selectedQuestions.filter(id => id !== questionId)
      : [...selectedQuestions, questionId];

    setSelectedQuestions(newQuestions);

    const isTelecomCategory = MERGEABLE_CATEGORIES.some((cat) => cat.id === questionId);
    if (isTelecomCategory && activeMerges.includes(questionId)) {
      const newMerges = activeMerges.filter(id => id !== questionId);
      applyActiveMerges(newMerges.length >= 2 ? newMerges : []);
    }
  };

  const selectAllQuestions = () => {
    const newQuestions = selectedQuestions.length === currentQuestions.length
      ? withLockedQuestion([])
      : currentQuestions.map(q => q.id);

    setSelectedQuestions(newQuestions);

    if (newQuestions.every((id) => !MERGEABLE_CATEGORIES.some((cat) => cat.id === id))) {
      applyActiveMerges([]);
    }
  };

  const isFieldLocked = (field: string) => isSaLocked && saLockedFields.has(field);

  const toggleField = (field: string) => {
    if (isFieldLocked(field)) return;
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const selectAllInCategory = (category: string) => {
    const fields = (fieldsByCategory[category] || []).filter(f => !isFieldLocked(f));
    if (fields.length === 0) return;
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
      setSelectedFields(withLockedFields(syncSimpleToAdvanced(selectedQuestions, currentQuestions, selectedFields)));
    } else {
      setSelectedQuestions(withLockedQuestion(syncAdvancedToSimple(selectedFields, currentQuestions)));
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
      prompt_template: buildSyncedPrompt(allFields, activeMerges),
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
      <div id="template-step1-header" className="text-center">
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
      </div>

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
                const isLocked = isSaLocked && q.id === SA_QUESTION_ID;
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleQuestion(q.id)}
                    aria-disabled={isLocked}
                    className={`group p-5 border-2 rounded-xl transition-all duration-200 ${
                      isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${
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
                        {isLocked && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                            <Lock className="w-3 h-3" />
                            Obligatoire
                          </span>
                        )}
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
                        const cat = MERGEABLE_CATEGORIES.find((c) => c.id === catId);
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

            <CustomFieldsEditor
              secteur={secteur}
              activeMerges={activeMerges}
              selectedCategory="all"
              reservedFieldPaths={getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, [])}
              customFieldDefinitions={customFieldDefinitions}
              legacyCustomFields={legacyCustomFields}
              customCategories={customCategories}
              customArrayCategories={customArrayCategories}
              onChange={handleCustomFieldsChange}
            />
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
                    {fields.every(f => isFieldLocked(f)) ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                        <Lock className="w-4 h-4" />
                        Obligatoire
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectAllInCategory(cat)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5 hover:gap-2 transition-all"
                      >
                        {fields.filter(f => !isFieldLocked(f)).every(f => selectedFields.includes(f)) ? '✓ Désélectionner' : 'Tout sélectionner'}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {fields.map((field) => {
                      const isSelected = selectedFields.includes(field);
                      const isLocked = isFieldLocked(field);
                      return (
                        <label
                          key={field}
                          title={field}
                          className={`flex items-center gap-2.5 p-3 rounded-lg transition-all min-w-0 ${
                            isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                          } ${
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
                            disabled={isLocked}
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

      {/* Règles de calcul — Situation actuelle */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center shadow-lg">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Règles de calcul — Situation actuelle</h3>
            <p className="text-sm text-gray-600">Comment agréger le coût mensuel actuel du client</p>
          </div>
        </div>

        <label
          className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
            inclureChargesVariables
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
            inclureChargesVariables ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
          }`}>
            {inclureChargesVariables && <CheckCircle2 className="w-4 h-4 text-white" />}
          </div>
          <input
            type="checkbox"
            checked={inclureChargesVariables}
            onChange={toggleInclureChargesVariables}
            className="sr-only"
          />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 mb-1">
              Comptabiliser les charges variables dans le total mensuel
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Consommations hors forfait, pénalités de retard et frais ponctuels. Décoché, ces
              montants restent extraits et affichés à titre indicatif mais ne sont pas ajoutés au
              coût mensuel de la situation actuelle.
            </p>
          </div>
        </label>
      </div>

      {/* Options du document Word */}
      {templateData.file_type === 'word' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Options du document Word</h3>
              <p className="text-sm text-gray-600">Mise en forme des variables dans la proposition générée</p>
            </div>
          </div>

          <label
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              forcerMajusculesVariables
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              forcerMajusculesVariables ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
            }`}>
              {forcerMajusculesVariables && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={forcerMajusculesVariables}
              onChange={toggleForcerMajusculesVariables}
              className="sr-only"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 mb-1">
                Forcer les variables en MAJUSCULES dans le document généré
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                Toutes les balises <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{'{{variable}}'}</code> sont
                rendues en majuscules. Le texte fixe de votre modèle Word n&apos;est pas modifié.
                Les adresses email gardent leur casse d&apos;origine.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t-2 border-gray-200">
        <div className="text-sm text-gray-500">
          Étape 1 sur 3
        </div>
        <div className="flex flex-col items-end gap-2">
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
              className="group px-8 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95"
            >
              Continuer
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
