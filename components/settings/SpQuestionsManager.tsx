'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion } from '@/types';
import { SpQuestionBuilder } from './SpQuestionBuilder';

interface Template { id: string; nom: string; file_type: string; }

interface Props {
  templates: Template[];
}

export function SpQuestionsManager({ templates }: Props) {
  const wordTemplates = templates.filter((t) => t.file_type === 'word');
  const [expanded, setExpanded] = useState<string | null>(wordTemplates[0]?.id ?? null);
  const [questionsByTemplate, setQuestionsByTemplate] = useState<Record<string, SpQuestion[]>>({});
  const [buildingForTemplate, setBuildingForTemplate] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{ templateId: string; question: SpQuestion } | null>(null);

  useEffect(() => {
    for (const t of wordTemplates) {
      fetch(`/api/templates/${t.id}/sp-questions`)
        .then((r) => r.json())
        .then((d) => {
          setQuestionsByTemplate((prev) => ({
            ...prev,
            [t.id]: (d.questions ?? []).sort((a: SpQuestion, b: SpQuestion) => a.ordre - b.ordre),
          }));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteQuestion = async (templateId: string, qid: string) => {
    if (!confirm('Supprimer cette question ?')) return;
    await fetch(`/api/templates/${templateId}/sp-questions/${qid}`, { method: 'DELETE' });
    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).filter((q) => q.id !== qid),
    }));
  };

  const toggleActive = async (templateId: string, q: SpQuestion) => {
    const updated = { ...q, actif: !q.actif };
    await fetch(`/api/templates/${templateId}/sp-questions/${q.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((existing) => existing.id === q.id ? updated : existing),
    }));
  };

  if (wordTemplates.length === 0) {
    return <p className="text-gray-500 text-sm">Aucun template Word disponible. Créez d&apos;abord un template Word.</p>;
  }

  return (
    <div className="space-y-4">
      {wordTemplates.map((t) => {
        const questions = questionsByTemplate[t.id] ?? [];
        const isExpanded = expanded === t.id;

        return (
          <div key={t.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              onClick={() => setExpanded(isExpanded ? null : t.id)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-medium text-gray-900">{t.nom}</span>
                <span className="text-xs text-gray-500">({questions.length} question{questions.length !== 1 ? 's' : ''})</span>
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-gray-500">Aucune question configurée pour ce template.</p>
                )}
                {questions.map((q) => (
                  <div key={q.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg bg-white">
                    <button onClick={() => toggleActive(t.id, q)} className="mt-0.5 shrink-0">
                      {q.actif
                        ? <ToggleRight className="w-5 h-5 text-green-600" />
                        : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{q.libelle}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{q.source}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{q.affichage}</span>
                        {q.obligatoire && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">Obligatoire</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setEditingQuestion({ templateId: t.id, question: q })} className="h-7 w-7 p-0">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteQuestion(t.id, q.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBuildingForTemplate(t.id)}
                  className="w-full mt-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une question
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Modal ajout */}
      {buildingForTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Nouvelle question SP</h2>
            <SpQuestionBuilder
              templateId={buildingForTemplate}
              onSaved={(q) => {
                setQuestionsByTemplate((prev) => ({
                  ...prev,
                  [buildingForTemplate]: [...(prev[buildingForTemplate] ?? []), q],
                }));
                setBuildingForTemplate(null);
              }}
              onCancel={() => setBuildingForTemplate(null)}
            />
          </div>
        </div>
      )}

      {/* Modal édition */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Modifier la question</h2>
            <SpQuestionBuilder
              templateId={editingQuestion.templateId}
              initial={editingQuestion.question}
              onSaved={(q) => {
                setQuestionsByTemplate((prev) => ({
                  ...prev,
                  [editingQuestion.templateId]: (prev[editingQuestion.templateId] ?? []).map((existing) =>
                    existing.id === q.id ? q : existing
                  ),
                }));
                setEditingQuestion(null);
              }}
              onCancel={() => setEditingQuestion(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
