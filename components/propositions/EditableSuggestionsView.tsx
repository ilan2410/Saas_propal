import { useMemo, useState } from 'react';
import { SuggestionsGenerees, Suggestion, CatalogueProduit, SuggestionsSynthese } from '@/types';
import { MetricCard } from './MetricCard';
import { Euro, TrendingDown, TrendingUp, Package, AlertTriangle, FileDown, Save, Loader2, CheckCircle, Wand2 } from 'lucide-react';
import { EditableProposedProduct } from './EditableProposedProduct';
import { EditableAnalysis } from './EditableAnalysis';
import { EditableSynthesis } from './EditableSynthesis';
import { DownloadWarningModal } from './DownloadWarningModal';
import { useSuggestionsTracker } from '@/hooks/useSuggestionsTracker';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface EditableSuggestionsViewProps {
  suggestions: SuggestionsGenerees;
  propositionId: string;
  catalogue: CatalogueProduit[];
  clientName?: string;
  onDownloadPdf: (suggestions?: Suggestion[], synthese?: SuggestionsSynthese) => void;
  isDownloading?: boolean;
}

export function EditableSuggestionsView({ 
  suggestions: initialData, 
  propositionId,
  catalogue,
  clientName, 
  onDownloadPdf, 
  isDownloading = false 
}: EditableSuggestionsViewProps) {
  const [currentSuggestions, setCurrentSuggestions] = useState<Suggestion[]>(initialData.suggestions);
  const [currentSynthese, setCurrentSynthese] = useState<SuggestionsSynthese>(initialData.synthese);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const { modificationState, needsWarning } = useSuggestionsTracker({
    originalData: initialData,
    currentSuggestions,
    currentSynthese
  });

  const analysisNeedsAttention = useMemo(() => {
    return currentSuggestions.map((currentSuggestion, index) => {
      const originalSuggestion = initialData.suggestions[index];
      if (!originalSuggestion) return false;
      const isProductChanged =
        currentSuggestion.produit_propose_id !== originalSuggestion.produit_propose_id ||
        currentSuggestion.produit_propose_nom !== originalSuggestion.produit_propose_nom;
      const isAnalysisChanged = currentSuggestion.justification !== originalSuggestion.justification;
      return isProductChanged && !isAnalysisChanged;
    });
  }, [currentSuggestions, initialData.suggestions]);

  const needsSynthesisAttention =
    modificationState.changedProductsCount > 0 && !modificationState.hasSynthesisUpdate;
  const hasRegenTargets = useMemo(
    () => analysisNeedsAttention.some(Boolean) || needsSynthesisAttention,
    [analysisNeedsAttention, needsSynthesisAttention]
  );

  const isPositiveEconomy = currentSynthese.economie_mensuelle >= 0;
  const resolvedClientName = typeof clientName === 'string' && clientName.trim() ? clientName.trim() : null;

  // Recalcul de la synthèse globale quand les suggestions changent
  const recalculateSynthesis = (suggestions: Suggestion[]) => {
    const cout_total_actuel = suggestions.reduce((acc, s) => acc + s.prix_actuel, 0);
    const cout_total_propose = suggestions.reduce((acc, s) => acc + s.prix_propose, 0);
    const economie_mensuelle = cout_total_actuel - cout_total_propose;
    const economie_annuelle = economie_mensuelle * 12;

    setCurrentSynthese(prev => ({
      ...prev,
      cout_total_actuel,
      cout_total_propose,
      economie_mensuelle,
      economie_annuelle
    }));
  };

  const handleProductChange = (index: number, newProduct: CatalogueProduit) => {
    const newSuggestions = [...currentSuggestions];
    const suggestion = { ...newSuggestions[index] };
    
    // Mise à jour des infos produit
    suggestion.produit_propose_id = newProduct.id;
    suggestion.produit_propose_nom = newProduct.nom;
    suggestion.produit_propose_fournisseur = newProduct.fournisseur;
    suggestion.prix_propose = newProduct.prix_mensuel || 0;
    
    // Recalcul de l'économie pour cette ligne
    suggestion.economie_mensuelle = suggestion.prix_actuel - suggestion.prix_propose;
    
    newSuggestions[index] = suggestion;
    setCurrentSuggestions(newSuggestions);
    recalculateSynthesis(newSuggestions);
  };

  const handleAnalysisChange = (index: number, newAnalysis: string) => {
    const newSuggestions = [...currentSuggestions];
    newSuggestions[index] = {
      ...newSuggestions[index],
      justification: newAnalysis
    };
    setCurrentSuggestions(newSuggestions);
  };

  const handleAmeliorationsChange = (newAmeliorations: string[]) => {
    setCurrentSynthese(prev => ({
      ...prev,
      ameliorations: newAmeliorations
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/update-suggestions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          suggestions: currentSuggestions,
          synthese: currentSynthese
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.details || errorData?.error || 'Erreur lors de la sauvegarde';
        throw new Error(message);
      }

      toast.success('Modifications sauvegardées avec succès');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadClick = () => {
    if (needsWarning()) {
      setShowWarningModal(true);
    } else {
      onDownloadPdf(currentSuggestions, currentSynthese);
    }
  };

  const handleRegenerateNeeded = async () => {
    if (!hasRegenTargets) {
      toast.info('Aucune régénération nécessaire');
      return;
    }
    setIsRegeneratingAll(true);
    let hadError = false;
    const updatedSuggestions = [...currentSuggestions];

    for (const [index, suggestion] of updatedSuggestions.entries()) {
      if (!analysisNeedsAttention[index]) continue;
      try {
        const response = await fetch('/api/propositions/regenerer-analyse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ligne_actuelle: suggestion.ligne_actuelle,
            produit_propose_nom: suggestion.produit_propose_nom,
            produit_propose_fournisseur: suggestion.produit_propose_fournisseur,
            prix_actuel: suggestion.prix_actuel,
            prix_propose: suggestion.prix_propose,
            economie_mensuelle: suggestion.economie_mensuelle,
          }),
        });

        if (!response.ok) {
          hadError = true;
          continue;
        }

        const data = await response.json();
        if (data.justification) {
          updatedSuggestions[index] = {
            ...suggestion,
            justification: data.justification,
          };
        }
      } catch (error) {
        console.error(error);
        hadError = true;
      }
    }

    if (needsSynthesisAttention) {
      try {
        const response = await fetch('/api/propositions/regenerer-synthese', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            suggestions: updatedSuggestions,
            situation_actuelle: {
              lignes: updatedSuggestions.map(s => s.ligne_actuelle)
            }
          }),
        });

        if (!response.ok) {
          hadError = true;
        } else {
          const data = await response.json();
          if (data.ameliorations && Array.isArray(data.ameliorations)) {
            setCurrentSynthese(prev => ({
              ...prev,
              ameliorations: data.ameliorations
            }));
          }
        }
      } catch (error) {
        console.error(error);
        hadError = true;
      }
    }

    setCurrentSuggestions(updatedSuggestions);
    setIsRegeneratingAll(false);
    if (hadError) {
      toast.error('Certaines régénérations ont échoué');
    } else {
      toast.success('Textes régénérés avec succès');
    }
  };

  return (
    <div className="space-y-8">
      {/* Badge d'avertissement modification non sauvegardée (optionnel, non demandé explicitement mais utile) */}
      {(modificationState.hasProductChanges || modificationState.hasAnalysisUpdates || modificationState.hasSynthesisUpdate) && (
         <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
           <div className="flex items-center gap-2 text-amber-800 text-sm">
             <AlertTriangle className="w-4 h-4" />
             <span>Des modifications ont été apportées. Pensez à sauvegarder.</span>
           </div>
           <Button 
             size="sm" 
             onClick={handleSave} 
             disabled={isSaving}
             className="bg-amber-600 hover:bg-amber-700 text-white border-none h-8"
           >
             {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
             Sauvegarder
           </Button>
         </div>
      )}

      {/* Dashboard Synthèse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Économie Mensuelle"
          value={`${Math.abs(currentSynthese.economie_mensuelle).toFixed(2)}€`}
          subtitle={`${Math.abs(currentSynthese.economie_annuelle).toFixed(2)}€ / an`}
          icon={Euro}
          color={isPositiveEconomy ? 'green' : 'orange'}
        />
        <MetricCard
          title={isPositiveEconomy ? "Réduction Globale" : "Augmentation Globale"}
          value={`${currentSynthese.cout_total_actuel > 0 ? ((Math.abs(currentSynthese.economie_mensuelle) / currentSynthese.cout_total_actuel) * 100).toFixed(1) : 0}%`}
          subtitle={isPositiveEconomy ? "d'économie réalisée" : "de surcoût estimé"}
          icon={isPositiveEconomy ? TrendingDown : TrendingUp}
          color={isPositiveEconomy ? 'green' : 'orange'}
        />
        <MetricCard
          title="Lignes Analysées"
          value={currentSuggestions.length.toString()}
          subtitle="produits optimisés"
          icon={Package}
          color="blue"
        />
      </div>

      {/* Liste des Suggestions */}
      {currentSuggestions.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-700 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Aucun produit similaire trouvé</p>
              <p className="text-sm text-amber-800">
                Aucun produit de votre catalogue ne semble correspondre à la situation actuelle du client.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {currentSuggestions.map((item, index) => (
            <EditableSuggestionCard 
              key={index} 
              suggestion={item} 
              catalogue={catalogue}
              onProductChange={(p) => handleProductChange(index, p)}
              onAnalysisChange={(a) => handleAnalysisChange(index, a)}
              needsAnalysisAttention={analysisNeedsAttention[index]}
            />
          ))}
        </div>
      )}

      {/* Boutons Actions */}
      <div className="flex justify-end pt-4 gap-3">
        <Button
          onClick={handleRegenerateNeeded}
          disabled={isRegeneratingAll || !hasRegenTargets}
          variant="outline"
          className="flex items-center space-x-2 px-6 py-3 h-auto"
        >
          {isRegeneratingAll ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Wand2 className="w-5 h-5" />
          )}
          <span>Régénérer les textes nécessaires</span>
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="outline"
          className="flex items-center space-x-2 px-6 py-3 h-auto"
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span>Sauvegarder les modifications</span>
        </Button>

        <button
          onClick={handleDownloadClick}
          disabled={isDownloading || currentSuggestions.length === 0}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isDownloading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileDown className="w-5 h-5" />
          )}
          <span>{currentSuggestions.length === 0 ? 'Aucune suggestion à exporter' : 'Télécharger le comparatif PDF'}</span>
        </button>
      </div>

      {/* Synthèse Finale */}
      <EditableSynthesis
        synthese={currentSynthese}
        suggestions={currentSuggestions}
        clientName={resolvedClientName}
        onAmeliorationsChange={handleAmeliorationsChange}
        needsAttention={needsSynthesisAttention}
      />

      <DownloadWarningModal
        isOpen={showWarningModal}
        onClose={() => setShowWarningModal(false)}
        onConfirm={() => {
          setShowWarningModal(false);
          onDownloadPdf(currentSuggestions, currentSynthese);
        }}
        changedProductsCount={modificationState.changedProductsCount}
        hasAnalysisUpdates={modificationState.hasAnalysisUpdates}
        hasSynthesisUpdate={modificationState.hasSynthesisUpdate}
      />
    </div>
  );
}

