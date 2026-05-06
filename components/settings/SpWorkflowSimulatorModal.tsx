'use client';

import { useState, useMemo } from 'react';
import { X, Play, RotateCcw, CheckCircle2, ChevronRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpQuestionReponse } from '@/types';
import { evaluateQuestionVisibility } from '@/lib/sp/evaluateConditions';

interface Props {
  questions: SpQuestion[];
  templateNom: string;
  onClose: () => void;
}

type Reponses = Record<string, string | string[] | boolean>;

function toSpReponses(reponses: Reponses): SpQuestionReponse[] {
  return Object.entries(reponses).map(([question_id, valeur]) => ({
    question_id,
    valeur: valeur as SpQuestionReponse['valeur'],
  }));
}

// ── Loop expansion (simplified for simulator) ─────────────────────────────
interface ExpandedQuestion {
  question: SpQuestion;
  iterationIndex: number;
  instanceId: string;
  label: string;
}

function expandLoops(questions: SpQuestion[], reponses: Reponses): ExpandedQuestion[] {
  const expanded: ExpandedQuestion[] = [];
  const loopGroups = new Map<string, SpQuestion[]>();

  // Group questions by boucle
  for (const q of questions) {
    if (q.groupe_boucle_id) {
      const group = loopGroups.get(q.groupe_boucle_id) ?? [];
      group.push(q);
      loopGroups.set(q.groupe_boucle_id, group);
    } else {
      expanded.push({ question: q, iterationIndex: 0, instanceId: q.id, label: '' });
    }
  }

  // Expand each loop group
  for (const [groupId, group] of loopGroups) {
    const leader = group.find((q) => q.boucle);
    if (!leader) {
      // No leader, add all as single iteration
      for (const q of group) {
        expanded.push({ question: q, iterationIndex: 0, instanceId: q.id, label: '' });
      }
      continue;
    }

    // Determine iteration count
    let iterationCount = 1;
    if (leader.boucle?.nombre_fixe) {
      iterationCount = leader.boucle.nombre_fixe;
    } else if (leader.boucle?.source_nombre_question_id) {
      const answer = reponses[leader.boucle.source_nombre_question_id];
      if (typeof answer === 'string') {
        iterationCount = parseInt(answer, 10) || 1;
      }
    }

    // Determine labels
    let labels: string[] = [];
    if (leader.boucle?.source_labels_question_id) {
      const answer = reponses[leader.boucle.source_labels_question_id];
      if (Array.isArray(answer)) {
        labels = answer;
      }
    }
    const defaultPrefix = leader.boucle?.prefixe_label || 'Élément';
    for (let i = labels.length; i < iterationCount; i++) {
      labels.push(`${defaultPrefix} ${i + 1}`);
    }

    // Create iterations
    for (let i = 0; i < iterationCount; i++) {
      const label = labels[i] || `${defaultPrefix} ${i + 1}`;
      for (const q of group) {
        expanded.push({
          question: q,
          iterationIndex: i,
          instanceId: `${q.id}--${i}`,
          label,
        });
      }
    }
  }

  return expanded.sort((a, b) => {
    const ordreDiff = a.question.ordre - b.question.ordre;
    if (ordreDiff !== 0) return ordreDiff;
    return a.iterationIndex - b.iterationIndex;
  });
}

// ── Consequence processing ───────────────────────────────────────────
function applyConsequences(
  questions: SpQuestion[],
  reponses: Reponses,
  currentQuestionId: string,
  visibleQuestionIds: Set<string>
): Set<string> {
  const newVisible = new Set(visibleQuestionIds);
  const currentQuestion = questions.find((q) => q.id === currentQuestionId);
  if (!currentQuestion) return newVisible;

  for (const consequence of currentQuestion.consequences ?? []) {
    if (consequence.type === 'afficher_question' && consequence.question_id) {
      newVisible.add(consequence.question_id);
    } else if (consequence.type === 'masquer_question' && consequence.question_id) {
      newVisible.delete(consequence.question_id);
    }
    // aller_question would need navigation logic - simplified for simulator
  }

  return newVisible;
}

// ── Composant individuel par type d'affichage ────────────────────────────────
function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: SpQuestion;
  value: string | string[] | boolean | undefined;
  onChange: (v: string | string[] | boolean) => void;
}) {
  const { affichage, options_manuelles = [] } = question;

  if (affichage === 'oui_non') {
    return (
      <div className="flex gap-2">
        {['Oui', 'Non'].map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              value === opt
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (affichage === 'boutons_choix_unique' || affichage === 'choix_liste_manuelle') {
    return (
      <div className="flex flex-wrap gap-2">
        {options_manuelles.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              value === opt
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
            }`}
          >
            {opt}
          </button>
        ))}
        {options_manuelles.length === 0 && (
          <span className="text-xs text-gray-400 italic">Aucune option définie</span>
        )}
      </div>
    );
  }

  if (affichage === 'boutons_choix_multiple') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt: string) => {
      onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
    };
    return (
      <div className="flex flex-wrap gap-2">
        {options_manuelles.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              selected.includes(opt)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
            }`}
          >
            {opt}
          </button>
        ))}
        {options_manuelles.length === 0 && (
          <span className="text-xs text-gray-400 italic">Aucune option définie</span>
        )}
      </div>
    );
  }

  if (affichage === 'liste_deroulante') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      >
        <option value="">-- Choisir --</option>
        {options_manuelles.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (affichage === 'nombre') {
    return (
      <input
        type="number"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 w-40"
        placeholder="0"
      />
    );
  }

  if (affichage === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    );
  }

  if (affichage === 'texte_long') {
    return (
      <textarea
        rows={3}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        placeholder="Votre réponse..."
      />
    );
  }

  if (affichage === 'confirmation_sa' || affichage === 'edition_sa') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1"
          placeholder="Valeur SA (simulation)"
        />
        <span className="text-xs text-gray-400 italic">depuis SA</span>
      </div>
    );
  }

  // texte_court + adresse_complete + fallback
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full max-w-sm"
      placeholder="Votre réponse..."
    />
  );
}

