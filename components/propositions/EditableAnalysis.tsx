import { useState } from 'react';
import { Suggestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Edit2, Lightbulb, Loader2, X, Check } from 'lucide-react';

interface EditableAnalysisProps {
  suggestion: Suggestion;
  onAnalysisChange: (newAnalysis: string) => void;
  needsAttention?: boolean;
}

export function EditableAnalysis({ suggestion, onAnalysisChange, needsAttention = false }: EditableAnalysisProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerating] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.justification);

  

  const handleSaveManual = () => {
    onAnalysisChange(editValue);
    setIsEditing(false);
  };

  const handleCancelManual = () => {
    setEditValue(suggestion.justification);
    setIsEditing(false);
  };

  return (
    <div className={`mt-6 text-gray-600 p-4 rounded-lg border relative group ${needsAttention ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-start space-x-3">
        <Lightbulb className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-gray-500 uppercase">Notre analyse</p>
            {needsAttention ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                À régénérer
              </span>
            ) : null}
          </div>
          
          {isEditing ? (
            <div className="mt-2 space-y-3">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full min-h-[100px] p-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="relative">
              {isRegenerating ? (
                <div className="flex items-center space-x-2 text-sm text-blue-600 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Régénération de l&apos;analyse en cours...</span>
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{suggestion.justification}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {!isEditing && !isRegenerating && (
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setEditValue(suggestion.justification);
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
  );
}
