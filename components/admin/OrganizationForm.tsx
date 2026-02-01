'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { organizationSchema, type OrganizationFormData } from '@/lib/utils/validation';
import { Loader2, Settings, Sparkles } from 'lucide-react';
import { TestExtractionIA } from './TestExtractionIA';
import {
  SIMPLE_QUESTIONS,
  ALL_FIELDS,
  getCategoryLabel,
  getFieldsCount,
} from './organizationFormConfig';

const DEFAULT_PROMPT = `Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "resume": "Résumé en français (titres + listes) basé sur les informations trouvées",
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
- Le champ "resume" doit être un texte structuré et lisible, sans inventer d'informations

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

export function OrganizationForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      claude_model: 'claude-3-7-sonnet-20250219',
      prompt_template: DEFAULT_PROMPT,
      tarif_par_proposition: 5.0,
    },
  });

  const secteur = watch('secteur') || 'telephonie';
  const currentQuestions = SIMPLE_QUESTIONS[secteur as keyof typeof SIMPLE_QUESTIONS] || [];

  const onSubmit = async (data: OrganizationFormData) => {
    setIsLoading(true);

    try {
      let allFields: string[];
      
      if (viewMode === 'simple') {
        // En mode simple, on collecte tous les champs des questions sélectionnées
        allFields = selectedQuestions.flatMap(questionId => {
          const question = currentQuestions.find(q => q.id === questionId);
          return question?.fields || [];
        });
      } else {
        // En mode avancé, on utilise les champs sélectionnés manuellement
        allFields = [...selectedFields, ...customFields.filter(f => f.trim())];
      }
      
      if (allFields.length === 0) {
        alert(viewMode === 'simple' 
          ? 'Veuillez sélectionner au moins une question'
          : 'Veuillez sélectionner au moins un champ'
        );
        setIsLoading(false);
        return;
      }
      
      const response = await fetch('/api/admin/organizations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          champs_defaut: allFields,
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        console.error('Erreur parsing JSON:', e);
        throw new Error(`Erreur serveur (${response.status}): Impossible de parser la réponse`);
      }

      if (!response.ok) {
        console.error('Erreur API:', result);
        throw new Error(result.details || result.error || `Erreur ${response.status}`);
      }
      
      router.push(`/admin/clients/${result.organization.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      alert(`Erreur lors de la création du client:\n\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestions(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const selectAllQuestions = () => {
    if (selectedQuestions.length === currentQuestions.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(currentQuestions.map(q => q.id));
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const selectAllInCategory = (category: string) => {
    const fields = ALL_FIELDS[category as keyof typeof ALL_FIELDS] || [];
    const allSelected = fields.every(f => selectedFields.includes(f));
    
    if (allSelected) {
      setSelectedFields(prev => prev.filter(f => !fields.includes(f)));
    } else {
      setSelectedFields(prev => [...new Set([...prev, ...fields])]);
    }
  };

  const addCustomField = () => {
    setCustomFields([...customFields, '']);
  };

  const updateCustomField = (index: number, value: string) => {
    const newFields = [...customFields];
    newFields[index] = value;
    setCustomFields(newFields);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  // Utilise la fonction importée avec les paramètres locaux
  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFields);

  const handleViewModeChange = (mode: 'simple' | 'advanced') => {
    if (mode === 'advanced') {
      // Sync Simple -> Advanced
      
      // 1. Identifier tous les champs gérés par le mode simple actuel
      const allSimpleFields = currentQuestions.flatMap(q => q.fields);
      
      // 2. Identifier les champs des questions COCHÉES
      const fieldsFromQuestions = selectedQuestions.flatMap(qId => {
        const q = currentQuestions.find(question => question.id === qId);
        return q?.fields || [];
      });
      
      // 3. Conserver les champs qui étaient déjà sélectionnés mais qui NE SONT PAS dans le mode simple
      // (pour ne pas perdre les sélections "purement avancées" ou d'autres secteurs)
      const preservedFields = selectedFields.filter(f => !allSimpleFields.includes(f));
      
      // 4. Fusionner : champs conservés + champs des questions cochées
      setSelectedFields([...new Set([...preservedFields, ...fieldsFromQuestions])]);
      
    } else {
      // Sync Advanced -> Simple
      
      // On coche les questions dont TOUS les champs sont sélectionnés dans selectedFields
      const questionsToSelect = currentQuestions.filter(q => {
        // Une question est cochée si elle a des champs ET que tous ses champs sont dans selectedFields
        return q.fields.length > 0 && q.fields.every(f => selectedFields.includes(f));
      }).map(q => q.id);
      
      setSelectedQuestions(questionsToSelect);
    }
    
    setViewMode(mode);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Informations de base */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Informations de base
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom de l&apos;organisation *
            </label>
            <input
              {...register('nom')}
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: TelecomPro Solutions"
            />
            {errors.nom && (
              <p className="text-red-500 text-sm mt-1">{errors.nom.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              {...register('email')}
              type="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@telecompro.fr"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe *
            </label>
            <input
              {...register('password')}
              type="password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Min. 8 caractères"
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Secteur *
            </label>
            <select
              {...register('secteur')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sélectionner...</option>
              <option value="telephonie">Téléphonie d&apos;entreprise</option>
              <option value="bureautique">Bureautique (copieurs/imprimantes)</option>
              <option value="mixte">Mixte (Téléphonie + Bureautique)</option>
            </select>
            {errors.secteur && (
              <p className="text-red-500 text-sm mt-1">
                {errors.secteur.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Configuration IA */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Configuration IA
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modèle Claude
            </label>
            <select
              {...register('claude_model')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="claude-3-7-sonnet-20250219">
                Claude 3.7 Sonnet (Recommandé - Meilleure extraction)
              </option>
              <option value="claude-3-5-sonnet-20241022">
                Claude 3.5 Sonnet
              </option>
            </select>
            <p className="text-sm text-gray-500 mt-2">
              Claude 3.7 Sonnet offre une précision d&apos;extraction supérieure pour les documents complexes.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prompt personnalisé *
            </label>
            <textarea
              {...register('prompt_template')}
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="Prompt d'extraction..."
            />
            {errors.prompt_template && (
              <p className="text-red-500 text-sm mt-1">
                {errors.prompt_template.message}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Variables disponibles : {'{secteur}'}, {'{liste_champs_actifs}'},{' '}
              {'{documents}'}
            </p>
          </div>
        </div>
      </div>

      {/* Sélection des données à extraire - NOUVEAU DESIGN */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Données à extraire
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Choisissez les informations que Claude doit extraire automatiquement
            </p>
          </div>
          <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
            {fieldsCount} champ{fieldsCount > 1 ? 's' : ''} au total
          </span>
        </div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => handleViewModeChange('simple')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'simple'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Vue Simple
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('advanced')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              viewMode === 'advanced'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            Vue Avancée
          </button>
        </div>

        {/* Vue Simple */}
        {viewMode === 'simple' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Sélectionnez simplement ce que vous souhaitez extraire
              </p>
              <button
                type="button"
                onClick={selectAllQuestions}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {selectedQuestions.length === currentQuestions.length
                  ? '✓ Tout désélectionner'
                  : 'Tout sélectionner'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestions.map((question) => (
                <div
                  key={question.id}
                  onClick={() => toggleQuestion(question.id)}
                  className={`
                    relative p-4 border-2 rounded-lg cursor-pointer transition-all
                    ${
                      selectedQuestions.includes(question.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedQuestions.includes(question.id)}
                      onChange={() => {}}
                      className="w-5 h-5 text-blue-600 rounded mt-1 cursor-pointer"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {question.question}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {question.description}
                      </p>
                      <span className="inline-block mt-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {question.fields.length} champ{question.fields.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedQuestions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Sélectionnez au moins une catégorie d&apos;informations à extraire</p>
              </div>
            )}
          </div>
        )}

        {/* Vue Avancée */}
        {viewMode === 'advanced' && (
          <div className="space-y-6">
            {/* Filtres par catégorie */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Toutes les catégories
                </button>
                {Object.keys(ALL_FIELDS).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategory === category
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))}
              </div>
            </div>

            {/* Affichage des champs par catégorie */}
            <div className="space-y-6">
              {Object.entries(ALL_FIELDS)
                .filter(([category]) => selectedCategory === 'all' || selectedCategory === category)
                .map(([category, fields]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">
                        {getCategoryLabel(category)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => selectAllInCategory(category)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {fields.every(f => selectedFields.includes(f))
                          ? '✓ Tout désélectionner'
                          : 'Tout sélectionner'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {fields.map((field) => (
                        <label
                          key={field}
                          className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(field)}
                            onChange={() => toggleField(field)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{field}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            {/* Champs personnalisés */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                Champs personnalisés
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Ajoutez des champs spécifiques à votre activité ou à vos besoins.
              </p>
              {customFields.map((field, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={field}
                    onChange={(e) => updateCustomField(index, e.target.value)}
                    placeholder="Ex: numero_contrat_fibre, engagement_mobile..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(index)}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCustomField}
                className="mt-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
              >
                + Ajouter un champ personnalisé
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tarification */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Tarification</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tarif par proposition (€) *
          </label>
          <input
            {...register('tarif_par_proposition', { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.tarif_par_proposition && (
            <p className="text-red-500 text-sm mt-1">
              {errors.tarif_par_proposition.message}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Prix facturé au client pour chaque proposition commerciale générée.
          </p>
        </div>
      </div>

      {/* Test d'extraction IA */}
      {fieldsCount > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-purple-900 flex items-center gap-2">
                <span>🧪</span>
                Tester l&apos;extraction IA
              </h3>
              <p className="text-sm text-purple-700 mt-1">
                Testez avec de vrais documents pour vérifier que Claude extrait correctement toutes les informations.
              </p>
            </div>
          </div>
          <TestExtractionIA
            champsActifs={
              viewMode === 'simple'
                ? selectedQuestions.flatMap(qId => {
                    const q = currentQuestions.find(question => question.id === qId);
                    return q?.fields || [];
                  })
                : [...selectedFields, ...customFields.filter(f => f.trim())]
            }
            claudeModel={watch('claude_model') || 'claude-3-7-sonnet-20250219'}
            promptTemplate={watch('prompt_template') || DEFAULT_PROMPT}
            secteur={secteur}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isLoading || fieldsCount === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Création en cours...' : 'Créer le client'}
        </button>
      </div>
    </form>
  );
}
