'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { InteractivePreview } from './InteractivePreview';
import { AIChatPanel } from './AIChatPanel';
import type { AIAnalysis, AISimpleVariable, AITable } from './types';
import type { Secteur } from '@/lib/ai/fields-catalog';

interface Props {
  analysis: AIAnalysis;
  setAnalysis: (a: AIAnalysis) => void;
  secteur: Secteur;
  onValidate: () => void;
  onPrev: () => void;
}

export function AIAnalysisResult({ analysis, setAnalysis, secteur, onValidate, onPrev }: Props) {
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (message: string) => {
    setIsSending(true);
    try {
      const resp = await fetch('/api/templates/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          currentAnalysis: analysis,
          chatHistory: analysis.chatHistory,
          secteur,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Erreur chat');
      }
      const data = await resp.json();
      setAnalysis(data.updatedAnalysis);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur chat IA');
    } finally {
      setIsSending(false);
    }
  };

  const handleVariableClick = (v: AISimpleVariable) => {
    toast.message(`${v.label} → ${v.suggestedDataKey}`, {
      description: v.detectedValue ? `Valeur détectée : ${v.detectedValue}` : 'Variable vierge',
    });
  };

  const handleTableClick = (t: AITable) => {
    toast.message(`Tableau : ${t.label}`, {
      description: `${t.columns.length} colonnes, ${t.rowsDetected} lignes détectées`,
    });
  };

  return (
    <div className="flex flex-col h-[80vh] border rounded-lg overflow-hidden">
      <div className="grid grid-cols-5 flex-1 overflow-hidden">
        <div className="col-span-3 border-r overflow-hidden">
          <InteractivePreview
            analysis={analysis}
            onVariableClick={handleVariableClick}
            onTableClick={handleTableClick}
          />
        </div>
        <div className="col-span-2 overflow-hidden">
          <AIChatPanel
            analysis={analysis}
            onSendMessage={handleSendMessage}
            isSending={isSending}
          />
        </div>
      </div>

      <div className="flex justify-between items-center px-4 py-3 border-t bg-gray-50">
        <button
          onClick={onPrev}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
        >
          ← Retour
        </button>
        <button
          onClick={onValidate}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:opacity-90"
        >
          Valider et continuer →
        </button>
      </div>
    </div>
  );
}
