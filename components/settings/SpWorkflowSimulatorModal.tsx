'use client';

import { useState, useEffect } from 'react';
import { X, Play, RotateCcw, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpQuestionReponse, CatalogueProduit } from '@/types';
import { SpQuestionnaireUI } from '@/components/sp/SpQuestionnaireUI';

interface Props {
  questions: SpQuestion[];
  templateId: string;
  templateNom: string;
  onClose: () => void;
}

export function SpWorkflowSimulatorModal({ questions, templateId, templateNom, onClose }: Props) {
  const [donneesExtraites, setDonneesExtraites] = useState<Record<string, unknown>>({});
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [noProposition, setNoProposition] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [completedReponses, setCompletedReponses] = useState<SpQuestionReponse[] | null>(null);
  const [showSaInspector, setShowSaInspector] = useState(false);

  const activeQuestions = questions.filter((q) => q.actif).sort((a, b) => a.ordre - b.ordre);

  useEffect(() => {
    Promise.all([
      fetch(`/api/propositions/latest-extracted-data?template_id=${templateId}`).then((r) => r.json()),
      fetch('/api/catalogue/fournisseurs').then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
    ]).then(([latestData, fData, cData]) => {
      if (!latestData.extracted_data) {
        setNoProposition(true);
      } else {
        setDonneesExtraites(latestData.extracted_data as Record<string, unknown>);
      }
      setFournisseurs(fData.fournisseurs ?? []);
      setCatalogue(cData.produits ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [templateId]);

  const handleReset = () => {
    setSessionKey((k) => k + 1);
    setCompletedReponses(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <Play className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Simulation du workflow</h2>
              <p className="text-xs text-gray-400">{templateNom}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(donneesExtraites).length > 0 && (
              <button
                onClick={() => setShowSaInspector((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                Données SA
              </button>
            )}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser
            </button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {!loading && noProposition && (
            <div className="text-center py-10 space-y-3">
              <p className="text-4xl">📋</p>
              <p className="text-sm font-medium text-gray-700">Aucune proposition générée pour ce template.</p>
              <p className="text-xs text-gray-500">
                Créez d&apos;abord une proposition pour utiliser le simulateur avec des données réelles.
              </p>
            </div>
          )}

          {!loading && !noProposition && showSaInspector && (
            <div className="mb-4 border border-green-200 rounded-lg bg-green-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-green-800">Données SA extraites (pour configuration boucle)</p>
                <button onClick={() => setShowSaInspector(false)} className="text-green-400 hover:text-green-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <pre className="text-xs text-green-900 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                {JSON.stringify(donneesExtraites, null, 2)}
              </pre>
            </div>
          )}

          {!loading && !noProposition && (
            <SpQuestionnaireUI
              key={sessionKey}
              questions={activeQuestions}
              donneesExtraites={donneesExtraites}
              catalogue={catalogue}
              fournisseurs={fournisseurs}
              onComplete={(reponses) => setCompletedReponses(reponses)}
              isSimulation={true}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {completedReponses
              ? `${completedReponses.length} réponse(s) collectée(s)`
              : `${activeQuestions.length} question(s) configurée(s)`}
          </p>
          <Button size="sm" variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
