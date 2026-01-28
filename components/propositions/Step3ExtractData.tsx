'use client';

import { useState } from 'react';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Brain,
  FileSearch,
  Zap,
  CreditCard,
  AlertTriangle
} from 'lucide-react';
import { PropositionData } from './PropositionWizard';

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Props {
  secteur: string;
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

// Compte le nombre total de champs (récursivement)
function countTotalFields(data: unknown): number {
  if (data === null || data === undefined) return 0;
  if (Array.isArray(data)) return data.reduce<number>((acc, v) => acc + countTotalFields(v), 0);
  if (!isPlainObject(data)) return 1;

  return Object.values(data).reduce<number>((acc, v) => acc + countTotalFields(v), 0);
}

export function Step3ExtractData({
  secteur,
  propositionData,
  updatePropositionData,
  onNext,
  onPrev,
}: Props) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'extracting' | 'success' | 'error'>('idle');
  const [extractedData, setExtractedData] = useState<UnknownRecord | null>(null);
  const [error, setError] = useState<string>('');
  const [creditsInfo, setCreditsInfo] = useState<{ restants: number; debite: number } | null>(null);

  const startExtraction = async () => {
    setIsExtracting(true);
    setExtractionStatus('extracting');
    setError('');

    try {
      const response = await fetch('/api/propositions/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: propositionData.template_id,
          documents_urls: propositionData.documents_urls,
          nom_client: propositionData.nom_client,
          proposition_id: propositionData.proposition_id,
          copieurs_count: secteur === 'bureautique' ? Math.max(1, Number(propositionData.copieurs_count || 1)) : 1,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Erreur extraction');
      }

      const nextExtractedData: UnknownRecord = isPlainObject(result.donnees_extraites) ? result.donnees_extraites : {};
      setExtractedData(nextExtractedData);
      setExtractionStatus('success');

      if (result.credits_restants !== undefined && result.montant_debite !== undefined) {
        setCreditsInfo({
          restants: result.credits_restants,
          debite: result.montant_debite,
        });
      }

      updatePropositionData({
        donnees_extraites: nextExtractedData,
        proposition_id: result.proposition_id,
      });
    } catch (error: unknown) {
      console.error('Erreur extraction:', error);
      setError(error instanceof Error ? error.message : 'Erreur inconnue');
      setExtractionStatus('error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleNext = () => {
    if (extractionStatus !== 'success') {
      alert('Veuillez d\'abord lancer l\'extraction');
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/30">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Extraction des données
        </h2>
        <p className="text-gray-600 text-lg">
          Le système va analyser vos documents
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* État Idle */}
        {extractionStatus === 'idle' && (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl mb-6">
              <Brain className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Prêt pour l&apos;extraction
            </h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Le système va analyser automatiquement vos documents et extraire toutes les informations nécessaires selon votre template
            </p>
            <button
              onClick={startExtraction}
              className="group px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-800 transition-all font-semibold text-lg shadow-lg shadow-indigo-500/30 flex items-center gap-3 mx-auto hover:scale-105 active:scale-95"
            >
              <Sparkles className="w-5 h-5" />
              Lancer l&apos;extraction
              <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
        )}

        {/* État Extracting */}
        {extractionStatus === 'extracting' && (
          <div className="p-12">
            <div className="max-w-2xl mx-auto">
              {/* Animation */}
              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-full animate-pulse"></div>
                </div>
                <div className="relative flex items-center justify-center">
                  <Loader2 className="w-20 h-20 text-indigo-600 animate-spin" />
                </div>
              </div>

              {/* Texte */}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  Extraction en cours...
                </h3>
                <p className="text-gray-600 text-lg">
                  le système analyse vos documents avec son intelligence artificielle
                </p>
              </div>

              {/* Étapes de progression */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-indigo-900">Lecture des documents</p>
                    <p className="text-sm text-indigo-700">Analyse du contenu...</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200 animate-pulse">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-blue-900">Extraction des données</p>
                    <p className="text-sm text-blue-700">Identification des informations...</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 opacity-50">
                  <div className="w-10 h-10 bg-gray-300 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileSearch className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-700">Structuration</p>
                    <p className="text-sm text-gray-500">En attente...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* État Success */}
        {extractionStatus === 'success' && extractedData && (
          <div className="p-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl mb-6 shadow-lg shadow-green-500/30 animate-in zoom-in duration-500">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Extraction réussie ! 🎉
              </h3>
              <p className="text-gray-600 text-lg mb-6">
                le système a extrait toutes les informations de vos documents
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-w-2xl mx-auto">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <FileSearch className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-medium text-blue-900">Données extraites</p>
                </div>
                <p className="text-3xl font-bold text-blue-900">
                  {countTotalFields(extractedData)}
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  dans {Object.keys(extractedData).length} section{Object.keys(extractedData).length > 1 ? 's' : ''}
                </p>
              </div>

              {creditsInfo && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-sm font-medium text-purple-900">Crédits</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-900">
                    {creditsInfo.restants.toFixed(2)}€
                  </p>
                  <p className="text-sm text-purple-700 mt-1">
                    -{creditsInfo.debite.toFixed(2)}€ débités
                  </p>
                </div>
              )}
            </div>

            {/* Message de confirmation */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-green-800">
                    <strong>Prêt pour la validation</strong> - Vous pourrez vérifier et modifier les données extraites à l&apos;étape suivante
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* État Error */}
        {extractionStatus === 'error' && (
          <div className="p-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl mb-6 shadow-lg shadow-red-500/30">
                <AlertCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Erreur d&apos;extraction
              </h3>
              <p className="text-red-600 text-lg mb-6 max-w-md mx-auto">
                {error}
              </p>
            </div>

            {/* Alert crédits insuffisants */}
            {error.includes('Crédits insuffisants') && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-6 mb-6 max-w-2xl mx-auto">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-amber-900 text-lg mb-2">
                      Crédits insuffisants
                    </h4>
                    <p className="text-sm text-amber-800 mb-3">
                      Votre solde de crédits est insuffisant pour effectuer cette extraction.
                    </p>
                    <p className="text-sm text-amber-700">
                      💡 Contactez votre administrateur pour recharger votre compte.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Bouton réessayer */}
            <div className="text-center">
              <button
                onClick={startExtraction}
                className="px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-all font-semibold shadow-lg shadow-red-500/30 flex items-center gap-3 mx-auto hover:scale-105 active:scale-95"
              >
                <Zap className="w-5 h-5" />
                Réessayer l&apos;extraction
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Informations */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-lg mb-3">
              Comment fonctionne l&apos;extraction ?
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">🤖</span>
                <span>Le système analyse intelligemment le contenu de vos documents (texte et images)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">🎯</span>
                <span>Les informations sont extraites selon les champs configurés dans votre template</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">✏️</span>
                <span>Vous pourrez vérifier et modifier toutes les données à l&apos;étape suivante</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">💳</span>
                <span>L&apos;extraction consomme vos crédits selon le volume de données traitées</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t-2 border-gray-200">
        <button
          onClick={onPrev}
          disabled={isExtracting}
          className="group px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Précédent
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Étape 3 sur 3
          </span>
          <button
            onClick={handleNext}
            disabled={extractionStatus !== 'success'}
            className="group px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all font-semibold text-lg shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-3 hover:scale-105 active:scale-95"
          >
            Terminer
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
