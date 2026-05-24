'use client';

import { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle, FileSpreadsheet, FileText } from 'lucide-react';
import { PropositionData } from './PropositionWizard';
import { Button } from '@/components/ui/button';

interface Props {
  propositionData: Partial<PropositionData>;
  onComplete: () => void;
  onPrev: () => void;
}

export function Step5Generate({
  propositionData,
  onComplete,
  onPrev,
}: Props) {
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [fileUrl, setFileUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  const isMultisiteParSite = propositionData.multisite_mode === 'par_site';
  const multisitePropositions = propositionData.multisite_propositions ?? [];

  // Multisite mode: all files already generated in Step5
  if (isMultisiteParSite && multisitePropositions.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Propositions générées</h2>
          <p className="text-gray-600">Toutes les propositions par site ont été générées.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {multisitePropositions.map((sp) => (
            <div key={sp.site_nom} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-gray-900">
                  Proposition {sp.site_nom}
                </span>
              </div>
              {sp.file_url ? (
                <a
                  href={sp.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </a>
              ) : (
                <span className="text-xs text-gray-400">Lien indisponible</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button onClick={onComplete} className="bg-green-600 hover:bg-green-700">
            Terminer
          </Button>
        </div>
      </div>
    );
  }

  // Normal (single-site) mode
  const startGeneration = async () => {
    setGenerationStatus('generating');
    setError('');

    try {
      const response = await fetch(`/api/propositions/${propositionData.proposition_id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Erreur génération');
      }

      setFileUrl(result.file_url);
      setGenerationStatus('success');
    } catch (err: unknown) {
      console.error('Erreur génération:', err);
      const message = err instanceof Error ? err.message : 'Erreur génération';
      setError(message);
      setGenerationStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Étape 5 : Génération du fichier
        </h2>
        <p className="text-gray-600">
          Générez le fichier final avec les données extraites
        </p>
      </div>

      {/* Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {generationStatus === 'idle' && (
          <div className="text-center">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Prêt à générer</h3>
            <p className="text-gray-600 mb-6">
              Cliquez sur le bouton ci-dessous pour générer votre proposition
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={startGeneration}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Générer la proposition
              </button>
              {propositionData.suggestions_sp_completes && propositionData.proposition_id && (
                <>
                  <a
                    href={`/api/propositions/${propositionData.proposition_id}/export-comparatif-sa-sp?format=excel`}
                    className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Comparatif SA/SP (Excel)
                  </a>
                  <a
                    href={`/api/propositions/${propositionData.proposition_id}/export-comparatif-sa-sp?format=word`}
                    className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    Comparatif SA/SP (Word)
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        {generationStatus === 'generating' && (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-green-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Génération en cours...</h3>
            <p className="text-gray-600">
              Création du fichier avec vos données. Cela peut prendre quelques secondes.
            </p>
          </div>
        )}

        {generationStatus === 'success' && fileUrl && (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Proposition générée avec succès !
            </h3>
            <p className="text-gray-600 mb-6">Votre fichier est prêt à être téléchargé</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                Télécharger la proposition
              </a>
              {propositionData.suggestions_sp_completes && propositionData.proposition_id && (
                <>
                  <a
                    href={`/api/propositions/${propositionData.proposition_id}/export-comparatif-sa-sp?format=excel`}
                    className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Comparatif SA/SP (Excel)
                  </a>
                  <a
                    href={`/api/propositions/${propositionData.proposition_id}/export-comparatif-sa-sp?format=word`}
                    className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    Comparatif SA/SP (Word)
                  </a>
                </>
              )}
              <button
                onClick={onComplete}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Terminer
              </button>
            </div>
          </div>
        )}

        {generationStatus === 'error' && (
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Erreur de génération</h3>
            <p className="text-red-600 mb-6">{error}</p>
            <button
              onClick={startGeneration}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Récapitulatif */}
      {generationStatus === 'idle' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">📋 Récapitulatif</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Client :</dt>
              <dd className="font-medium text-gray-900">{propositionData.nom_client || 'Sans nom'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Documents uploadés :</dt>
              <dd className="font-medium text-gray-900">{propositionData.documents_urls?.length || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Champs extraits :</dt>
              <dd className="font-medium text-gray-900">
                {(() => {
                  const data = propositionData.donnees_extraites || {};
                  const countFields = (obj: unknown): number => {
                    if (!obj || typeof obj !== 'object') return 0;
                    let total = 0;
                    for (const [, value] of Object.entries(obj as Record<string, unknown>)) {
                      if (Array.isArray(value)) total += value.length;
                      else if (typeof value === 'object' && value !== null) total += Object.keys(value as Record<string, unknown>).length;
                      else total += 1;
                    }
                    return total;
                  };
                  return countFields(data);
                })()}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {generationStatus === 'idle' && (
        <div className="flex justify-between pt-6 border-t border-gray-200">
          <button
            onClick={onPrev}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Précédent
          </button>
        </div>
      )}
    </div>
  );
}
