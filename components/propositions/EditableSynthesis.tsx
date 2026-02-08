import { useState } from 'react';
import { SuggestionsSynthese, Suggestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Edit2, Lightbulb, Loader2, X, Check } from 'lucide-react';

interface EditableSynthesisProps {
  synthese: SuggestionsSynthese;
  suggestions: Suggestion[]; // Nécessaire pour l'IA
  clientName?: string | null;
  onAmeliorationsChange: (ameliorations: string[]) => void;
  needsAttention?: boolean;
}

export function EditableSynthesis({ 
  synthese, 
  suggestions, 
  clientName, 
  onAmeliorationsChange,
  needsAttention = false
}: EditableSynthesisProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerating] = useState(false);
  const [editValue, setEditValue] = useState((synthese.ameliorations || []).join('\n'));

  const isPositiveEconomy = synthese.economie_mensuelle >= 0;

  

  const handleSaveManual = () => {
    const lines = editValue
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    onAmeliorationsChange(lines);
    setIsEditing(false);
  };

  const handleCancelManual = () => {
    setEditValue((synthese.ameliorations || []).join('\n'));
    setIsEditing(false);
  };

  return (
    <div className={`border rounded-xl p-6 relative group ${needsAttention ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg border ${needsAttention ? 'bg-amber-100 border-amber-200' : 'bg-white border-slate-200'}`}>
          <Lightbulb className="w-5 h-5 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Synthèse finale</h3>
              {needsAttention ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                  À régénérer
                </span>
              ) : null}
            </div>
            {clientName ? (
              <p className="text-sm text-slate-600">
                Client : <span className="font-semibold text-slate-800">{clientName}</span>
              </p>
            ) : null}
          </div>

          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            Après analyse de <span className="font-semibold">{suggestions.length}</span> ligne{suggestions.length > 1 ? 's' : ''},
            le coût mensuel estimé passe de <span className="font-semibold">{synthese.cout_total_actuel.toFixed(2)}€</span> à{' '}
            <span className="font-semibold">{synthese.cout_total_propose.toFixed(2)}€</span>, soit{' '}
            <span className={`font-semibold ${isPositiveEconomy ? 'text-emerald-700' : 'text-orange-700'}`}>
              {isPositiveEconomy ? 'une économie' : 'un surcoût'} de {Math.abs(synthese.economie_mensuelle).toFixed(2)}€ / mois
            </span>{' '}
            ({Math.abs(synthese.economie_annuelle).toFixed(2)}€ / an).
          </p>

          <div className="mt-4 relative">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Points clés</p>
            
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full min-h-[150px] p-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  placeholder="Un point clé par ligne..."
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={handleCancelManual} className="h-8">
                    <X className="w-4 h-4 mr-1" /> Annuler
                  </Button>
                  <Button size="sm" onClick={handleSaveManual} className="h-8">
                    <Check className="w-4 h-4 mr-1" /> Valider
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {isRegenerating ? (
                   <div className="flex items-center space-x-2 text-sm text-blue-600 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Régénération des points clés en cours...</span>
                  </div>
                ) : (
                  <>
                    {Array.isArray(synthese.ameliorations) && synthese.ameliorations.length > 0 ? (
                      <ul className="space-y-1.5">
                        {synthese.ameliorations.slice(0, 6).map((a, idx) => (
                          <li key={`${idx}-${a}`} className="flex gap-2 text-sm text-slate-700">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                            <span className="flex-1">{a}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-600 mt-3">
                        Aucun point clé n&apos;a été fourni dans la synthèse.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            
            {!isEditing && !isRegenerating && (
              <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditValue((synthese.ameliorations || []).join('\n'));
                    setIsEditing(true);
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded-md transition-colors text-gray-600"
                  title="Modifier manuellement"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
