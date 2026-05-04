'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, User, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropositionData } from './PropositionWizard';
import type { SpQuestion, SpQuestionReponse, SpAdresse, SuggestionsSpCompletes, CatalogueProduit, SpFiltresCatalogue, SpConsequence } from '@/types';
import { evaluateQuestionVisibility, filterCatalogueByFiltre } from '@/lib/sp/evaluateConditions';

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

// ── Helper: remap reponses for loop iteration context ───────────────
// Within a loop, condition references to questions in the same group
// should resolve to the answer from the same iteration.
function remapReponsesForIteration(
  reponses: SpQuestionReponse[],
  allQuestions: SpQuestion[],
  groupeBoucleId: string,
  iterationIndex: number,
): SpQuestionReponse[] {
  const groupQuestionIds = new Set(
    allQuestions.filter((q) => q.groupe_boucle_id === groupeBoucleId).map((q) => q.id),
  );
  return reponses.map((r) => {
    // If this response is for a question in the same loop group,
    // remap the iteration-suffixed id back to the base question id
    // so that conditions referencing the base id resolve correctly.
    const baseId = r.question_id.replace(/__iter_\d+$/, '');
    if (groupQuestionIds.has(baseId)) {
      const expectedId = `${baseId}__iter_${iterationIndex}`;
      if (r.question_id === expectedId) {
        return { ...r, question_id: baseId };
      }
      // Not from this iteration → skip by returning with a non-matching id
      return { ...r, question_id: `__skip__${r.question_id}` };
    }
    return r;
  });
}

// ── MultipleChoiceInput: inline component for boutons_choix_multiple ─
function MultipleChoiceInput({
  options,
  onSubmit,
}: {
  options: string[];
  onSubmit: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              selected.has(opt)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <Button
          size="sm"
          onClick={() => onSubmit(Array.from(selected))}
        >
          Valider ({selected.size} sélectionné{selected.size > 1 ? 's' : ''})
        </Button>
      )}
    </div>
  );
}

// ── Expanded question: a question instance (may be inside a loop iteration) ──
interface ExpandedQuestion {
  question: SpQuestion;
  /** Unique key for this instance (question.id or question.id__iter_N) */
  instanceId: string;
  /** Display label (may be prefixed with loop iteration label) */
  displayLabel: string;
  /** Loop iteration index (-1 if not in a loop) */
  iterationIndex: number;
  /** Loop iteration label (e.g. "Site Paris") */
  iterationLabel?: string;
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
  // Consequence-driven state
  const [hiddenByConsequence, setHiddenByConsequence] = useState<Set<string>>(new Set());
  const [shownByConsequence, setShownByConsequence] = useState<Set<string>>(new Set());
  const [dynamicFilters, setDynamicFilters] = useState<Map<string, SpFiltresCatalogue>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  const templateId = propositionData.template_id;
  const donneesExtraites = (propositionData.donnees_extraites ?? {}) as Record<string, unknown>;

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

  // ── Expand questions: handle loop groups ──────────────────────────
  const expandedQuestions: ExpandedQuestion[] = (() => {
    const result: ExpandedQuestion[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (processed.has(q.id)) continue;

      // Check if this question starts a loop
      if (q.boucle && q.groupe_boucle_id) {
        const groupId = q.groupe_boucle_id;
        // Collect all questions in this loop group
        const loopQuestions = questions.filter((lq) => lq.groupe_boucle_id === groupId);
        loopQuestions.forEach((lq) => processed.add(lq.id));

        // Determine iteration count
        let iterationCount = q.boucle.nombre_fixe ?? 1;
        const labels: string[] = [];

        if (q.boucle.source_nombre_question_id) {
          const rep = reponses.find((r) => r.question_id === q.boucle!.source_nombre_question_id);
          if (rep) {
            const n = Number(rep.valeur);
            if (Number.isFinite(n) && n > 0) iterationCount = n;
          }
        }

        if (q.boucle.source_labels_question_id) {
          const rep = reponses.find((r) => r.question_id === q.boucle!.source_labels_question_id);
          if (rep && Array.isArray(rep.valeur)) {
            labels.push(...rep.valeur.map(String));
          } else if (rep && typeof rep.valeur === 'string') {
            labels.push(...rep.valeur.split(',').map((s) => s.trim()).filter(Boolean));
          }
        }

        for (let iter = 0; iter < iterationCount; iter++) {
          const iterLabel = labels[iter] || `${q.boucle.label_prefix || 'Item'} ${iter + 1}`;
          for (const lq of loopQuestions) {
            result.push({
              question: lq,
              instanceId: `${lq.id}__iter_${iter}`,
              displayLabel: `[${iterLabel}] ${lq.libelle}`,
              iterationIndex: iter,
              iterationLabel: iterLabel,
            });
          }
        }
      } else if (!q.groupe_boucle_id) {
        // Normal question (not part of any loop group)
        result.push({
          question: q,
          instanceId: q.id,
          displayLabel: q.libelle,
          iterationIndex: -1,
        });
      }
      // Questions with groupe_boucle_id but no boucle are handled above via the group leader
    }
    return result;
  })();

