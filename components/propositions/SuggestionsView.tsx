import { SuggestionsGenerees, Suggestion } from '@/types';
import { MetricCard } from './MetricCard';
import { Euro, TrendingDown, TrendingUp, Package, Lightbulb, CheckCircle, AlertTriangle, FileDown } from 'lucide-react';

interface SuggestionsViewProps {
  suggestions: SuggestionsGenerees;
  onDownloadPdf: () => void;
  isDownloading?: boolean;
}

export function SuggestionsView({ suggestions, onDownloadPdf, isDownloading = false }: SuggestionsViewProps) {
  const { synthese, suggestions: items } = suggestions;

  const isPositiveEconomy = synthese.economie_mensuelle >= 0;

  return (
    <div className="space-y-8">
      {/* Dashboard Synthèse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Économie Mensuelle"
          value={`${Math.abs(synthese.economie_mensuelle).toFixed(2)}€`}
          subtitle={`${Math.abs(synthese.economie_annuelle).toFixed(2)}€ / an`}
          icon={Euro}
          color={isPositiveEconomy ? 'green' : 'orange'}
        />
        <MetricCard
          title={isPositiveEconomy ? "Réduction Globale" : "Augmentation Globale"}
          value={`${synthese.cout_total_actuel > 0 ? ((Math.abs(synthese.economie_mensuelle) / synthese.cout_total_actuel) * 100).toFixed(1) : 0}%`}
          subtitle={isPositiveEconomy ? "d'économie réalisée" : "de surcoût estimé"}
          icon={isPositiveEconomy ? TrendingDown : TrendingUp}
          color={isPositiveEconomy ? 'green' : 'orange'}
        />
        <MetricCard
          title="Lignes Analysées"
          value={items.length.toString()}
          subtitle="produits optimisés"
          icon={Package}
          color="blue"
        />
      </div>

      {/* Liste des Suggestions */}
      <div className="grid gap-6">
        {items.map((item, index) => (
          <SuggestionCard key={index} suggestion={item} />
        ))}
      </div>

      {/* Bouton Export PDF */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onDownloadPdf}
          disabled={isDownloading}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isDownloading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FileDown className="w-5 h-5" />
          )}
          <span>Télécharger le comparatif PDF</span>
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const isEconomy = suggestion.economie_mensuelle >= 0;
  
  // Fonction pour extraire un nom ou une description de la ligne actuelle
  const getLigneName = (ligne: Record<string, unknown>) => {
    // Essayer de trouver des champs communs
    if (typeof ligne.nom === 'string') return ligne.nom;
    if (typeof ligne.forfait === 'string') return ligne.forfait;
    if (typeof ligne.label === 'string') return ligne.label;
    if (typeof ligne.numero === 'string') return ligne.numero;
    
    // Sinon retourner la première valeur string
    const firstString = Object.values(ligne).find(v => typeof v === 'string');
    return (firstString as string) || 'Ligne inconnue';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <Package className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-gray-800">{suggestion.produit_propose_nom}</h3>
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
          {/* Situation Actuelle */}
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

          {/* Situation Proposée */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <h4 className="text-xs font-bold text-blue-500 mb-3 uppercase tracking-wider">Proposé</h4>
             <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-800">{suggestion.produit_propose_nom}</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-blue-700">{suggestion.prix_propose}€</p>
                    <span className="text-xs text-blue-500">/mois</span>
                </div>
            </div>
          </div>
        </div>

        {/* Bloc Économie/Surcoût */}
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

        {/* Justification */}
        <div className="mt-6 flex items-start space-x-3 text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <Lightbulb className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Notre analyse</p>
            <p className="text-sm leading-relaxed">{suggestion.justification}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
