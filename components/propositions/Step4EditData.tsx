'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Save, ChevronDown, ChevronRight, Plus, Trash2, CheckCircle, AlertCircle, FileSpreadsheet, List, Sparkles } from 'lucide-react';
import { PropositionData } from './PropositionWizard';
import { ExcelDataEditor } from './ExcelDataEditor';
import {
  getCategoryLabelForSecteur,
  getFieldsByCategoryForSecteur,
} from '@/components/admin/organizationFormConfig';

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ExcelFileConfig = {
  sheetMappings?: Array<{
    sheetName: string;
    mapping: Record<string, string | string[]>;
  }>;
  arrayMappings?: Array<{
    arrayId: string;
    sheetName: string;
    startRow?: number;
    columnMapping?: Record<string, string>;
  }>;
};

interface Props {
  secteur: string;
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

// Formater le nom du champ pour l'affichage
function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Récupérer une valeur imbriquée
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part, 10)];
      continue;
    }
    if (isPlainObject(current)) {
      current = current[part];
      continue;
    }
    return undefined;
  }
  return current;
}

// Chercher une valeur dans les données extraites pour un champ donné
function findValueForField(data: UnknownRecord, fieldName: string): unknown {
  // Chercher directement
  if (data[fieldName] !== undefined) {
    return data[fieldName];
  }

  // Mapping des champs vers les chemins dans les données
  const fieldMappings: Record<string, string[]> = {
    // Client
    'contact_nom': ['client.contacts.0.nom', 'client.contact.nom', 'contact.nom'],
    'contact_prenom': ['client.contacts.0.prenom', 'client.contact.prenom', 'contact.prenom'],
    'contact_email': ['client.contacts.0.email', 'client.contact.email', 'contact.email'],
    'contact_telephone': ['client.contacts.0.telephone', 'client.contact.telephone', 'contact.telephone'],
    'contact_mobile': ['client.contacts.0.mobile', 'client.contact.mobile', 'contact.mobile'],
    'contact_fonction': ['client.contacts.0.fonction', 'client.contact.fonction', 'contact.fonction'],
    'client_nom': ['client.raison_sociale', 'client.nom_commercial', 'client.nom'],
    'raison_sociale': ['client.raison_sociale'],
    'nom_commercial': ['client.nom_commercial'],
    'siren': ['client.siren'],
    'siret': ['client.siret'],
    'adresse': ['client.adresse.rue', 'client.adresse'],
    'code_postal': ['client.adresse.code_postal'],
    'ville': ['client.adresse.ville'],
    // Fournisseur actuel
    'operateur_nom': ['fournisseur_actuel.operateur', 'fournisseur.nom', 'operateur'],
    'fournisseur_nom': ['fournisseur_actuel.operateur', 'fournisseur.nom'],
    'operateur_actuel': ['fournisseur_actuel.operateur'],
    'engagement_fin': ['fournisseur_actuel.engagement_fin', 'fournisseur_actuel.fin_engagement'],
    'montant_actuel': ['fournisseur_actuel.montant_mensuel', 'fournisseur_actuel.montant'],
    // Facturation
    'total_ht': ['facturation.total_ht', 'montant_ht'],
    'total_ttc': ['facturation.total_ttc', 'montant_ttc'],
    'numero_facture': ['facturation.numero_facture', 'numero_facture'],
    'date_facture': ['facturation.date_facture', 'date_facture'],
  };

  const paths = fieldMappings[fieldName];
  if (paths) {
    for (const path of paths) {
      const value = getNestedValue(data, path);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }

  // Chercher dans les sous-objets
  for (const value of Object.values(data)) {
    if (!isPlainObject(value)) continue;
    if (value[fieldName] !== undefined) {
      return value[fieldName];
    }
  }

  return undefined;
}

function setNestedValue(obj: unknown, path: string, value: unknown): UnknownRecord {
  const parts = path.split('.');
  const newObj: UnknownRecord = isPlainObject(obj) ? { ...obj } : {};
  let current: UnknownRecord = newObj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = current[part];
    current[part] = isPlainObject(existing) ? { ...existing } : {};
    current = current[part] as UnknownRecord;
  }

  current[parts[parts.length - 1]] = value;
  return newObj;
}

