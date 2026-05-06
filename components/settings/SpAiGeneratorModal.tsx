'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Check, AlertCircle, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  templateId: string;
  nextOrdre: number;
  existingQuestions: SpQuestion[];
  onImport: (questions: SpQuestion[], replace: boolean) => void;
  onClose: () => void;
}

export function SpAiGeneratorModal({ templateId, nextOrdre, existingQuestions, onImport, onClose }: Props) {
  const isModifyMode = existingQuestions.length > 0;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<SpQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generatedQuestions]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const placeholder = isModifyMode
    ? `Décris la modification souhaitée...\n\nExemple : "Modifie la 1ère question en remplaçant les options par 'Site unique' et 'Site multiple'" ou "Ajoute une question sur la durée du contrat après la question de fibre"`
    : `Décris le workflow que tu veux créer...\n\nExemple : "Simple PTO ou Double PTO. Si double PTO, demander le type de fibre pour PTO 1 (FTTH ou Dédiée) et PTO 2 (FTTH ou Dédiée)."`;

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);
    setGeneratedQuestions(null);

    try {
      const res = await fetch('/api/sp-questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          templateId,
          existingQuestions: isModifyMode ? existingQuestions : [],
        }),
      });

      if (!res.ok) throw new Error('Erreur serveur');

      const data = await res.json() as { type: string; content?: string; questions?: SpQuestion[] };

      if (data.type === 'result' && data.questions) {
        const withOrdre = data.questions.map((q, i) => ({
          ...q,
          ordre: isModifyMode ? i + 1 : nextOrdre + i,
        }));
        setGeneratedQuestions(withOrdre);
        const action = isModifyMode ? 'modifié' : 'généré';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `J'ai ${action} ${withOrdre.length} question${withOrdre.length > 1 ? 's' : ''}. Vérifie l'aperçu ci-dessous avant d'appliquer.`,
          },
        ]);
      } else if (data.type === 'message' && data.content) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content! }]);
      }
    } catch {
      setError('Une erreur est survenue. Réessaie.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col shadow-2xl" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isModifyMode ? 'bg-orange-100' : 'bg-violet-100'}`}>
              {isModifyMode
                ? <Pencil className="w-4 h-4 text-orange-600" />
                : <Sparkles className="w-4 h-4 text-violet-600" />
              }
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {isModifyMode ? 'Modifier le workflow avec l\'IA' : 'Générer avec l\'IA'}
              </h2>
              <p className="text-xs text-gray-400">
                {isModifyMode
                  ? `${existingQuestions.length} question${existingQuestions.length > 1 ? 's' : ''} existante${existingQuestions.length > 1 ? 's' : ''} · décris ta modification`
                  : 'Décris ton workflow en langage naturel'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Résumé des questions existantes (mode modification) */}
        {isModifyMode && messages.length === 0 && (
          <div className="mx-5 mt-4 border border-orange-100 rounded-xl overflow-hidden shrink-0">
            <div className="bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold text-orange-700">Questions actuelles du workflow</p>
            </div>
            <div className="divide-y divide-gray-100 max-h-36 overflow-y-auto">
              {existingQuestions
                .filter((q) => q.actif)
                .sort((a, b) => a.ordre - b.ordre)
                .map((q, i) => (
                  <div key={q.id} className="px-3 py-1.5 bg-white flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
                    <span className="text-xs text-gray-700 truncate">{q.libelle}</span>
                    {(q.options_manuelles?.length ?? 0) > 0 && (
                      <span className="text-xs text-gray-400 shrink-0">
                        ({q.options_manuelles!.join(', ')})
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${isModifyMode ? 'bg-orange-50' : 'bg-violet-50'}`}>
                {isModifyMode
                  ? <Pencil className="w-6 h-6 text-orange-500" />
                  : <Sparkles className="w-6 h-6 text-violet-500" />
                }
              </div>
              <p className="text-sm font-medium text-gray-700">
                {isModifyMode ? 'Que veux-tu modifier ?' : 'Décris ton workflow'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                {isModifyMode
                  ? "L'IA voit tes questions existantes et retournera le workflow complet mis à jour."
                  : "L'IA peut poser des questions de clarification si nécessaire avant de générer."}
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5 shrink-0 ${isModifyMode ? 'bg-orange-100' : 'bg-violet-100'}`}>
                  {isModifyMode
                    ? <Pencil className="w-3.5 h-3.5 text-orange-600" />
                    : <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                  }
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? isModifyMode ? 'bg-orange-600 text-white rounded-tr-sm' : 'bg-violet-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5 shrink-0 ${isModifyMode ? 'bg-orange-100' : 'bg-violet-100'}`}>
                {isModifyMode
                  ? <Pencil className="w-3.5 h-3.5 text-orange-600" />
                  : <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                }
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                <span className="text-xs text-gray-400">
                  {isModifyMode ? 'Modification en cours…' : 'Réflexion en cours…'}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Preview */}
          {generatedQuestions && (
            <div className={`border rounded-xl overflow-hidden ${isModifyMode ? 'border-orange-200' : 'border-violet-200'}`}>
              <div className={`px-4 py-2.5 flex items-center justify-between ${isModifyMode ? 'bg-orange-50' : 'bg-violet-50'}`}>
                <span className={`text-xs font-semibold ${isModifyMode ? 'text-orange-700' : 'text-violet-700'}`}>
                  {generatedQuestions.length} question{generatedQuestions.length > 1 ? 's' : ''}
                  {isModifyMode ? ' — workflow mis à jour' : ' générée' + (generatedQuestions.length > 1 ? 's' : '')}
                </span>
                <Button
                  size="sm"
                  onClick={() => onImport(generatedQuestions, isModifyMode)}
                  className={`h-7 text-white text-xs px-3 ${isModifyMode ? 'bg-orange-600 hover:bg-orange-700' : 'bg-violet-600 hover:bg-violet-700'}`}
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  {isModifyMode ? 'Remplacer le workflow' : 'Importer dans le template'}
                </Button>
              </div>
              <div className="divide-y divide-gray-100">
                {generatedQuestions.map((q, i) => {
                  const wasExisting = existingQuestions.some((e) => e.id === q.id);
                  return (
                    <div key={q.id} className={`px-4 py-2.5 flex items-start gap-3 ${wasExisting ? 'bg-white' : 'bg-green-50/50'}`}>
                      <span className="text-xs text-gray-400 font-mono mt-0.5 w-5 shrink-0">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-800 truncate">{q.libelle}</p>
                          {!wasExisting && isModifyMode && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">nouveau</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                            {q.affichage}
                          </span>
                          {(q.groupes_conditions?.length ?? 0) > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">conditionnel</span>
                          )}
                          {(q.consequences ?? []).some((c) => c.type === 'renseigner_variable') && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-mono">
                              {`{{${q.consequences.find((c) => c.type === 'renseigner_variable')?.variable_cible}}}`}
                            </span>
                          )}
                          {(q.options_manuelles?.length ?? 0) > 0 && (
                            <span className="text-xs text-gray-400">{q.options_manuelles!.join(' · ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={messages.length === 0 ? placeholder : 'Précise ta demande ou continue la conversation…'}
              rows={messages.length === 0 ? 3 : 2}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 disabled:opacity-50 transition-all"
            />
            <Button
              onClick={send}
              disabled={!input.trim() || loading}
              className={`h-10 w-10 p-0 rounded-xl shrink-0 ${isModifyMode ? 'bg-orange-600 hover:bg-orange-700' : 'bg-violet-600 hover:bg-violet-700'}`}
            >
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />
              }
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</p>
        </div>
      </div>
    </div>
  );
}
