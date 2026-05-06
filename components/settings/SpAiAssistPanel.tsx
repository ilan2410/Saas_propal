'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Patch {
  libelle?: string;
  description?: string;
  source?: SpQuestion['source'];
  affichage?: SpQuestion['affichage'];
  options_manuelles?: string[];
  obligatoire?: boolean;
  priorite_ia?: 'normale' | 'haute';
}

interface PatchMessage {
  patch: Patch;
  explanation: string;
}

type AssistMessage =
  | { kind: 'chat'; role: 'user' | 'assistant'; content: string }
  | { kind: 'patch'; data: PatchMessage; applied: boolean };

interface Props {
  currentQuestion: Partial<SpQuestion>;
  otherQuestions: SpQuestion[];
  onApply: (patch: Patch) => void;
}

const PATCH_LABELS: Record<string, string> = {
  libelle: 'Libellé',
  description: 'Description',
  source: 'Source',
  affichage: 'Affichage',
  options_manuelles: 'Options',
  obligatoire: 'Obligatoire',
  priorite_ia: 'Priorité IA',
};

export function SpAiAssistPanel({ currentQuestion, otherQuestions, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: AssistMessage = { kind: 'chat', role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setError(null);

    // Build the flat messages array for the API (only chat messages)
    const chatHistory = updatedMessages
      .filter((m): m is Extract<AssistMessage, { kind: 'chat' }> => m.kind === 'chat')
      .map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch('/api/sp-questions/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          currentQuestion,
          otherQuestions: otherQuestions.map(({ id, libelle }) => ({ id, libelle })),
        }),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      const data = await res.json() as
        | { type: 'message'; content: string }
        | { type: 'patch'; patch: Patch; explanation: string };

      if (data.type === 'patch') {
        setMessages((prev) => [
          ...prev,
          { kind: 'patch', data: { patch: data.patch, explanation: data.explanation }, applied: false },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { kind: 'chat', role: 'assistant', content: data.content },
        ]);
      }
    } catch {
      setError('Erreur de connexion. Réessaie.');
    } finally {
      setLoading(false);
    }
  };

  const applyPatch = (idx: number, patch: Patch) => {
    onApply(patch);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === idx && m.kind === 'patch' ? { ...m, applied: true } : m
      )
    );
  };

  const patchSummary = (patch: Patch) =>
    Object.entries(patch)
      .map(([k, v]) => {
        const label = PATCH_LABELS[k] ?? k;
        const val = Array.isArray(v) ? v.join(', ') : String(v);
        return `${label} → ${val}`;
      })
      .join(' · ');

  return (
    <div className="border-t border-gray-100 mt-4">
      {/* Toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-violet-700 hover:bg-violet-50 rounded-b-lg transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Aide IA — demande de l&apos;aide pour remplir cette question
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="border border-violet-100 rounded-xl overflow-hidden bg-violet-50/30 mx-0 mt-1">
          {/* Conversation */}
          <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-2">
                Décris ce que tu veux faire — l&apos;IA peut remplir les champs pour toi.
              </p>
            )}

            {messages.map((msg, i) => {
              if (msg.kind === 'chat') {
                return (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-5 h-5 rounded-full bg-violet-200 flex items-center justify-center mr-1.5 mt-0.5 shrink-0">
                        <Sparkles className="w-3 h-3 text-violet-700" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white rounded-tr-sm'
                        : 'bg-white text-gray-700 border border-gray-100 rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Patch card
              return (
                <div key={i} className={`rounded-xl border overflow-hidden text-xs ${msg.applied ? 'border-green-200 opacity-60' : 'border-violet-200'}`}>
                  <div className={`px-3 py-2 flex items-center justify-between ${msg.applied ? 'bg-green-50' : 'bg-violet-50'}`}>
                    <span className={`font-medium ${msg.applied ? 'text-green-700' : 'text-violet-700'}`}>
                      {msg.applied ? '✓ Appliqué' : '✦ Suggestions à appliquer'}
                    </span>
                    {!msg.applied && (
                      <Button
                        size="sm"
                        onClick={() => applyPatch(i, msg.data.patch)}
                        className="h-6 bg-violet-600 hover:bg-violet-700 text-white text-xs px-2"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Appliquer
                      </Button>
                    )}
                  </div>
                  <div className="px-3 py-2 bg-white space-y-1">
                    {msg.data.explanation && (
                      <p className="text-gray-500 mb-1.5">{msg.data.explanation}</p>
                    )}
                    <p className="text-gray-400 font-mono text-[11px] leading-relaxed">
                      {patchSummary(msg.data.patch)}
                    </p>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Réflexion…
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 flex gap-2 items-end border-t border-violet-100 pt-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder='Ex: "Question oui/non sur la garantie matérielle, obligatoire"'
              rows={2}
              disabled={loading}
              className="flex-1 resize-none rounded-lg border border-violet-200 px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-300 bg-white disabled:opacity-50"
            />
            <Button
              onClick={send}
              disabled={!input.trim() || loading}
              className="h-9 w-9 p-0 bg-violet-600 hover:bg-violet-700 rounded-lg shrink-0"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <Send className="w-3.5 h-3.5 text-white" />
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
