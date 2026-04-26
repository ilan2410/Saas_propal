'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion } from '@/types';
import { SpQuestionBuilder } from './SpQuestionBuilder';

interface Template { id: string; nom: string; file_type: string; }

interface Props {
  templates: Template[];
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-normal text-center shadow-lg">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <Tooltip text={tooltip}>
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
    </Tooltip>
  );
}

// ── Labels lisibles ───────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  catalogue: 'Catalogue',
  sa: 'Données SA',
  aucune: 'Saisie libre',
  catalogue_et_sa: 'Catalogue + SA',
};

const SOURCE_TOOLTIPS: Record<string, string> = {
  catalogue: "Les choix proposés proviennent de votre catalogue produits.",
  sa: "La question utilise les données extraites du document SA (opérateur, lignes, montant…).",
  aucune: "L'utilisateur saisit une réponse libre, sans pré-remplissage.",
  catalogue_et_sa: "Combine le catalogue et les données SA pour proposer des choix contextuels.",
};

const AFFICHAGE_LABELS: Record<string, string> = {
  boutons_choix_unique: 'Choix unique',
  boutons_choix_multiple: 'Choix multiple',
  liste_deroulante: 'Liste déroulante',
  oui_non: 'Oui / Non',
  confirmation_sa: 'Confirmation SA',
  edition_sa: 'Édition SA',
  texte_court: 'Texte court',
  texte_long: 'Texte long',
  nombre: 'Nombre',
  date: 'Date',
  choix_liste_manuelle: 'Liste manuelle',
  adresse_complete: 'Adresse',
};

const AFFICHAGE_TOOLTIPS: Record<string, string> = {
  boutons_choix_unique: "L'utilisateur sélectionne un seul choix parmi des boutons.",
  boutons_choix_multiple: "L'utilisateur peut sélectionner plusieurs choix.",
  liste_deroulante: "Menu déroulant compact pour choisir parmi les options.",
  oui_non: "Deux boutons Oui / Non.",
  confirmation_sa: "Affiche la valeur SA extraite et demande confirmation (lecture seule).",
  edition_sa: "Affiche la valeur SA et permet à l'utilisateur de la modifier.",
  texte_court: "Champ texte sur une ligne.",
  texte_long: "Zone de texte multi-lignes.",
  nombre: "Champ numérique.",
  date: "Sélecteur de date.",
  choix_liste_manuelle: "Choix dans une liste définie manuellement.",
  adresse_complete: "Formulaire d'adresse structuré (rue, CP, ville, pays).",
};

// ── Composant ─────────────────────────────────────────────────────────────────
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
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">Aucun template Word disponible.</p>
        <p className="text-xs mt-1 text-gray-400">Créez d&apos;abord un template Word dans l&apos;onglet Templates pour configurer des questions SP.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explication générale */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-medium">Comment fonctionnent les questions SP ?</p>
          <p className="mt-0.5 text-blue-700">
            Ces questions sont posées à l&apos;utilisateur avant la génération de la Situation Proposée. Les réponses guident l&apos;IA et alimentent les variables <code className="bg-blue-100 px-1 rounded">{'{{sp_...}}'}</code> de votre template Word.
          </p>
        </div>
      </div>

      {wordTemplates.map((t) => {
        const questions = questionsByTemplate[t.id] ?? [];
        const isExpanded = expanded === t.id;
        const activeCount = questions.filter((q) => q.actif).length;

        return (
          <div key={t.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* En-tête template */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              onClick={() => setExpanded(isExpanded ? null : t.id)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <span className="font-medium text-gray-900">{t.nom}</span>
                <Tooltip text={`${questions.length} question${questions.length !== 1 ? 's' : ''} au total, ${activeCount} active${activeCount !== 1 ? 's' : ''}`}>
                  <span className="text-xs text-gray-500 cursor-help">
                    ({activeCount}/{questions.length} active{activeCount !== 1 ? 's' : ''})
                  </span>
                </Tooltip>
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    Aucune question configurée. Cliquez sur &ldquo;Ajouter une question&rdquo; pour commencer.
                  </p>
                )}

                {questions.map((q) => (
                  <div key={q.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg bg-white hover:border-gray-200 transition-colors">
                    {/* Toggle actif */}
                    <Tooltip text={q.actif
                      ? "Question active — elle s'affiche lors de la génération SP. Cliquez pour désactiver."
                      : "Question désactivée — elle ne s'affiche pas. Cliquez pour activer."
                    }>
                      <button onClick={() => toggleActive(t.id, q)} className="mt-0.5 shrink-0">
                        {q.actif
                          ? <ToggleRight className="w-5 h-5 text-green-600" />
                          : <ToggleLeft className="w-5 h-5 text-gray-300" />
                        }
                      </button>
                    </Tooltip>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${q.actif ? 'text-gray-900' : 'text-gray-400'}`}>
                        {q.libelle}
                      </p>
                      {q.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{q.description}</p>
                      )}
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {/* Badge source */}
                        <Tooltip text={SOURCE_TOOLTIPS[q.source] ?? q.source}>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 cursor-help">
                            {SOURCE_LABELS[q.source] ?? q.source}
                          </span>
                        </Tooltip>

                        {/* Badge affichage */}
                        <Tooltip text={AFFICHAGE_TOOLTIPS[q.affichage] ?? q.affichage}>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 cursor-help">
                            {AFFICHAGE_LABELS[q.affichage] ?? q.affichage}
                          </span>
                        </Tooltip>

                        {/* Badge obligatoire */}
                        {q.obligatoire && (
                          <Tooltip text="Cette question est obligatoire — l'utilisateur devra y répondre avant de générer la SP.">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 cursor-help">
                              Obligatoire
                            </span>
                          </Tooltip>
                        )}

                        {/* Badge priorité haute */}
                        {q.priorite_ia === 'haute' && (
                          <Tooltip text="Priorité haute — l'IA appliquera cette réponse sans exception lors de la génération SP.">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 cursor-help">
                              🔒 Priorité haute
                            </span>
                          </Tooltip>
                        )}

                        {/* Badge variable cible */}
                        {q.consequences?.[0]?.variable_cible && (
                          <Tooltip text={`La réponse alimentera la variable {{${q.consequences[0].variable_cible}}} dans le template Word.`}>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-mono cursor-help">
                              {`{{${q.consequences[0].variable_cible}}}`}
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Tooltip text="Modifier cette question">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingQuestion({ templateId: t.id, question: q })}
                          className="h-7 w-7 p-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </Tooltip>
                      <Tooltip text="Supprimer définitivement cette question">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteQuestion(t.id, q.id)}
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                ))}

                <Tooltip text="Ouvre le constructeur de questions pour créer une nouvelle question SP pour ce template.">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBuildingForTemplate(t.id)}
                    className="w-full mt-2"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une question
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
        );
      })}

      {/* Modal ajout */}
      {buildingForTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">Nouvelle question SP</h2>
              <InfoIcon tooltip="Une question SP est posée à l'utilisateur avant la génération de la Situation Proposée. Sa réponse guide l'IA et peut alimenter une variable dans votre template Word." />
            </div>
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
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