// Composant pour éditer un objet
function ObjectFieldEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: UnknownRecord;
  onChange: (val: UnknownRecord) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleFieldChange = (key: string, newValue: unknown) => {
    onChange({ ...value, [key]: newValue });
  };

  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
      >
        <span className="font-semibold text-blue-900">{formatFieldName(label)}</span>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-blue-600" />
        ) : (
          <ChevronRight className="w-5 h-5 text-blue-600" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          {Object.entries(value || {}).map(([key, val]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {formatFieldName(key)}
              </label>
              <input
                type="text"
                value={
                  val === null || val === undefined
                    ? ''
                    : typeof val === 'object'
                      ? JSON.stringify(val)
                      : String(val)
                }
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Composant pour éditer un tableau
function ArrayFieldEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown[];
  onChange: (val: unknown[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleItemChange = (index: number, newValue: unknown) => {
    const newArray = [...value];
    newArray[index] = newValue;
    onChange(newArray);
  };

  const handleRemoveItem = (index: number) => {
    const newArray = value.filter((_, i) => i !== index);
    onChange(newArray);
  };

  const handleAddItem = () => {
    const first = value[0];
    const newItem: unknown = isPlainObject(first) ? {} : '';
    onChange([...value, newItem]);
  };

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-purple-50 hover:bg-purple-100 transition-colors"
      >
        <span className="font-semibold text-purple-900">
          {formatFieldName(label)} 
          <span className="ml-2 text-sm font-normal text-purple-600">
            ({value?.length || 0} élément{(value?.length || 0) > 1 ? 's' : ''})
          </span>
        </span>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-purple-600" />
        ) : (
          <ChevronRight className="w-5 h-5 text-purple-600" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          {(value || []).map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                {isPlainObject(item) ? (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-gray-500 mb-2">
                      Élément {index + 1}
                    </div>
                    {Object.entries(item).map(([key, val]) => (
                      <div key={key} className="flex gap-2 items-center">
                        <label className="text-sm text-gray-600 w-32 flex-shrink-0">
                          {formatFieldName(key)}:
                        </label>
                        <input
                          type="text"
                          value={typeof val === 'object' ? JSON.stringify(val) : (typeof val === 'string' ? val : String(val ?? ''))}
                          onChange={(e) => handleItemChange(index, { ...item, [key]: e.target.value })}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={String(item ?? '')}
                    onChange={(e) => handleItemChange(index, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={`Élément ${index + 1}`}
                  />
                )}
              </div>
              <button
                onClick={() => handleRemoveItem(index)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddItem}
            className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un élément
          </button>
        </div>
      )}
    </div>
  );
}

export function Step4EditData({
  secteur,
  propositionData,
  updatePropositionData,
  onNext,
  onPrev,
}: Props) {
  const initialEditedData: UnknownRecord = isPlainObject(propositionData.donnees_extraites)
    ? propositionData.donnees_extraites
    : {};

  const [editedData, setEditedData] = useState<UnknownRecord>(initialEditedData);
  const [copieursCount, setCopieursCount] = useState<number>(
    Math.max(1, Number(propositionData.copieurs_count || 1))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'simple' | 'complex'>('simple');
  const [viewMode, setViewMode] = useState<'excel' | 'form'>('excel');
  const [suggestions, setSuggestions] = useState<unknown | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [templateInfo, setTemplateInfo] = useState<{
    file_url: string;
    file_config: unknown;
    champs_actifs: string[];
  } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fieldsByCategoryRef = useMemo(() => {
    return getFieldsByCategoryForSecteur(secteur);
  }, [secteur]);

  const ensureBureautiqueArraysCount = useCallback(
    (data: UnknownRecord, count: number): UnknownRecord => {
      if (secteur !== 'bureautique') return data;
      const target = Math.max(1, Number(count || 1));
      const next: UnknownRecord = { ...(data || {}) };

      const keys = [
        'materiels',
        'locations',
        'maintenance',
        'facturation_clics',
        'releves_compteurs',
        'options',
        'engagements',
      ];

      for (const k of keys) {
        const current = Array.isArray(next[k]) ? [...(next[k] as unknown[])] : [];
        if (current.length < target) {
          for (let i = current.length; i < target; i += 1) {
            current.push({});
          }
        }
        next[k] = current;
      }

      return next;
    },
    [secteur]
  );

  useEffect(() => {
    if (secteur !== 'bureautique') return;
    setEditedData((prev) => ensureBureautiqueArraysCount(prev, copieursCount));
  }, [secteur, copieursCount, ensureBureautiqueArraysCount]);

  // Charger les infos du template
  useEffect(() => {
    async function loadTemplate() {
      if (!propositionData.template_id) return;
      
      try {
        const response = await fetch(`/api/templates/${propositionData.template_id}`);
        if (response.ok) {
          const data = await response.json();
          const template = data.template || data;
          setTemplateInfo({
            file_url: template.file_url,
            file_config: template.file_config || {},
            champs_actifs: template.champs_actifs || [],
          });
          
          // Ouvrir toutes les catégories par défaut
          const categories = new Set<string>();
          (template.champs_actifs || []).forEach((field: string) => {
            Object.entries(fieldsByCategoryRef).forEach(([cat, fields]) => {
              if (fields.includes(field)) {
                categories.add(cat);
              }
            });
          });
          setExpandedCategories(categories);
        }
      } catch (error) {
        console.error('Erreur chargement template:', error);
      }
    }
    
    loadTemplate();
  }, [propositionData.template_id, fieldsByCategoryRef]);

  // Grouper les champs actifs par catégorie (seulement les champs simples)
  const fieldsByCategory = useMemo(() => {
    if (!templateInfo?.champs_actifs) return {};
    
    const grouped: Record<string, string[]> = {};
    
    const simpleFields = templateInfo.champs_actifs.filter((f) => !String(f).includes('[]'));

    simpleFields.forEach((field) => {
      let found = false;
      Object.entries(fieldsByCategoryRef).forEach(([cat, catFields]) => {
        if (catFields.includes(field)) {
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(field);
          found = true;
        }
      });
      // Champs personnalisés
      if (!found) {
        if (!grouped['custom']) grouped['custom'] = [];
        grouped['custom'].push(field);
      }
    });
    
    return grouped;
  }, [templateInfo?.champs_actifs, fieldsByCategoryRef]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Séparer les données structurées (tableaux uniquement) des objets conteneurs
  const complexFields: Record<string, unknown[]> = {};

  // Fonction récursive pour trouver tous les tableaux dans les données
  const findArrays = (obj: unknown, prefix: string = '') => {
    if (!isPlainObject(obj)) return;
    Object.entries(obj).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (Array.isArray(value) && value.length > 0) {
        // C'est un tableau avec des données
        complexFields[fullKey] = value;
      } else if (isPlainObject(value)) {
        // C'est un objet, chercher des tableaux à l'intérieur
        findArrays(value, fullKey);
      }
    });
  };

  findArrays(editedData);

  // Fonction pour obtenir la valeur d'un champ (utilise findValueForField)
  const getFieldValue = (fieldName: string): string => {
    const normalized = String(fieldName);

    // Priorité : dot-notation exacte (ex: client.nom)
    if (normalized.includes('.')) {
      const direct = getNestedValue(editedData, normalized);
      if (direct !== undefined && direct !== null) {
        if (typeof direct === 'object') return JSON.stringify(direct);
        return String(direct);
      }
    }

    const value = findValueForField(editedData, normalized);
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Fonction pour mettre à jour un champ (gère les chemins imbriqués)
  const updateFieldValue = (fieldName: string, newValue: string) => {
    const normalized = String(fieldName);

    // Dot-notation : on écrit à l'endroit exact (ex: client.nom)
    if (normalized.includes('.')) {
      setEditedData((prev) => setNestedValue(prev, normalized, newValue));
      return;
    }

    // Fallback legacy (clé plate)
    setEditedData((prev) => ({
      ...prev,
      [normalized]: newValue,
    }));
  };

  const handleFieldChange = (key: string, value: unknown) => {
    // Gérer les chemins imbriqués (ex: "lignes.fixes")
    if (key.includes('.')) {
      setEditedData((prev) => setNestedValue(prev, key, value));
    } else {
      setEditedData((prev) => ({
        ...prev,
        [key]: value,
      }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      console.log('Sauvegarde proposition:', propositionData.proposition_id);
      console.log('Données à sauvegarder:', editedData);
      
      const response = await fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filled_data: editedData,
        }),
      });

      const result = await response.json();
      console.log('Réponse API:', result);

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Erreur sauvegarde');
      }

      updatePropositionData({
        donnees_extraites: editedData,
      });

      onNext();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenererSuggestions = async () => {
    setIsLoadingSuggestions(true);
    try {
      const catalogueRes = await fetch('/api/catalogue');
      const catalogueJson = await catalogueRes.json();
      if (!catalogueRes.ok) {
        throw new Error(catalogueJson?.error || 'Erreur chargement catalogue');
      }

      const res = await fetch('/api/propositions/generer-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation_actuelle: editedData,
          catalogue: catalogueJson?.produits || [],
          preferences: { objectif: 'equilibre' },
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error || 'Erreur génération suggestions');
      }

      setSuggestions(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erreur lors de la génération');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Compter les champs simples (total des champs dans fieldsByCategory)
  const simpleFieldsCount = Object.values(fieldsByCategory).reduce((acc, fields) => acc + fields.length, 0);
  const complexFieldsCount = Object.keys(complexFields).length;
  
  // Compter les champs remplis
  const totalFieldsCount = simpleFieldsCount + complexFieldsCount;
  
  // Compter les champs simples remplis
  const filledSimpleFieldsCount = Object.values(fieldsByCategory)
    .flat()
    .filter(field => {
      const val = getFieldValue(field);
      return val !== '';
    }).length;
  
  // Compter les champs structurés remplis
  const filledComplexFieldsCount = Object.keys(complexFields).filter(key => {
    const val = complexFields[key];
    return val !== null && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0);
  }).length;
  
  const filledFieldsCount = filledSimpleFieldsCount + filledComplexFieldsCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Vérification et édition
          </h2>
          <p className="text-gray-600">
            Vérifiez et modifiez les données extraites si nécessaire
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Toggle vue Excel / Formulaire */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('excel')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'excel'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Vue Excel
            </button>
            <button
              onClick={() => setViewMode('form')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'form'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <List className="w-4 h-4" />
              Formulaire
            </button>
          </div>
          
          <button
            onClick={handleGenererSuggestions}
            disabled={isLoadingSuggestions}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            {isLoadingSuggestions ? 'Génération...' : 'Suggestions IA'}
          </button>

          <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              {filledFieldsCount}/{totalFieldsCount} champs remplis
            </span>
          </div>
        </div>
      </div>

      {suggestions !== null && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Suggestions IA</h3>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-96">
            {JSON.stringify(suggestions, null, 2)}
          </pre>
        </div>
      )}

      {/* Vue Excel */}
      {viewMode === 'excel' && (
        templateInfo ? (
          <ExcelDataEditor
            templateFileUrl={templateInfo.file_url}
            fileConfig={{
              sheetMappings: (templateInfo?.file_config as ExcelFileConfig)?.sheetMappings,
              arrayMappings: (templateInfo?.file_config as ExcelFileConfig)?.arrayMappings
            }}
            extractedData={editedData}
            onDataChange={setEditedData}
            onSave={handleSave}
            isSaving={isSaving}
          />
        ) : (
          <div className="flex items-center justify-center py-12 bg-gray-50 rounded-lg">
            <div className="text-center">
              <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Chargement du template...</p>
            </div>
          </div>
        )
      )}

      {/* Vue Formulaire */}
      {viewMode === 'form' && (
        <>
          {secteur === 'bureautique' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                Nombre de copieurs *
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={copieursCount}
                onChange={(e) => {
                  const n = Math.max(1, Number(e.target.value || 1));
                  setCopieursCount(n);
                  updatePropositionData({ copieurs_count: n });
                }}
                className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <p className="text-xs text-blue-800 mt-2">
                Si l&apos;extraction n&apos;a pas détecté tous les matériels, on pré-crée des lignes vides à compléter.
              </p>
            </div>
          )}

          {/* Tabs - toujours affichés */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('simple')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'simple'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📝 Champs simples ({simpleFieldsCount})
            </button>
            <button
              onClick={() => setActiveTab('complex')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'complex'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📊 Données structurées ({complexFieldsCount})
            </button>
          </div>

          {/* Formulaire d'édition */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {activeTab === 'simple' ? (
                <>
                  {Object.keys(fieldsByCategory).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>Aucun champ configuré dans le template</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(fieldsByCategory).map(([category, categoryFields]) => {
                        const filledCount = categoryFields.filter(f => getFieldValue(f) !== '').length;
                        const isComplete = filledCount === categoryFields.length;
                        const hasPartial = filledCount > 0 && !isComplete;
                        
                        // Couleur de la catégorie basée sur le remplissage
                        const borderColor = isComplete ? 'border-green-200' : hasPartial ? 'border-blue-200' : 'border-gray-200';
                        const headerBg = isComplete ? 'bg-green-50 hover:bg-green-100' : hasPartial ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100';
                        const titleColor = isComplete ? 'text-green-900' : hasPartial ? 'text-blue-900' : 'text-gray-900';
                        const iconColor = isComplete ? 'text-green-600' : hasPartial ? 'text-blue-600' : 'text-gray-600';
                        
                        return (
                          <div key={category} className={`border ${borderColor} rounded-lg overflow-hidden`}>
                            {/* En-tête de catégorie */}
                            <button
                              onClick={() => toggleCategory(category)}
                              className={`w-full flex items-center justify-between px-4 py-3 ${headerBg} transition-colors`}
                            >
                              <div className="flex items-center gap-3">
                                {expandedCategories.has(category) ? (
                                  <ChevronDown className={`w-5 h-5 ${iconColor}`} />
                                ) : (
                                  <ChevronRight className={`w-5 h-5 ${iconColor}`} />
                                )}
                                <span className={`font-semibold ${titleColor}`}>
                                  {category === 'custom'
                                    ? '🔧 Personnalisés'
                                    : getCategoryLabelForSecteur(secteur, category)}
                                </span>
                                <span className="text-xs text-gray-500 bg-white/50 px-2 py-0.5 rounded-full">
                                  {categoryFields.length} champ{categoryFields.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              {/* Indicateur de remplissage */}
                              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                                isComplete 
                                  ? 'bg-green-100 text-green-700' 
                                  : hasPartial 
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {filledCount}/{categoryFields.length}
                              </span>
                            </button>

                            {/* Champs de la catégorie */}
                            {expandedCategories.has(category) && (
                              <div className="p-4 bg-white space-y-3">
                                {categoryFields.map((field) => {
                                  const value = getFieldValue(field);
                                  const hasValue = value !== '';
                                  
                                  return (
                                    <div key={field} className="flex items-start gap-3">
                                      <div className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${hasValue ? 'bg-green-500' : 'bg-gray-300'}`} />
                                      <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          {formatFieldName(field)}
                                        </label>
                                        <input
                                          type="text"
                                          value={value}
                                          onChange={(e) => updateFieldValue(field, e.target.value)}
                                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                                            hasValue ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white'
                                          }`}
                                          placeholder={`Entrez ${formatFieldName(field).toLowerCase()}`}
                                        />
                                      </div>
                                      {hasValue && <CheckCircle className="w-5 h-5 text-green-500 mt-8 flex-shrink-0" />}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {Object.keys(complexFields).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>Aucune donnée structurée extraite</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(complexFields).map(([key, value]) => (
                        Array.isArray(value) ? (
                          <ArrayFieldEditor
                            key={key}
                            label={key}
                            value={value}
                            onChange={(val) => handleFieldChange(key, val)}
                          />
                        ) : (
                          <ObjectFieldEditor
                            key={key}
                            label={key}
                            value={value}
                            onChange={(val) => handleFieldChange(key, val)}
                          />
                        )
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Informations */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Conseils
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Vérifiez attentivement toutes les données extraites par l&apos;IA</li>
              <li>• Corrigez les erreurs éventuelles avant de continuer</li>
              <li>• Les données structurées (tableaux, objets) sont dans l&apos;onglet dédié</li>
            </ul>
          </div>

          {/* Actions pour vue formulaire */}
          <div className="flex justify-between pt-6 border-t border-gray-200">
            <button
              onClick={onPrev}
              disabled={isSaving}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Save className="w-4 h-4 animate-pulse" />}
              {isSaving ? 'Sauvegarde...' : 'Valider et continuer'}
            </button>
          </div>
        </>
      )}

      {/* Bouton précédent pour vue Excel (le bouton suivant est dans ExcelDataEditor) */}
      {viewMode === 'excel' && (
        <div className="flex justify-start pt-6 border-t border-gray-200">
          <button
            onClick={onPrev}
            disabled={isSaving}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Précédent
          </button>
        </div>
      )}
    </div>
  );
}
