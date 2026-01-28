'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

interface Props {
  champsActifs: string[];
  claudeModel: string;
  promptTemplate: string;
  secteur: string;
}

export function TestExtractionIA({ champsActifs, claudeModel, promptTemplate, secteur }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');

  const extractedData = (() => {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    const d = r['donnees_extraites'];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    return d as Record<string, unknown>;
  })();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError('');
    }
  };

  const handleTest = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier');
      return;
    }

    if (champsActifs.length === 0) {
      setError('Veuillez ajouter au moins un champ actif');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      // 1. Upload du fichier
      const formData = new FormData();
      formData.append('files', file);

      const uploadResponse = await fetch('/api/propositions/upload-documents', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) throw new Error('Erreur upload fichier');

      const { urls } = await uploadResponse.json();

      // 2. Test d'extraction
      const extractResponse = await fetch('/api/admin/test-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents_urls: urls,
          champs_actifs: champsActifs,
          claude_model: claudeModel,
          prompt_template: promptTemplate,
          secteur: secteur,
        }),
      });

      const extractResult = await extractResponse.json();

      if (!extractResponse.ok) {
        throw new Error(extractResult.details || extractResult.error || 'Erreur extraction');
      }

      setResult(extractResult);
    } catch (err: unknown) {
      console.error('Erreur test:', err);
      const message = err instanceof Error ? err.message : 'Erreur test';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
      >
        <CheckCircle className="w-4 h-4" />
        {"Tester l'extraction IA"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {"Test d'extraction IA"}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Vérifiez que Claude comprend bien vos champs
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Configuration actuelle */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">
              Configuration actuelle
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-blue-700 font-medium">Secteur:</dt>
                <dd className="text-blue-900">{secteur || 'Non défini'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-blue-700 font-medium">Modèle:</dt>
                <dd className="text-blue-900">{claudeModel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-blue-700 font-medium">Prompt:</dt>
                <dd className="text-blue-900">{promptTemplate}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-blue-700 font-medium">Champs actifs:</dt>
                <dd className="text-blue-900">{champsActifs.length} champs</dd>
              </div>
            </dl>
          </div>

          {/* Champs à extraire */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Champs à extraire ({champsActifs.length})
            </h3>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 bg-gray-50 rounded-lg">
              {champsActifs.map((field) => (
                <span
                  key={field}
                  className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {/* Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document de test
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="text-center">
                <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                <label
                  htmlFor="test-file-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choisir un fichier
                </label>
                <input
                  id="test-file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.docx,.doc"
                  onChange={handleFileChange}
                />
                <p className="text-xs text-gray-500 mt-2">
                  PDF, Excel ou Word
                </p>
              </div>
            </div>
            {file && (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-600" />
                {file.name}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={isLoading || !file}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Lancer le test
                </>
              )}
            </button>
            {(result || error) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-900 mb-1">Erreur</h4>
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Résultat */}
          {!!result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-900 mb-1">
                    Extraction réussie !
                  </h4>
                  <p className="text-sm text-green-800">
                    {Object.keys(extractedData || {}).length} champs extraits
                  </p>
                </div>
              </div>

              {/* Données extraites */}
              <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto">
                <h5 className="font-semibold text-gray-900 mb-3">
                  Données extraites :
                </h5>
                <dl className="space-y-3">
                  {Object.entries(extractedData || {}).map(([key, value]) => (
                    <div key={key} className="border-b border-gray-100 pb-2">
                      <dt className="text-sm font-medium text-gray-700 mb-1">
                        {key}
                      </dt>
                      <dd className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                        {value !== null && value !== undefined
                          ? typeof value === 'object'
                            ? <pre className="whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                            : String(value)
                          : '(non trouvé)'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Statistiques */}
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div className="bg-white rounded p-3">
                  <p className="text-xs text-gray-600">Champs demandés</p>
                  <p className="text-lg font-bold text-gray-900">
                    {champsActifs.length}
                  </p>
                </div>
                <div className="bg-white rounded p-3">
                  <p className="text-xs text-gray-600">Champs extraits</p>
                  <p className="text-lg font-bold text-green-600">
                    {Object.keys(extractedData || {}).length}
                  </p>
                </div>
                <div className="bg-white rounded p-3">
                  <p className="text-xs text-gray-600">Taux de réussite</p>
                  <p className="text-lg font-bold text-blue-600">
                    {champsActifs.length > 0
                      ? Math.round(
                          (Object.keys(extractedData || {}).length /
                            champsActifs.length) *
                            100
                        )
                      : 0}
                    %
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