// Composant interne pour la carte
interface EditableSuggestionCardProps {
  suggestion: Suggestion;
  catalogue: CatalogueProduit[];
  onProductChange: (product: CatalogueProduit) => void;
  onAnalysisChange: (analysis: string) => void;
  needsAnalysisAttention?: boolean;
}

function EditableSuggestionCard({ suggestion, catalogue, onProductChange, onAnalysisChange, needsAnalysisAttention }: EditableSuggestionCardProps) {
  const isEconomy = suggestion.economie_mensuelle >= 0;
  
  // Fonction pour extraire un nom ou une description de la ligne actuelle (copiée de SuggestionsView)
  const getLigneName = (ligne: Record<string, unknown>) => {
    if (typeof ligne.nom === 'string') return ligne.nom;
    if (typeof ligne.forfait === 'string') return ligne.forfait;
    if (typeof ligne.label === 'string') return ligne.label;
    if (typeof ligne.numero === 'string') return ligne.numero;
    const firstString = Object.values(ligne).find(v => typeof v === 'string');
    return (firstString as string) || 'Ligne inconnue';
  };

  const currentProductName = getLigneName(suggestion.ligne_actuelle);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <Package className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-lg text-gray-800">
                {suggestion.produit_propose_nom} à la place de {currentProductName}
              </h3>
              {suggestion.produit_propose_fournisseur ? (
                <p className="text-xs text-gray-600">{suggestion.produit_propose_fournisseur}</p>
              ) : null}
            </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isEconomy ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
        }`}>
          {isEconomy ? (
            <><CheckCircle className="w-4 h-4 mr-1" /> Économie</>
          ) : (
            <><AlertTriangle className="w-4 h-4 mr-1" /> Surcoût</>
          )}
        </span>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Situation Actuelle (inchangé) */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Actuellement</h4>
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-700">{getLigneName(suggestion.ligne_actuelle)}</p>
                    <div className="text-xs text-gray-500 space-y-1">
                        {Object.entries(suggestion.ligne_actuelle)
                            .filter(([k, v]) => 
                                !['id', 'created_at', 'nom', 'forfait', 'label', 'prix', 'montant'].includes(k) && 
                                typeof v !== 'object'
                            )
                            .slice(0, 3)
                            .map(([k, v]) => (
                                <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                            ))
                        }
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-gray-700">{suggestion.prix_actuel}€</p>
                    <span className="text-xs text-gray-500">/mois</span>
                </div>
            </div>
          </div>

          {/* Situation Proposée (Editable) */}
          <EditableProposedProduct
            suggestion={suggestion}
            catalogue={catalogue}
            onProductChange={onProductChange}
          />
        </div>

        {/* Bloc Économie/Surcoût (Recalculé) */}
        <div className={`rounded-lg p-4 flex items-center justify-between ${
          isEconomy ? 'bg-green-50 border border-green-100' : 'bg-orange-50 border border-orange-100'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${isEconomy ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
              {isEconomy ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
            </div>
            <div>
              <p className={`font-medium ${isEconomy ? 'text-green-900' : 'text-orange-900'}`}>
                {isEconomy ? 'Économie estimée' : 'Surcoût estimé'}
              </p>
              <p className={`text-sm ${isEconomy ? 'text-green-700' : 'text-orange-700'}`}>
                <span className="font-bold">{Math.abs(suggestion.economie_mensuelle).toFixed(2)}€</span> / mois • <span className="font-bold">{Math.abs(suggestion.economie_mensuelle * 12).toFixed(2)}€</span> / an
              </p>
            </div>
          </div>
        </div>

        {/* Justification (Editable) */}
        <EditableAnalysis
          suggestion={suggestion}
          onAnalysisChange={onAnalysisChange}
          needsAttention={Boolean(needsAnalysisAttention)}
        />
      </div>
    </div>
  );
}