  // ── Visibility check for an expanded question ─────────────────────
  const isQuestionVisible = (eq: ExpandedQuestion): boolean => {
    // Consequence-driven overrides
    if (hiddenByConsequence.has(eq.question.id) || hiddenByConsequence.has(eq.instanceId)) return false;
    if (shownByConsequence.has(eq.question.id) || shownByConsequence.has(eq.instanceId)) return true;

    // For loop iterations, remap condition references to same iteration
    const effectiveReponses = eq.iterationIndex >= 0
      ? remapReponsesForIteration(reponses, questions, eq.question.groupe_boucle_id!, eq.iterationIndex)
      : reponses;

    return evaluateQuestionVisibility(eq.question, effectiveReponses, donneesExtraites, catalogue);
  };

  // ── Find next visible question from a given index ─────────────────
  const findNextVisibleIndex = (fromIdx: number): number => {
    for (let i = fromIdx + 1; i < expandedQuestions.length; i++) {
      if (isQuestionVisible(expandedQuestions[i])) return i;
    }
    return expandedQuestions.length; // past end = done
  };

  useEffect(() => {
    if (questions.length > 0 && expandedQuestions.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      // Find first visible question
      const firstVisible = expandedQuestions.findIndex((eq) => isQuestionVisible(eq));
      if (firstVisible >= 0) {
        showQuestion(firstVisible);
      } else {
        setCurrentIdx(expandedQuestions.length);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, expandedQuestions.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const showQuestion = (idx: number) => {
    if (idx >= expandedQuestions.length) return;
    const eq = expandedQuestions[idx];
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setCurrentIdx(idx);
      setMessages((prev) => [...prev, { from: 'bot', text: eq.displayLabel }]);
    }, 500);
  };

  // ── Process consequences after answering ──────────────────────────
  const processConsequences = (consequences: SpConsequence[], answeredValue: SpQuestionReponse['valeur']) => {
    let jumpToQuestionId: string | null = null;

    for (const c of consequences) {
      switch (c.type) {
        case 'afficher_question':
          if (c.question_id) {
            setShownByConsequence((prev) => new Set(prev).add(c.question_id!));
            setHiddenByConsequence((prev) => {
              const next = new Set(prev);
              next.delete(c.question_id!);
              return next;
            });
          }
          break;
        case 'masquer_question':
          if (c.question_id) {
            setHiddenByConsequence((prev) => new Set(prev).add(c.question_id!));
            setShownByConsequence((prev) => {
              const next = new Set(prev);
              next.delete(c.question_id!);
              return next;
            });
          }
          break;
        case 'aller_question':
          if (c.question_id) jumpToQuestionId = c.question_id;
          break;
        case 'filtrer_question':
          if (c.question_id && c.filtre) {
            setDynamicFilters((prev) => new Map(prev).set(c.question_id!, c.filtre!));
          }
          break;
        case 'renseigner_variable':
          // Already handled by sending reponses to API
          break;
      }
    }

    return jumpToQuestionId;
  };

  const recordAnswer = (instanceId: string, valeur: SpQuestionReponse['valeur']) => {
    const rep: SpQuestionReponse = { question_id: instanceId, valeur };
    const next = reponses.filter((r) => r.question_id !== instanceId).concat(rep);
    setReponses(next);
    updatePropositionData({ sp_reponses: next });
    setMessages((prev) => [...prev, { from: 'user', text: formatReponseText(valeur) }]);

    // Process consequences
    const eq = expandedQuestions[currentIdx];
    const jumpTo = eq ? processConsequences(eq.question.consequences ?? [], valeur) : null;

    if (jumpTo) {
      // Jump to specific question
      const jumpIdx = expandedQuestions.findIndex(
        (e) => e.question.id === jumpTo || e.instanceId === jumpTo,
      );
      if (jumpIdx >= 0) {
        showQuestion(jumpIdx);
        return;
      }
    }

    // Find next visible question
    const nextIdx = findNextVisibleIndex(currentIdx);
    if (nextIdx < expandedQuestions.length) {
      showQuestion(nextIdx);
    } else {
      setCurrentIdx(expandedQuestions.length);
    }
  };

  const currentExpanded = currentIdx < expandedQuestions.length ? expandedQuestions[currentIdx] : null;
  const currentQuestion = currentExpanded?.question ?? null;

  // Compute catalogue options for current question (with dynamic filters)
  const currentCatalogueOptions: CatalogueProduit[] = (() => {
    if (!currentQuestion || (currentQuestion.source !== 'catalogue' && currentQuestion.source !== 'catalogue_et_sa')) return [];
    let filtered = catalogue.filter((p) => p.actif);
    // Apply question's own filters
    if (currentQuestion.filtres_catalogue) {
      filtered = filterCatalogueByFiltre(filtered, currentQuestion.filtres_catalogue);
    }
    // Apply dynamic filters from consequences
    const dynFilter = currentExpanded ? dynamicFilters.get(currentQuestion.id) ?? dynamicFilters.get(currentExpanded.instanceId) : undefined;
    if (dynFilter) {
      filtered = filterCatalogueByFiltre(filtered, dynFilter);
    }
    if (currentQuestion.nombre_max_resultats) {
      filtered = filtered.slice(0, currentQuestion.nombre_max_resultats);
    }
    return filtered;
  })();

  // Check if all obligatory visible questions are answered
  const allObligatoryAnswered = expandedQuestions
    .filter((eq) => eq.question.obligatoire && isQuestionVisible(eq))
    .every((eq) => reponses.some((r) => r.question_id === eq.instanceId));

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
      {currentQuestion && currentExpanded && !isTyping && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">{currentExpanded.displayLabel}</p>
          {currentQuestion.description && (
            <p className="text-xs text-blue-600">{currentQuestion.description}</p>
          )}
          {currentExpanded.iterationLabel && (
            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              {currentExpanded.iterationLabel}
            </span>
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
                  onClick={() => recordAnswer(currentExpanded.instanceId, opt === 'Oui')}
                >
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {/* Boutons choix unique / liste manuelle — avec support catalogue filtré */}
          {(currentQuestion.affichage === 'boutons_choix_unique' || currentQuestion.affichage === 'choix_liste_manuelle') && (
            <div className="flex flex-wrap gap-2">
              {(() => {
                // Use catalogue options if source is catalogue, otherwise manual options or fournisseurs
                const options: string[] =
                  currentCatalogueOptions.length > 0
                    ? currentCatalogueOptions.map((p) => p.nom)
                    : currentQuestion.options_manuelles?.length
                    ? currentQuestion.options_manuelles
                    : fournisseurs;
                return options.map((opt) => (
                  <Button
                    key={opt}
                    size="sm"
                    variant="outline"
                    className="bg-white"
                    onClick={() => recordAnswer(currentExpanded.instanceId, opt)}
                  >
                    {opt}
                  </Button>
                ));
              })()}
              {currentQuestion.options_libres && (
                <div className="flex gap-2 w-full mt-1">
                  <input
                    value={inputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                    placeholder="Autre..."
                    className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' && inputValue.trim()) {
                        recordAnswer(currentExpanded.instanceId, inputValue.trim());
                        setInputValue('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (inputValue.trim()) {
                        recordAnswer(currentExpanded.instanceId, inputValue.trim());
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

          {/* Liste déroulante — with catalogue support */}
          {currentQuestion.affichage === 'liste_deroulante' && (
            <div className="flex gap-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    recordAnswer(currentExpanded.instanceId, e.target.value);
                  }
                }}
                className="h-8 text-sm border border-gray-300 rounded px-2 flex-1 bg-white"
              >
                <option value="">Sélectionnez...</option>
                {(currentCatalogueOptions.length > 0
                  ? currentCatalogueOptions.map((p) => p.nom)
                  : currentQuestion.options_manuelles ?? fournisseurs
                ).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          {/* Boutons choix multiple */}
          {currentQuestion.affichage === 'boutons_choix_multiple' && (
            <MultipleChoiceInput
              options={
                currentCatalogueOptions.length > 0
                  ? currentCatalogueOptions.map((p) => p.nom)
                  : currentQuestion.options_manuelles ?? fournisseurs
              }
              onSubmit={(selected) => recordAnswer(currentExpanded.instanceId, selected)}
            />
          )}

          {/* Date */}
          {currentQuestion.affichage === 'date' && (
            <div className="flex gap-2">
              <input
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                type="date"
                className="h-8 text-sm border border-gray-300 rounded px-2"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (inputValue.trim()) {
                    recordAnswer(currentExpanded.instanceId, inputValue.trim());
                    setInputValue('');
                  }
                }}
              >
                Valider
              </Button>
            </div>
          )}

          {/* Texte court / nombre */}
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
                    recordAnswer(currentExpanded.instanceId, inputValue.trim());
                    setInputValue('');
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (inputValue.trim()) {
                    recordAnswer(currentExpanded.instanceId, inputValue.trim());
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
                    recordAnswer(currentExpanded.instanceId, inputValue.trim());
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
                  recordAnswer(currentExpanded.instanceId, { ...adresseEdit });
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
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => recordAnswer(currentExpanded.instanceId, true)}>
                Oui, c&apos;est correct
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => recordAnswer(currentExpanded.instanceId, false)}>
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
