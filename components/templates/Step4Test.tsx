'use client';

import { useState } from 'react';
import { Upload, Download, CheckCircle, Loader2 } from 'lucide-react';
import { TemplateData } from './TemplateWizard';

interface Props {
  templateData: Partial<TemplateData>;
  onComplete: () => void;
  onPrev: () => void;
}

export function Step4Test({ templateData, onComplete, onPrev }: Props) {
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleTestFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTestFile(file);
      setTestResult(null);
    }
  };

  const handleTest = async () => {
    if (!testFile) return;

    setIsTesting(true);

    try {
      const formData = new FormData();
      formData.append('file', testFile);
      formData.append('template_data', JSON.stringify(templateData));

      const response = await fetch('/api/templates/test', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erreur test');

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      console.error('Erreur test:', error);
      alert('Erreur lors du test');
    } finally {
      setIsTesting(false);
    }
  };

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
          Étape 4 : Test et validation
        </h2>
        <p className="text-gray-600">
          Testez votre template avec un vrai document avant de le sauvegarder
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

      {/* Zone de test */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Tester avec un document réel
          </h3>

          {!testFile ? (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="mb-4">
                <label
                  htmlFor="test-file-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  Upload document de test
                </label>
                <input
                  id="test-file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.docx"
                  onChange={handleTestFileChange}
                />
              </div>
              <p className="text-sm text-gray-500">
                Uploadez une facture, un contrat ou tout document contenant les
                données à extraire
              </p>
            </>
          ) : (
            <>
              <CheckCircle className="mx-auto h-12 w-12 text-green-600 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                {testFile.name}
              </p>
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {isTesting && <Loader2 className="w-5 h-5 animate-spin" />}
                {isTesting ? 'Test en cours...' : 'Lancer le test'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Résultat du test */}
      {testResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-green-900">Test réussi !</h3>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-green-800">
              <strong>Données extraites :</strong> {testResult.fieldsExtracted}{' '}
              champs
            </p>
            <p className="text-sm text-green-800">
              <strong>Confiance moyenne :</strong> {testResult.confidence}%
            </p>
            <p className="text-sm text-green-800">
              <strong>Tokens utilisés :</strong> {testResult.tokensUsed}
            </p>
          </div>
          {testResult.previewUrl && (
            <a
              href={testResult.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Télécharger le résultat
            </a>
          )}
        </div>
      )}

      {/* Option de sauter le test */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          ⚠️ Vous pouvez sauter le test et créer le template directement, mais il
          est recommandé de tester d'abord.
        </p>
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
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Sauter le test
          </button>
          <button
            onClick={handleComplete}
            disabled={isCompleting || !testResult}
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
