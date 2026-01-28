'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Settings, Sparkles } from 'lucide-react';
import { TestExtractionIA } from './TestExtractionIA';
import {
  ALL_FIELDS,
  SECTEURS,
  CLAUDE_MODELS,
  getCategoryLabel,
  getQuestionsForSecteur,
  syncSimpleToAdvanced,
  syncAdvancedToSimple,
  getFieldsCount,
  getAllSelectedFields,
  getAllKnownFields,
  type ViewMode,
} from './organizationFormConfig';


type Organization = {
  id: string;
  nom?: string;
  email?: string;
  secteur?: string;
  credits?: number;
  tarif_par_proposition?: number;
  claude_model?: string;
  prompt_template?: string;
  champs_defaut?: string[];
};
interface Props {
  organization: Organization;
}

export function EditOrganizationForm({ organization }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [formData, setFormData] = useState({
    nom: organization.nom || '',
    email: organization.email || '',
    secteur: organization.secteur || 'telephonie',
    credits: organization.credits || 0,
    tarif_par_proposition: organization.tarif_par_proposition || 5,
    claude_model: organization.claude_model || 'claude-3-7-sonnet-20250219',
    prompt_template: organization.prompt_template || '',
  });

  const currentQuestions = getQuestionsForSecteur(formData.secteur);

  useEffect(() => {
    const existingFields: string[] = organization.champs_defaut || [];
    if (existingFields.length > 0) {
      const allKnownFields = getAllKnownFields();
      const knownFields = existingFields.filter((f) => allKnownFields.includes(f));
      const unknownFields = existingFields.filter((f) => !allKnownFields.includes(f));
      setSelectedFields(knownFields);
      setCustomFields(unknownFields);
      const questionsToSelect = currentQuestions
        .filter((q) => q.fields.length > 0 && q.fields.every((f) => existingFields.includes(f)))
        .map((q) => q.id);
      setSelectedQuestions(questionsToSelect);
    }
  }, [organization.champs_defaut, currentQuestions]);

  const fieldsCount = getFieldsCount(viewMode, selectedQuestions, currentQuestions, selectedFields, customFields);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const allFields = getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFields);
      const response = await fetch('/api/admin/organizations/' + organization.id + '/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, champs_defaut: allFields }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise a jour');
      }
      router.push('/admin/clients/' + organization.id);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const selectAllQuestions = () => {
    setSelectedQuestions(
      selectedQuestions.length === currentQuestions.length ? [] : currentQuestions.map((q) => q.id)
    );
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

  const addCustomField = () => setCustomFields([...customFields, '']);
  
  const updateCustomField = (index: number, value: string) => {
    const newFields = [...customFields];
    newFields[index] = value;
    setCustomFields(newFields);
  };
  
  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'advanced') {
      setSelectedFields(syncSimpleToAdvanced(selectedQuestions, currentQuestions, selectedFields));
    } else {
      setSelectedQuestions(syncAdvancedToSimple(selectedFields, currentQuestions));
    }
    setViewMode(mode);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Informations de base */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Informations de base</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
            <input type="text" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input type="email" value={formData.email} disabled className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100" />
            <p className="text-xs text-gray-500 mt-1">Non modifiable</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Secteur *</label>
            <select value={formData.secteur} onChange={(e) => setFormData({ ...formData, secteur: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              {SECTEURS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tarif/proposition (€) *</label>
            <input type="number" value={formData.tarif_par_proposition} onChange={(e) => setFormData({ ...formData, tarif_par_proposition: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" min="0" step="0.01" required />
          </div>
        </div>
      </div>

      {/* Crédits */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Crédits</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Crédits actuels (€)</label>
          <input type="number" value={formData.credits} onChange={(e) => setFormData({ ...formData, credits: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" min="0" step="0.01" />
        </div>
      </div>

      {/* Configuration IA */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Configuration IA</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modèle Claude</label>
            <select value={formData.claude_model} onChange={(e) => setFormData({ ...formData, claude_model: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              {CLAUDE_MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prompt personnalisé</label>
            <textarea value={formData.prompt_template} onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })} rows={6} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm" placeholder="Laissez vide pour le prompt par défaut..." />
          </div>
        </div>
      </div>

      {/* Données à extraire */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Données à extraire</h2>
            <p className="text-sm text-gray-600 mt-1">Choisissez les informations que Claude doit extraire</p>
          </div>
          <span className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">{fieldsCount} champ{fieldsCount > 1 ? 's' : ''}</span>
        </div>

        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
          <button type="button" onClick={() => handleViewModeChange('simple')} className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${viewMode === 'simple' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>
            <Sparkles className="w-4 h-4" />Vue Simple
          </button>
          <button type="button" onClick={() => handleViewModeChange('advanced')} className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${viewMode === 'advanced' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>
            <Settings className="w-4 h-4" />Vue Avancée
          </button>
        </div>

        {viewMode === 'simple' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">Sélectionnez ce que vous souhaitez extraire</p>
              <button type="button" onClick={selectAllQuestions} className="text-sm text-blue-600 font-medium">{selectedQuestions.length === currentQuestions.length ? '✓ Tout désélectionner' : 'Tout sélectionner'}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestions.map((q) => (
                <div key={q.id} onClick={() => toggleQuestion(q.id)} className={`p-4 border-2 rounded-lg cursor-pointer ${selectedQuestions.includes(q.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedQuestions.includes(q.id)} onChange={() => {}} className="w-5 h-5 text-blue-600 rounded mt-1" />
                    <div>
                      <h3 className="font-semibold text-gray-900">{q.question}</h3>
                      <p className="text-sm text-gray-600">{q.description}</p>
                      <span className="inline-block mt-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{q.fields.length} champs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'advanced' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCategory('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Toutes</button>
              {Object.keys(ALL_FIELDS).map((cat) => (
                <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-lg text-sm font-medium ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{getCategoryLabel(cat)}</button>
              ))}
            </div>
            {Object.entries(ALL_FIELDS).filter(([cat]) => selectedCategory === 'all' || selectedCategory === cat).map(([cat, fields]) => (
              <div key={cat} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">{getCategoryLabel(cat)}</h3>
                  <button type="button" onClick={() => selectAllInCategory(cat)} className="text-sm text-blue-600 font-medium">{fields.every((f) => selectedFields.includes(f)) ? '✓ Désélectionner' : 'Tout sélectionner'}</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fields.map((field) => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                      <input type="checkbox" checked={selectedFields.includes(field)} onChange={() => toggleField(field)} className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm text-gray-700">{field}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Champs personnalisés</h3>
              {customFields.map((field, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={field} onChange={(e) => updateCustomField(i, e.target.value)} placeholder="Ex: numero_contrat_fibre..." className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
                  <button type="button" onClick={() => removeCustomField(i)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">Supprimer</button>
                </div>
              ))}
              <button type="button" onClick={addCustomField} className="mt-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium">+ Ajouter un champ</button>
            </div>
          </div>
        )}
      </div>

      {/* Test IA */}
      {fieldsCount > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-semibold text-purple-900 flex items-center gap-2 mb-2">🧪 Tester l extraction IA</h3>
          <p className="text-sm text-purple-700 mb-4">Testez avec de vrais documents pour verifier l extraction.</p>
          <TestExtractionIA champsActifs={getAllSelectedFields(viewMode, selectedQuestions, currentQuestions, selectedFields, customFields)} claudeModel={formData.claude_model} promptTemplate={formData.prompt_template} secteur={formData.secteur} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50" disabled={isLoading}>Annuler</button>
        <button type="submit" disabled={isLoading || fieldsCount === 0} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isLoading ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
