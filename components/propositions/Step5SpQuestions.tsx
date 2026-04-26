'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, User, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropositionData } from './PropositionWizard';
import type { SpQuestion, SpQuestionReponse, SpAdresse, SuggestionsSpCompletes, CatalogueProduit } from '@/types';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

type MessageBubble =
  | { from: 'bot'; text: string }
  | { from: 'user'; text: string };

function formatReponseText(valeur: SpQuestionReponse['valeur']): string {
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (Array.isArray(valeur)) return valeur.join(', ');
  if (typeof valeur === 'object' && valeur !== null) {
    const a = valeur as SpAdresse;
    return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`].filter(Boolean).join(', ');
  }
  return String(valeur);
}

export function Step5SpQuestions({ propositionData, updatePropositionData, onNext, onPrev }: Props) {
  const [questions, setQuestions] = useState<SpQuestion[]>([]);
  const [reponses, setReponses] = useState<SpQuestionReponse[]>(propositionData.sp_reponses ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [messages, setMessages] = useState<MessageBubble[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [adresseEdit, setAdresseEdit] = useState<SpAdresse>({ adresse: '', code_postal: '', ville: '' });
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [generateError, setGenerateError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  const templateId = propositionData.template_id;

  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch('/api/catalogue/fournisseurs').then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
    ]).then(([qData, fData, cData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setQuestions(qs);
      setFournisseurs(fData.fournisseurs ?? []);
      setCatalogue(cData.produits ?? []);
      setLoadingQuestions(false);
    }).catch(() => setLoadingQuestions(false));
  }, [templateId]);

  useEffect(() => {
    if (questions.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      showQuestion(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const showQuestion = (idx: number) => {
    if (idx >= questions.length) return;
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setCurrentIdx(idx);
      setMessages((prev) => [...prev, { from: 'bot', text: questions[idx].libelle }]);
    }, 500);
  };

  const recordAnswer = (questionId: string, valeur: SpQuestionReponse['valeur']) => {
    const rep: SpQuestionReponse = { question_id: questionId, valeur };
    const next = reponses.filter((r) => r.question_id !== questionId).concat(rep);
    setReponses(next);
    updatePropositionData({ sp_reponses: next });
    setMessages((prev) => [...prev, { from: 'user', text: formatReponseText(valeur) }]);
    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) {
      showQuestion(nextIdx);
    } else {
      setCurrentIdx(questions.length);
    }
  };

  const currentQuestion = currentIdx < questions.length ? questions[currentIdx] : null;
  const allObligatoryAnswered = questions
    .filter((q) => q.obligatoire)
    .every((q) => reponses.some((r) => r.question_id === q.id));

  const handleGenerateSP = async () => {
    setIsGenerating(true);
    setGenerateError('');
    try {
      const fournisseurRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && q.affichage === 'boutons_choix_unique' && q.source === 'catalogue')
      );
      const adresseRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && (q.affichage === 'adresse_complete' || q.affichage === 'edition_sa'))
      );
      const materielRep = reponses.find((r) =>
        questions.find((q) => q.id === r.question_id && q.affichage === 'oui_non')
      );

      const body = {
        situation_actuelle: propositionData.donnees_extraites ?? {},
        catalogue,
        proposition_id: propositionData.proposition_id,
        force_regenerate: true,
        sp_questions_reponses: reponses,
        preferences: {
          fournisseur_prefere: fournisseurRep ? String(fournisseurRep.valeur) : undefined,
          proposer_materiel: materielRep ? (materielRep.valeur === true || materielRep.valeur === 'Oui') : false,
          adresse_facturation: adresseRep?.valeur as SpAdresse | undefined,
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
        throw new Error((err as { error?: string }).error ?? 'Erreur génération SP');
      }

      const data = await res.json() as SuggestionsSpCompletes;
      updatePropositionData({ suggestions_sp_completes: data });
      onNext();
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loadingQuestions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
          <p className="text-gray-500 mt-1">Aucune question SP n&apos;est configurée pour ce template.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev}>Précédent</Button>
          <Button onClick={onNext}>Continuer sans SP</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
        <p className="text-gray-600 mt-1">Répondez aux questions pour paramétrer votre proposition.</p>
      </div>

      {/* Historique de conversation */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 min-h-48 max-h-80 overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from === 'bot' && (
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div className={`max-w-xs md:max-w-sm px-3 py-2 rounded-lg text-sm leading-relaxed ${
              msg.from === 'bot'
                ? 'bg-white border border-gray-200 text-gray-800'
                : 'bg-blue-600 text-white'
            }`}>
              {msg.text}
            </div>
            {msg.from === 'user' && (
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-green-600" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie de la question courante */}
      {currentQuestion && !isTyping && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">{currentQuestion.libelle}</p>
          {currentQuestion.description && (
            <p className="text-xs text-blue-600">{currentQuestion.description}</p>
          )}

          {/* Oui / Non */}
          {currentQuestion.affichage === 'oui_non' && (
            <div className="flex gap-2">
              {['Oui', 'Non'].map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => recordAnswer(currentQuestion.id, opt === 'Oui')}
                >
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {/* Boutons choix unique (catalogue ou liste manuelle) */}
          {(currentQuestion.affichage === 'boutons_choix_unique' || currentQuestion.affichage === 'choix_liste_manuelle') && (
            <div className="flex flex-wrap gap-2">
              {(currentQuestion.options_manuelles?.length ? currentQuestion.options_manuelles : fournisseurs).map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => recordAnswer(currentQuestion.id, opt)}
                >
                  {opt}
                </Button>
              ))}
              {currentQuestion.options_libres && (
                <div className="flex gap-2 w-full mt-1">
                  <input
                    value={inputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                    placeholder="Autre..."
                    className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' && inputValue.trim()) {
                        recordAnswer(currentQuestion.id, inputValue.trim());
                        setInputValue('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (inputValue.trim()) {
                        recordAnswer(currentQuestion.id, inputValue.trim());
                        setInputValue('');
                      }
                    }}
                  >
                    Valider
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Texte court / long / nombre / date */}
          {(currentQuestion.affichage === 'texte_court' || currentQuestion.affichage === 'nombre') && (
            <div className="flex gap-2">
              <input
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                placeholder="Votre réponse..."
                type={currentQuestion.affichage === 'nombre' ? 'number' : 'text'}
                className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && inputValue.trim()) {
                    recordAnswer(currentQuestion.id, inputValue.trim());
                    setInputValue('');
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (inputValue.trim()) {
                    recordAnswer(currentQuestion.id, inputValue.trim());
                    setInputValue('');
                  }
                }}
              >
                Valider
              </Button>
            </div>
          )}

          {currentQuestion.affichage === 'texte_long' && (
            <div className="space-y-2">
              <textarea
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                placeholder="Votre réponse..."
                rows={3}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (inputValue.trim()) {
                    recordAnswer(currentQuestion.id, inputValue.trim());
                    setInputValue('');
                  }
                }}
              >
                Valider
              </Button>
            </div>
          )}

          {/* Adresse complète */}
          {(currentQuestion.affichage === 'adresse_complete' || currentQuestion.affichage === 'edition_sa') && (
            <div className="space-y-2">
              <input
                placeholder="Adresse (rue, numéro)"
                value={adresseEdit.adresse}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, adresse: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Code postal"
                  value={adresseEdit.code_postal}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, code_postal: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 w-32"
                />
                <input
                  placeholder="Ville"
                  value={adresseEdit.ville}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, ville: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                />
              </div>
              <Button
                size="sm"
                disabled={!adresseEdit.adresse || !adresseEdit.code_postal || !adresseEdit.ville}
                onClick={() => {
                  recordAnswer(currentQuestion.id, { ...adresseEdit });
                  setAdresseEdit({ adresse: '', code_postal: '', ville: '' });
                }}
              >
                Valider
              </Button>
            </div>
          )}

          {/* Confirmation SA */}
          {currentQuestion.affichage === 'confirmation_sa' && (
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => recordAnswer(currentQuestion.id, true)}>
                Oui, c&apos;est correct
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => recordAnswer(currentQuestion.id, false)}>
                Non, modifier
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bouton Générer la SP */}
      {allObligatoryAnswered && !currentQuestion && !isTyping && (
        <div className="border border-green-200 rounded-lg bg-green-50 p-4 space-y-3">
          <p className="font-medium text-green-900">
            ✓ Toutes les questions obligatoires ont été répondues.
          </p>
          {generateError && (
            <p className="text-sm text-red-600">{generateError}</p>
          )}
          <Button
            onClick={handleGenerateSP}
            disabled={isGenerating}
            className="bg-green-600 hover:bg-green-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4 mr-2" />
                Générer la Situation Proposée
              </>
            )}
          </Button>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
      </div>
    </div>
  );
}
