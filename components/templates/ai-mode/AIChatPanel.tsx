'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { AIAnalysis, AIChatMessage } from './types';

interface Props {
  analysis: AIAnalysis;
  onSendMessage: (message: string) => Promise<void>;
  isSending?: boolean;
}

export function AIChatPanel({ analysis, onSendMessage, isSending }: Props) {
  const [input, setInput] = useState('');

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isSending) return;
    setInput('');
    await onSendMessage(msg);
  };

  const quickAction = (text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
  };

  return (
    <div className="flex flex-col h-full border-l bg-white">
      {/* Récap */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-4 text-xs text-gray-700">
          <span>
            <strong>{analysis.simpleVariables.length}</strong> variables
          </span>
          <span>
            <strong>{analysis.tables.length}</strong> tableaux
          </span>
          <span>
            <strong>{analysis.simpleVariables.filter((v) => v.isCustom).length}</strong>{' '}
            custom
          </span>
        </div>
      </div>

      {/* Historique */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {analysis.chatHistory.length === 0 && (
          <p className="text-sm text-gray-500 text-center mt-4">
            Discute avec l&apos;IA pour affiner l&apos;analyse — ajout, fusion, renommage…
          </p>
        )}
        {analysis.chatHistory.map((msg: AIChatMessage, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Actions rapides */}
      <div className="px-4 py-2 border-t bg-gray-50 flex flex-wrap gap-2">
        {['+ Variable', 'Fusionner les tableaux', 'Renommer', 'Supprimer'].map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => quickAction(a)}
            className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-100"
          >
            {a}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Demande à l'IA…"
          rows={2}
          className="flex-1 text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