// ── Modal principale ─────────────────────────────────────────────────────────
export function SpWorkflowSimulatorModal({ questions, templateNom, onClose }: Props) {
  const [reponses, setReponses] = useState<Reponses>({});
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<Set<string>>(new Set());
  const [lastAnsweredId, setLastAnsweredId] = useState<string | null>(null);

  const activeQuestions = questions.filter((q) => q.actif).sort((a, b) => a.ordre - b.ordre);

  // Expand loops
  const expandedQuestions = useMemo(() => expandLoops(activeQuestions, reponses), [activeQuestions, reponses]);

  const spReponses = toSpReponses(reponses);

  // Evaluate visibility with conditions + consequences
  const visibleExpanded = useMemo(() => {
    const conditionVisible = expandedQuestions.filter((eq) =>
      evaluateQuestionVisibility(eq.question, spReponses, {})
    );
    return conditionVisible.filter((eq) => visibleQuestionIds.has(eq.question.id));
  }, [expandedQuestions, spReponses, visibleQuestionIds]);

  // Initialize visible set with all active questions
  useMemo(() => {
    if (visibleQuestionIds.size === 0) {
      setVisibleQuestionIds(new Set(activeQuestions.map((q) => q.id)));
    }
  }, [activeQuestions, visibleQuestionIds.size]);

  const answeredCount = visibleExpanded.length > 0
    ? visibleExpanded.filter((eq) => {
        const v = reponses[eq.instanceId];
        return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
      }).length
    : 0;

  const requiredCount = visibleExpanded.length > 0
    ? visibleExpanded.filter((eq) => eq.question.obligatoire).length
    : 0;

  const answeredRequired = visibleExpanded.length > 0
    ? visibleExpanded.filter((eq) => {
        if (!eq.question.obligatoire) return true;
        const v = reponses[eq.instanceId];
        return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
      }).length
    : 0;

  const allRequiredAnswered = answeredRequired === requiredCount;

  const setReponse = (instanceId: string, value: string | string[] | boolean) => {
    const questionId = instanceId.split('--')[0];
    setReponses((prev) => {
      const next = { ...prev, [instanceId]: value };
      // Apply consequences after answering
      const newVisible = applyConsequences(activeQuestions, next, questionId, visibleQuestionIds);
      setVisibleQuestionIds(newVisible);
      setLastAnsweredId(questionId);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <Play className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Simulation du workflow</h2>
              <p className="text-xs text-gray-400">{templateNom}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReponses({})}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser
            </button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="px-5 py-2.5 border-b border-gray-50 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{answeredCount} / {visibleExpanded.length} questions répondues</span>
            <span className={allRequiredAnswered ? 'text-green-600 font-medium' : 'text-orange-500'}>
              {allRequiredAnswered ? '✓ Toutes les questions obligatoires remplies' : `${requiredCount - answeredRequired} obligatoire(s) manquante(s)`}
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: visibleExpanded.length ? `${(answeredCount / visibleExpanded.length) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
          {visibleExpanded.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">Aucune question active à afficher.</p>
            </div>
          )}

          {visibleExpanded.map((eq, i) => {
            const isAnswered = (() => {
              const v = reponses[eq.instanceId];
              return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
            })();

            const isLoopIteration = eq.iterationIndex > 0 || eq.label;

            return (
              <div
                key={eq.instanceId}
                className={`rounded-xl border p-4 transition-all ${
                  isAnswered ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'
                } ${isLoopIteration ? 'ml-4' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                    isAnswered ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isAnswered ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{eq.question.libelle}</p>
                      {isLoopIteration && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                          {eq.label}
                        </span>
                      )}
                      {eq.question.obligatoire && (
                        <span className="text-red-500 text-sm">*</span>
                      )}
                      {(eq.question.groupes_conditions?.length ?? 0) > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 border border-yellow-100">
                          conditionnel
                        </span>
                      )}
                      {(eq.question.consequences?.filter((c) => c.type !== 'renseigner_variable').length ?? 0) > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                          conséquence(s)
                        </span>
                      )}
                    </div>
                    {eq.question.description && (
                      <p className="text-xs text-gray-400 mb-2.5">{eq.question.description}</p>
                    )}
                    <QuestionInput
                      question={eq.question}
                      value={reponses[eq.instanceId]}
                      onChange={(v) => setReponse(eq.instanceId, v)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {activeQuestions.length - visibleExpanded.length > 0
              ? `${activeQuestions.length - visibleExpanded.length} question(s) masquée(s) par les conditions/conséquences`
              : 'Toutes les questions actives sont visibles'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(toSpReponses(reponses), null, 2));
            }}>
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copier réponses
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
