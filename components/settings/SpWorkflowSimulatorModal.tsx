'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Play, RotateCcw, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpQuestionReponse, CatalogueProduit, SpRegleRemise, SpConfigLoyer, SpConfigResiliation, WordConfig } from '@/types';
import { SpQuestionnaireUI } from '@/components/sp/SpQuestionnaireUI';
import { FloatingSaInspector } from '@/components/propositions/FloatingSaInspector';

interface Props {
  questions: SpQuestion[];
  templateId: string;
  templateNom: string;
  onClose: () => void;
  startFromQuestionId?: string;
}

export function SpWorkflowSimulatorModal({ questions, templateId, templateNom, onClose, startFromQuestionId }: Props) {
  const [donneesExtraites, setDonneesExtraites] = useState<Record<string, unknown>>({});
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [discountRules, setDiscountRules] = useState<SpRegleRemise[]>([]);
  const [spConfigLoyer, setSpConfigLoyer] = useState<SpConfigLoyer | undefined>(undefined);
  const [spConfigResiliation, setSpConfigResiliation] = useState<SpConfigResiliation | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [noProposition, setNoProposition] = useState(false);
  const [propositionId, setPropositionId] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [completedReponses, setCompletedReponses] = useState<SpQuestionReponse[] | null>(null);
  const [exportReadyPropositionId, setExportReadyPropositionId] = useState<string | null>(null);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [exportError, setExportError] = useState('');
  const [showSaInspector, setShowSaInspector] = useState(false);

  const activeQuestions = useMemo(
    () => questions.filter((q) => q.actif).sort((a, b) => a.ordre - b.ordre),
    [questions],
  );
  const startQuestion = startFromQuestionId ? activeQuestions.find((q) => q.id === startFromQuestionId) : undefined;

  useEffect(() => {
    Promise.all([
      fetch(`/api/propositions/latest-extracted-data?template_id=${templateId}`).then((r) => r.json()),
      fetch('/api/catalogue/fournisseurs').then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
      fetch('/api/settings/preferences').then((r) => r.json()),
      fetch(`/api/templates/${templateId}`).then((r) => r.json()),
    ]).then(([latestData, fData, cData, prefsData, templateData]) => {
      if (!latestData.extracted_data) {
        setNoProposition(true);
      } else {
        setDonneesExtraites(latestData.extracted_data as Record<string, unknown>);
        setPropositionId((latestData.proposition_id as string | null) ?? null);
      }
      setFournisseurs(fData.fournisseurs ?? []);
      setCatalogue(cData.produits ?? []);
      setDiscountRules(prefsData?.preferences?.sp_regles_remise ?? []);
      const fileConfig = templateData?.template?.file_config as WordConfig | undefined;
      setSpConfigLoyer(fileConfig?.sp_config_loyer ?? prefsData?.preferences?.sp_config_loyer);
      setSpConfigResiliation(fileConfig?.sp_config_resiliation ?? prefsData?.preferences?.sp_config_resiliation);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [templateId]);

  const handleReset = () => {
    setSessionKey((k) => k + 1);
    setCompletedReponses(null);
    setExportReadyPropositionId(null);
    setIsPreparingExport(false);
    setExportError('');
  };

  const handleSimulationComplete = async (reponses: SpQuestionReponse[]) => {
    setCompletedReponses(reponses);
    setExportReadyPropositionId(null);
    setExportError('');

    if (!propositionId) {
      setExportError('Impossible de preparer l\'export: aucune proposition de reference n\'est disponible.');
      return;
    }

    setIsPreparingExport(true);
    try {
      const fournisseurRep = reponses.find((r) =>
        activeQuestions.find((q) => q.id === r.question_id && q.affichage === 'boutons_choix_unique' && q.source === 'catalogue')
      );
      const adresseRep = reponses.find((r) =>
        activeQuestions.find((q) => q.id === r.question_id && q.affichage === 'adresse_complete')
      );
      const materielRep = reponses.find((r) =>
        activeQuestions.find((q) => q.id === r.question_id && q.affichage === 'oui_non')
      );

      const fasTotal = reponses
        .filter((r) => r.question_id.startsWith('fas_'))
        .reduce((sum, r) => {
          const val = r.valeur;
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val);
              if (typeof parsed === 'object' && parsed !== null) {
                return sum + (Object.values(parsed) as string[]).reduce((s, v) => s + (parseFloat(String(v)) || 0), 0);
              }
            } catch {
              return sum + (parseFloat(val) || 0);
            }
            return sum + (parseFloat(val) || 0);
          }
          return sum;
        }, 0);

      const body = {
        situation_actuelle: donneesExtraites,
        catalogue,
        proposition_id: propositionId,
        force_regenerate: true,
        sp_questions_reponses: reponses,
        sp_fas_total: fasTotal,
        preferences: {
          fournisseur_prefere: fournisseurRep ? String(fournisseurRep.valeur) : undefined,
          proposer_materiel: materielRep ? (materielRep.valeur === true || materielRep.valeur === 'Oui') : false,
          adresse_facturation: adresseRep?.valeur,
          livraison_identique: true,
        },
      };

      const res = await fetch('/api/propositions/generer-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erreur lors de la preparation de l\'export');
      }

      setExportReadyPropositionId(propositionId);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erreur lors de la preparation de l\'export');
    } finally {
      setIsPreparingExport(false);
    }
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
              <p className="text-xs text-gray-400">
                {templateNom}{startQuestion ? ` · depuis « ${startQuestion.libelle.length > 30 ? startQuestion.libelle.slice(0, 30) + '…' : startQuestion.libelle} »` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(donneesExtraites).length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowSaInspector((v) => !v);
                }}
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

          {!loading && !noProposition && (
            <SpQuestionnaireUI
              key={sessionKey}
              questions={activeQuestions}
              donneesExtraites={donneesExtraites}
              catalogue={catalogue}
              fournisseurs={fournisseurs}
              discountRules={discountRules}
              onComplete={(reponses) => { void handleSimulationComplete(reponses); }}
              isSimulation={true}
              simulationPropositionId={exportReadyPropositionId ?? undefined}
              simulationExportStatus={isPreparingExport ? 'preparing' : exportError ? 'error' : exportReadyPropositionId ? 'ready' : 'idle'}
              simulationExportError={exportError || undefined}
              startFromQuestionId={startFromQuestionId}
              spConfigLoyer={spConfigLoyer}
              spConfigResiliation={spConfigResiliation}
            />
          )}

          {!loading && !noProposition && showSaInspector && (
            <FloatingSaInspector
              open={showSaInspector}
              onClose={() => setShowSaInspector(false)}
              donneesExtraites={donneesExtraites}
              text={(donneesExtraites.resume as string) || (donneesExtraites['résumé'] as string) || 'Aucun résumé disponible.'}
              title="Resume SA"
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
