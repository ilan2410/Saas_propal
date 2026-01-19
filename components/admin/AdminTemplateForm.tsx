'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, FileText, Settings, Sparkles, Upload, ArrowLeft } from 'lucide-react';
import { Step2UploadTemplate } from '../templates/Step2UploadTemplate';
import { TemplateData, ExcelState } from '../templates/TemplateWizard';
import { renderPromptTemplate, updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';
import { CustomFieldsEditor, type CustomArrayCategory, type CustomCategory, type CustomFieldDefinition } from '@/components/shared/CustomFieldsEditor';
import { UpdateExpectedJsonStructureButton } from '@/components/shared/UpdateExpectedJsonStructureButton';
import {
  ALL_FIELDS,
  CLAUDE_MODELS,
  getCategoryLabel,
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
} from './organizationFormConfig';

interface Props {
  organizationId: string;
  organizationName: string;
  secteur: string;
  template?: any;
  isEditing?: boolean;
  initialPromptTemplate?: string;
}

export function AdminTemplateForm({ 
  organizationId, 
  organizationName, 
  secteur,
  template,
  isEditing = false,
  initialPromptTemplate,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [showUpload, setShowUpload] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [legacyCustomFields, setLegacyCustomFields] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeMerges, setActiveMerges] = useState<string[]>(template?.merge_config || []);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(
    template?.file_config?.custom_categories || []
  );

  const [customArrayCategories, setCustomArrayCategories] = useState<CustomArrayCategory[]>(
    template?.file_config?.custom_array_fields || []
  );

  // État pour le fichier Excel (upload et mapping)
  const [excelState, setExcelState] = useState<ExcelState>({
    file: null,
    fileName: template?.file_name || null,
    sheets: [], // On ne charge pas les sheets existantes pour l'instant
    mappings: template?.file_config?.sheetMappings || [],
    arrayMappings: template?.file_config?.arrayMappings || [],
  });

  const DEFAULT_PROMPT = `Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "fournisseur": "Nom du fournisseur/distributeur actuel",
  "client": {
    "nom": "Nom du contact",
    "prenom": "Prénom",
    "email": "email@exemple.com",
    "fonction": "Fonction",
    "mobile": "06 XX XX XX XX",
    "fixe": "01 XX XX XX XX",
    "raison_sociale": "Nom de l'entreprise",
    "adresse": "Adresse complète",
    "code_postal": "75001",
    "ville": "Paris",
    "siret": "XXXXXXXXXXXXX",
    "ape": "Code APE",
    "capital": "Capital social",
    "forme_juridique": "SAS/SARL/etc",
    "rcs": "RCS"
  },
  "lignes": [
    {"numero_ligne": "0XXXXXXXXX", "type": "mobile|fixe|internet", "forfait": "Nom forfait", "quantite": "1", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ],
  "location_materiel": [
    {"type": "Location", "quantite": "1", "materiel": "Description", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ]
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide
- Utilise null pour les informations absentes
- Les tarifs sont des nombres (29.99 et non "29,99€")
- Les tableaux peuvent contenir plusieurs éléments
- Extrais TOUTES les lignes trouvées dans le document

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

  const [formData, setFormData] = useState({
    nom: template?.nom || '',
    file_type: template?.file_type || 'excel',
    file_url: template?.file_url || '',
    file_name: template?.file_name || '',
    file_size_mb: template?.file_size_mb || 0,
    file_config: template?.file_config || {},
    description: template?.description || '',
    claude_model: template?.claude_model || 'claude-sonnet-4-5-20250929',
    prompt_template: template?.prompt_template || initialPromptTemplate || DEFAULT_PROMPT,
  });

  // Charger les feuilles Excel si on édite un template existant avec un fichier Excel
  useEffect(() => {
    if (template?.file_type === 'excel' && template.file_url && excelState.sheets.length === 0) {
      const loadSheets = async () => {
        setIsFileLoading(true);
        try {
          const response = await fetch('/api/templates/parse-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: template.file_url }),
          });

          if (response.ok) {
            const data = await response.json();
            setExcelState(prev => ({ ...prev, sheets: data.sheets || [] }));
          }
        } catch (err) {
          console.error('Erreur chargement feuilles:', err);
        } finally {
          setIsFileLoading(false);
        }
      };
      loadSheets();
    }
  }, [template?.file_type, template?.file_url]);

  const currentQuestions = getQuestionsForSecteur(secteur);

  // Initialiser les champs sélectionnés si on édite
  useEffect(() => {
    if (template?.champs_actifs && template.champs_actifs.length > 0) {
      const existingFields: string[] = template.champs_actifs;
      const allKnownFields = getAllKnownFields();
      const knownFields = existingFields.filter((f) => allKnownFields.includes(f));
      const unknownFields = existingFields.filter((f) => !allKnownFields.includes(f));
      setSelectedFields(knownFields);

      const defsFromConfig: CustomFieldDefinition[] = template?.file_config?.custom_fields || [];
      const defPaths = new Set(defsFromConfig.map((d) => d.fieldPath));
      const legacy = unknownFields.filter((f) => !defPaths.has(f));

      setCustomFieldDefinitions(defsFromConfig);
      setLegacyCustomFields(legacy);
      
      const questionsToSelect = currentQuestions
        .filter((q) => q.fields.length > 0 && q.fields.every((f) => existingFields.includes(f)))
        .map((q) => q.id);
      setSelectedQuestions(questionsToSelect);
    }
  }, [template?.champs_actifs]);

  const customFieldsList = [...customFieldDefinitions.map((d) => d.fieldPath), ...legacyCustomFields].filter(Boolean);

  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);

  const allFieldsForPrompt = getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);

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

    let nextPrompt = updateExpectedJsonStructureFromFields(formData.prompt_template, allFieldsForPrompt, { prune: true });
    if (activeMerges.length > 1) {
      nextPrompt = generateMergedPrompt(nextPrompt, activeMerges);
    }

    if (nextPrompt !== formData.prompt_template) {
      setFormData((prev) => ({ ...prev, prompt_template: nextPrompt }));
      setIsExpectedJsonOutOfSync(false);
    }
  }, [activeMerges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const allFields = getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);
      
      if (allFields.length === 0) {
        setError('Veuillez sélectionner au moins un champ à extraire');
        setIsLoading(false);
        return;
      }

      const endpoint = isEditing 
        ? `/api/admin/templates/${template.id}/update`
        : '/api/admin/templates/create';
      
      const method = isEditing ? 'PATCH' : 'POST';

      // Générer le prompt final avec les fusions si actives
      const finalPrompt = activeMerges.length > 1 
        ? generateMergedPrompt(formData.prompt_template, activeMerges)
        : formData.prompt_template;

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          nom: formData.nom,
          description: formData.description,
          file_type: formData.file_type,
          file_url: formData.file_url,
          file_name: formData.file_name,
          file_size_mb: formData.file_size_mb,
          file_config: formData.file_config,
          claude_model: formData.claude_model,
          prompt_template: finalPrompt,
          champs_actifs: allFields,
          merge_config: activeMerges,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
      }

      const result = await response.json();
      router.push(`/admin/clients/${organizationId}/templates/${result.template?.id || template.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleQuestion = (questionId: string) => {
    const newQuestions = selectedQuestions.includes(questionId) 
      ? selectedQuestions.filter((id) => id !== questionId) 
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
      : currentQuestions.map((q) => q.id);
    
    setSelectedQuestions(newQuestions);
    
    // Réinitialiser les fusions si on désélectionne tout
    if (newQuestions.length === 0) {
      setActiveMerges([]);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const selectAllInCategory = (category: string) => {
    const fields = ALL_FIELDS[category as keyof typeof ALL_FIELDS] || [];
    const allSelected = fields.every((f) => selectedFields.includes(f));
    if (allSelected) {
      setSelectedFields((prev) => prev.filter((f) => !fields.includes(f)));
    } else {
      setSelectedFields((prev) => [...new Set([...prev, ...fields])]);
    }
  };

  const saveCustomConfigToFileConfig = (
    nextDefs: CustomFieldDefinition[],
    nextCats: CustomCategory[],
    nextArrayCats: CustomArrayCategory[]
  ) => {
    setFormData((prev) => ({
      ...prev,
      file_config: {
        ...(prev.file_config || {}),
        custom_fields: nextDefs,
        custom_categories: nextCats,
        custom_array_fields: nextArrayCats,
      },
    }));
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
    saveCustomConfigToFileConfig(next.customFieldDefinitions, next.customCategories, next.customArrayCategories);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'advanced') {
      setSelectedFields(syncSimpleToAdvanced(selectedQuestions, currentQuestions, selectedFields));
    } else {
      setSelectedQuestions(syncAdvancedToSimple(selectedFields, currentQuestions));
    }
    setViewMode(mode);
  };

  // Calculer les champs actifs actuels pour les passer au wizard
  const currentAllFields = getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFieldsList);
  const templateDataWithFields = {
    ...formData,
    champs_actifs: currentAllFields
  };

  if (showUpload) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <button
          onClick={() => setShowUpload(false)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au formulaire
        </button>

        <div className="bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <Step2UploadTemplate
            templateData={templateDataWithFields as Partial<TemplateData>}
            updateTemplateData={(data) => setFormData(prev => ({ ...prev, ...data }))}
            excelState={excelState}
            updateExcelState={(data) => setExcelState(prev => ({ ...prev, ...data }))}
            secteur={secteur}
            onNext={() => setShowUpload(false)}
            onPrev={() => setShowUpload(false)}
            isLoading={isFileLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Informations de base */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-100 rounded-lg">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Informations du template</h2>
            <p className="text-sm text-gray-600">Nom et type de fichier</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom du template *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Facture téléphonie"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fichier Template Master
            </label>
            <div className="border border-gray-300 rounded-lg p-4">
              {formData.file_url ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded">
                      <FileText className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {formData.file_name || 'Template configuré'}
                      </p>
                      <p className="text-xs text-gray-500 uppercase">
                        {formData.file_type} • {formData.file_size_mb ? `${formData.file_size_mb.toFixed(2)} MB` : 'Taille inconnue'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUpload(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Modifier
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500 mb-3">
                    Aucun fichier template configuré
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowUpload(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <Upload className="w-4 h-4" />
                    Uploader et configurer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configuration IA */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Configuration IA</h2>
            <p className="text-sm text-gray-600">Modèle et prompt d'extraction pour ce template</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modèle Claude
            </label>
            <select
              value={formData.claude_model}
              onChange={(e) => setFormData({ ...formData, claude_model: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-2">
              Claude 3.7 Sonnet offre une meilleure précision d'extraction.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prompt personnalisé
            </label>
            <textarea
              value={formData.prompt_template}
              onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="Prompt d'extraction..."
            />
            <div className="mt-2">
              <UpdateExpectedJsonStructureButton
                promptTemplate={formData.prompt_template}
                fields={allFieldsForPrompt}
                prune
                postProcess={(nextPrompt) =>
                  activeMerges.length > 1 ? generateMergedPrompt(nextPrompt, activeMerges) : nextPrompt
                }
                onUpdate={(nextPrompt) => {
                  setFormData({ ...formData, prompt_template: nextPrompt });
                  setIsExpectedJsonOutOfSync(false);
                }}
              />
              {isExpectedJsonOutOfSync && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Vous avez modifié les champs à extraire. Pensez à cliquer sur “Mettre à jour la structure JSON…” pour synchroniser la structure.
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Variables disponibles : <code className="bg-gray-100 px-1 rounded">{'{liste_champs_actifs}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{documents}'}</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prompt final (aperçu)
            </label>
            <pre className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 font-mono text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">
              {renderPromptTemplate({
                prompt_template:
                  activeMerges.length > 1
                    ? generateMergedPrompt(formData.prompt_template, activeMerges)
                    : formData.prompt_template,
                champs_actifs: allFieldsForPrompt,
                secteur: secteur,
              })}
            </pre>
            <p className="text-sm text-gray-500 mt-2">
              Cet aperçu est recalculé automatiquement à partir des champs sélectionnés.
            </p>
          </div>
        </div>
      </div>

      {/* Données à extraire */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Données à extraire</h2>
              <p className="text-sm text-gray-600">Choisissez les informations à extraire</p>
            </div>
          </div>
          <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
            {fieldsCount} champ{fieldsCount > 1 ? 's' : ''}
          </span>
        </div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => handleViewModeChange('simple')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              viewMode === 'simple' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Vue Simple
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('advanced')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              viewMode === 'advanced' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
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
                className="text-sm text-blue-600 font-medium"
              >
                {selectedQuestions.length === currentQuestions.length ? '✓ Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => toggleQuestion(q.id)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedQuestions.includes(q.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
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
                      <h3 className="font-semibold text-gray-900">{q.question}</h3>
                      <p className="text-sm text-gray-600">{q.description}</p>
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
                        <div className="text-xs text-purple-700">
                          <strong>Exemple de sortie JSON :</strong>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap bg-purple-50 p-2 rounded">
{`"lignes": [
${activeMerges.map((catId, i) => {
  const cat = TELECOM_LINES_CATEGORIES.find(c => c.id === catId);
  return `  {"type": "${cat?.type}", "numero_ligne": "...", "forfait": "...", "tarif": "..."}`;
}).join(',\n')}
]`}
                          </pre>
                        </div>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Toutes
              </button>
              {Object.keys(ALL_FIELDS).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {getCategoryLabel(cat)}
                </button>
              ))}
              {customCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {Object.entries(ALL_FIELDS)
              .filter(([cat]) => selectedCategory === 'all' || selectedCategory === cat)
              .map(([cat, fields]) => (
                <div key={cat} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">{getCategoryLabel(cat)}</h3>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(cat)}
                      className="text-sm text-blue-600 font-medium"
                    >
                      {fields.every((f) => selectedFields.includes(f)) ? '✓ Désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {fields.map((field) => (
                      <label key={field} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
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
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={isLoading}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isLoading || fieldsCount === 0}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isEditing ? 'Enregistrement...' : 'Création...'}
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              {isEditing ? 'Enregistrer' : 'Créer le template'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
