'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, Copy, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, HelpCircle, Sparkles, Play, X, GripVertical, Download, Upload, Package, FileText, PenLine, Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpCondition, SpVariableCustom } from '@/types';
import { SpQuestionBuilder } from './SpQuestionBuilder';
import { SpAiGeneratorModal } from './SpAiGeneratorModal';
import { SpWorkflowSimulatorModal } from './SpWorkflowSimulatorModal';

interface Template { id: string; nom: string; file_type: string; }
type SpAiWorkflowMode = 'create' | 'modify' | 'append';
const SHOW_SP_AI_APPEND_EDIT = false;

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
  aucune: 'Saisie libre',
};

const SOURCE_TOOLTIPS: Record<string, string> = {
  catalogue: "Les choix proposés proviennent de votre catalogue produits.",
  aucune: "L'utilisateur saisit une réponse libre, sans pré-remplissage.",
};

const AFFICHAGE_LABELS: Record<string, string> = {
  boutons_choix_unique: 'Choix unique',
  boutons_choix_multiple: 'Choix multiple',
  liste_deroulante: 'Liste déroulante choix unique',
  liste_deroulante_choix_multiple: 'Liste déroulante choix multiple',
  oui_non: 'Oui / Non',
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
  liste_deroulante: "Menu déroulant compact pour choisir une seule option.",
  liste_deroulante_choix_multiple: "Menu déroulant compact pour choisir plusieurs options.",
  oui_non: "Deux boutons Oui / Non.",
  texte_court: "Champ texte sur une ligne.",
  texte_long: "Zone de texte multi-lignes.",
  nombre: "Champ numérique.",
  date: "Sélecteur de date.",
  choix_liste_manuelle: "Choix dans une liste définie manuellement.",
  adresse_complete: "Formulaire d'adresse structuré (rue, CP, ville, pays).",
};

// ── Logique arbre de dépendances ──────────────────────────────────────────────
interface TreeItem {
  q: SpQuestion;
  depth: number;
  conditionSummary: string;
  isLastSibling: boolean;
}

function getParentId(treeItems: TreeItem[], idx: number): string | null {
  const depth = treeItems[idx].depth;
  if (depth === 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (treeItems[i].depth === depth - 1) return treeItems[i].q.id;
  }
  return null;
}

function reorderInTree(
  treeItems: TreeItem[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after'
): string[] {
  const draggedIdx = treeItems.findIndex((item) => item.q.id === draggedId);
  if (draggedIdx === -1) return treeItems.map((item) => item.q.id);
  const draggedDepth = treeItems[draggedIdx].depth;
  let blockEnd = draggedIdx + 1;
  while (blockEnd < treeItems.length && treeItems[blockEnd].depth > draggedDepth) blockEnd++;
  const block = treeItems.slice(draggedIdx, blockEnd);
  const remaining = [...treeItems.slice(0, draggedIdx), ...treeItems.slice(blockEnd)];
  const targetIdx = remaining.findIndex((item) => item.q.id === targetId);
  if (targetIdx === -1) return treeItems.map((item) => item.q.id);
  let insertAt: number;
  if (position === 'before') {
    insertAt = targetIdx;
  } else {
    let targetEnd = targetIdx + 1;
    while (targetEnd < remaining.length && remaining[targetEnd].depth > remaining[targetIdx].depth) targetEnd++;
    insertAt = targetEnd;
  }
  return [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)].map((i) => i.q.id);
}

function getConditionSummary(q: SpQuestion, allQuestions: SpQuestion[]): string {
  const idToQ = new Map(allQuestions.map((x) => [x.id, x]));
  const conds: SpCondition[] = (q.groupes_conditions ?? []).flatMap((g) => g.conditions)
    .filter((c) => c.source === 'reponse_question');

  if (conds.length === 0) return '';

  const first = conds[0];
  const parent = first.question_id ? idToQ.get(first.question_id) : undefined;
  const parentLabel = parent
    ? `"${parent.libelle.length > 22 ? parent.libelle.slice(0, 22) + '…' : parent.libelle}"`
    : (first.question_id ?? '?');

  const opLabel =
    first.operateur === 'egal' ? `= ${first.valeur ?? ''}`
    : first.operateur === 'different' ? `≠ ${first.valeur ?? ''}`
    : first.operateur === 'non_vide' ? 'est renseigné'
    : first.operateur === 'vide' ? 'est vide'
    : first.operateur === 'contient' ? `contient "${first.valeur ?? ''}"`
    : first.operateur;

  const extra = conds.length > 1 ? ` +${conds.length - 1} condition${conds.length > 2 ? 's' : ''}` : '';

  return `si ${parentLabel} ${opLabel}${extra}`;
}

function buildTreeOrder(questions: SpQuestion[], niveauOverrides: Record<string, 0 | 1> = {}): TreeItem[] {
  const idSet = new Set(questions.map((q) => q.id));
  return questions.map((q, _, arr) => {
    const hasQuestionCondition = (q.groupes_conditions ?? [])
      .flatMap((g) => g.conditions)
      .some((c) => c.source === 'reponse_question' && c.question_id && idSet.has(c.question_id));
    const depth: 0 | 1 = niveauOverrides[q.id] ?? (hasQuestionCondition ? 1 : 0);
    return {
      q,
      depth,
      conditionSummary: depth > 0 ? getConditionSummary(q, arr) : '',
      isLastSibling: true,
    };
  });
}

function generateUniqueVarKey(base: string, existing: Set<string>): string {
  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (existing.has(candidate)) { suffix++; candidate = `${base}_${suffix}`; }
  return candidate;
}

function getQuestionsWithChildren(questions: SpQuestion[]): Set<string> {
  const idSet = new Set(questions.map((q) => q.id));
  const result = new Set<string>();
  for (const q of questions) {
    const parentId = (q.groupes_conditions ?? [])
      .flatMap((g) => g.conditions)
      .find((c) => c.source === 'reponse_question' && c.question_id && idSet.has(c.question_id))
      ?.question_id;
    if (parentId) result.add(parentId);
  }
  return result;
}

function collectDescendantQuestionIds(questions: SpQuestion[], rootId: string): Set<string> {
  const idsToDelete = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const question of questions) {
      if (idsToDelete.has(question.id)) continue;
      const dependsOnDeletedQuestion = (question.groupes_conditions ?? []).some((group) =>
        group.conditions.some(
          (condition) => condition.source === 'reponse_question'
            && !!condition.question_id
            && idsToDelete.has(condition.question_id),
        ),
      );
      if (dependsOnDeletedQuestion) {
        idsToDelete.add(question.id);
        changed = true;
      }
    }
  }

  return idsToDelete;
}

// ── Helpers lisibilité conditions / conséquences ──────────────────────────────

function operatorToText(op: string, valeur?: string | number): string {
  switch (op) {
    case 'egal': return `= "${valeur ?? ''}"`;
    case 'different': return `≠ "${valeur ?? ''}"`;
    case 'non_vide': return 'est renseigné';
    case 'vide': return 'est vide';
    case 'contient': return `contient "${valeur ?? ''}"`;
    case 'ne_contient_pas': return `ne contient pas "${valeur ?? ''}"`;
    case 'superieur': return `> ${valeur ?? ''}`;
    case 'inferieur': return `< ${valeur ?? ''}`;
    case 'plus_de_elements': return `> ${valeur ?? ''} éléments`;
    case 'moins_de_elements': return `< ${valeur ?? ''} éléments`;
    case 'element_ou': return `contient "${valeur ?? ''}"`;
    default: return op;
  }
}

function getReadableConditions(q: SpQuestion, allQuestions: SpQuestion[]): string {
  if (!q.groupes_conditions?.length) return '';

  const idToLibelle = new Map(allQuestions.map((x) => [x.id, x.libelle]));

  const groupTexts = q.groupes_conditions.map((group) => {
    const condTexts = group.conditions.map((cond) => {
      if (cond.source === 'reponse_question' && cond.question_id) {
        const libelle = idToLibelle.get(cond.question_id);
        const label = libelle
          ? (libelle.length > 30 ? libelle.slice(0, 30) + '…' : libelle)
          : 'Q?';
        return `[${label}] ${operatorToText(cond.operateur, cond.valeur)}`;
      }
      if (cond.source === 'sa' && cond.variable_sa) {
        const varLabel = cond.variable_sa.split('.').pop() ?? cond.variable_sa;
        return `SA:${varLabel} ${operatorToText(cond.operateur, cond.valeur)}`;
      }
      return '';
    }).filter(Boolean);

    const logic = group.logique_groupe ?? 'ET';
    return condTexts.join(` ${logic} `);
  });

  const rootLogic = q.logique_declencheur ?? 'ET';
  return groupTexts.filter(Boolean).join(` ${rootLogic} `);
}

function getReadableConsequences(q: SpQuestion, allQuestions: SpQuestion[]): string {
  if (!q.consequences?.length) return '';

  const idToLibelle = new Map(allQuestions.map((x) => [x.id, x.libelle]));

  const qRef = (id?: string) => {
    if (!id) return 'Q?';
    const lib = idToLibelle.get(id);
    if (!lib) return 'Q?';
    return lib.length > 25 ? lib.slice(0, 25) + '…' : lib;
  };

  const parts = q.consequences.map((c) => {
    switch (c.type) {
      case 'renseigner_variable':
        return c.variable_cible ? `Stocke {{${c.variable_cible}}}` : null;
      case 'afficher_question': {
        const trigger = c.valeur_declencheur ? ` si "${c.valeur_declencheur}"` : '';
        return `Affiche "${qRef(c.question_id)}"${trigger}`;
      }
      case 'masquer_question': {
        const trigger = c.valeur_declencheur ? ` si "${c.valeur_declencheur}"` : '';
        return `Masque "${qRef(c.question_id)}"${trigger}`;
      }
      case 'filtrer_question': {
        return `Filtre "${qRef(c.question_id)}"`;
      }
      case 'aller_question': {
        const trigger = c.valeur_declencheur ? ` si "${c.valeur_declencheur}"` : '';
        return `Saute à "${qRef(c.question_id)}"${trigger}`;
      }
      case 'afficher_message': {
        const trigger = c.valeur_declencheur ? ` si "${c.valeur_declencheur}"` : '';
        return `Message${trigger}`;
      }
      default:
        return null;
    }
  }).filter((x): x is string => x !== null);

  return parts.join(' · ');
}

// ── Groupement boucle pour le rendu ───────────────────────────────────────────

interface RenderGroup {
  type: 'regular' | 'boucle_container';
  boucleId?: string;
  boucleLeader?: SpQuestion;
  items: Array<{ treeItem: TreeItem; idx: number }>;
}

function getVisibleItemIndices(treeItems: TreeItem[], _collapsedParents: Set<string>): boolean[] {
  return new Array(treeItems.length).fill(true);
}

function groupTreeItemsForRender(items: Array<{ treeItem: TreeItem; idx: number }>): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let i = 0;

  while (i < items.length) {
    const { treeItem: item, idx } = items[i];
    if (item.q.groupe_boucle_id) {
      const boucleId = item.q.groupe_boucle_id;
      const boucleItems: Array<{ treeItem: TreeItem; idx: number }> = [];
      let leader: SpQuestion | undefined;

      while (i < items.length && items[i].treeItem.q.groupe_boucle_id === boucleId) {
        if (items[i].treeItem.q.boucle) leader = items[i].treeItem.q;
        boucleItems.push(items[i]);
        i++;
      }

      groups.push({
        type: 'boucle_container',
        boucleId,
        boucleLeader: leader ?? boucleItems[0]?.treeItem.q,
        items: boucleItems,
      });
    } else {
      groups.push({ type: 'regular', items: [{ treeItem: item, idx }] });
      i++;
    }
  }

  return groups;
}

function getBoucleHeaderText(leader: SpQuestion, allQuestions: SpQuestion[]): string {
  const boucle = leader.boucle;
  if (!boucle) return 'Répété';
  if (boucle.nombre_fixe != null) return `Répété ${boucle.nombre_fixe} fois`;
  if (boucle.source_nombre_question_id) {
    const srcQ = allQuestions.find((q) => q.id === boucle.source_nombre_question_id);
    const qRef = srcQ ? `Q${srcQ.ordre}` : 'Q?';
    return `Répété selon [${qRef}]`;
  }
  if (boucle.source_sa_array) {
    const arrayName = boucle.source_sa_array.split('.').pop() ?? boucle.source_sa_array;
    return `Répété selon SA (${arrayName})`;
  }
  return 'Répété';
}

// ── Icônes source ─────────────────────────────────────────────────────────────
const SOURCE_ICONS: Record<string, React.ElementType> = {
  catalogue: Package,
  aucune: PenLine,
};

// ── Carte question ────────────────────────────────────────────────────────────
function QuestionCard({
  q,
  questionNumber,
  allQuestions,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  onSimulateFrom,
  isParent = false,
  showDragHandle = false,
}: {
  q: SpQuestion;
  questionNumber: number;
  allQuestions: SpQuestion[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSimulateFrom: () => void;
  isParent?: boolean;
  showDragHandle?: boolean;
}) {
  const condText = getReadableConditions(q, allQuestions);
  const consText = getReadableConsequences(q, allQuestions);
  const SourceIcon = SOURCE_ICONS[q.source] ?? Package;

  return (
    <div className={`border rounded-lg bg-white transition-colors ${q.actif ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 opacity-60'}`}>
      {/* Zone 1 : Numéro + Toggle + Label + Actions */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        {showDragHandle && (
          <div className="mt-1 shrink-0 cursor-grab text-gray-300 hover:text-gray-500">
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        <span className="mt-0.5 shrink-0 inline-flex items-center justify-center font-mono text-xs font-semibold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 min-w-[2rem]">
          Q{questionNumber}
        </span>

        <Tooltip text={q.actif
          ? "Question active — elle s'affiche lors de la génération SP. Cliquez pour désactiver."
          : "Question désactivée — elle ne s'affiche pas. Cliquez pour activer."
        }>
          <button onClick={onToggle} className="mt-0.5 shrink-0">
            {q.actif
              ? <ToggleRight className="w-5 h-5 text-green-600" />
              : <ToggleLeft className="w-5 h-5 text-gray-300" />
            }
          </button>
        </Tooltip>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${q.actif ? 'text-gray-900' : 'text-gray-400'}`}>
            {q.libelle}
          </p>
          {q.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{q.description}</p>
          )}
        </div>

        <div className="flex gap-0.5 shrink-0">
          {isParent && (
            <Tooltip text="Simuler le workflow depuis cette question">
              <Button size="sm" variant="ghost" onClick={onSimulateFrom} className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50">
                <Play className="w-3 h-3" />
              </Button>
            </Tooltip>
          )}
          <Tooltip text="Modifier cette question">
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700">
              <Edit2 className="w-3 h-3" />
            </Button>
          </Tooltip>
          <Tooltip text="Dupliquer cette question (et ses enfants)">
            <Button size="sm" variant="ghost" onClick={onDuplicate} className="h-6 w-6 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50">
              <Copy className="w-3 h-3" />
            </Button>
          </Tooltip>
          <Tooltip text="Supprimer définitivement cette question">
            <Button size="sm" variant="ghost" onClick={onDelete} className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="w-3 h-3" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Zone 2 : Type / Source / badges */}
      <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5">
        <Tooltip text={SOURCE_TOOLTIPS[q.source] ?? q.source}>
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 cursor-help">
            <SourceIcon className="w-3 h-3" />
            {SOURCE_LABELS[q.source] ?? q.source}
          </span>
        </Tooltip>

        <Tooltip text={AFFICHAGE_TOOLTIPS[q.affichage] ?? q.affichage}>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 cursor-help">
            {AFFICHAGE_LABELS[q.affichage] ?? q.affichage}
          </span>
        </Tooltip>

        {q.obligatoire && (
          <Tooltip text="Cette question est obligatoire — l'utilisateur devra y répondre avant de générer la SP.">
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 cursor-help">
              Obligatoire
            </span>
          </Tooltip>
        )}

        {q.priorite_ia === 'haute' && (
          <Tooltip text="Priorité haute — l'IA appliquera cette réponse sans exception lors de la génération SP.">
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 cursor-help">
              🔒 Priorité haute
            </span>
          </Tooltip>
        )}

        {q.boucle && (
          <Tooltip text={`Définit le groupe de boucle "${q.groupe_boucle_id}" — contrôle le nombre d'itérations.`}>
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 cursor-help">
              Leader boucle
            </span>
          </Tooltip>
        )}

        {q.affichage === 'choix_liste_manuelle' && (q.options_manuelles?.length ?? 0) > 0 && (
          <span className="text-xs text-gray-400 italic">
            {q.options_manuelles!.join(' · ')}
          </span>
        )}
      </div>

      {/* Zone 3 : Conditions */}
      {condText && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
          <span className="text-xs font-semibold text-amber-700 shrink-0">S&apos;affiche si :</span>
          <span className="text-xs text-amber-800 leading-snug">{condText}</span>
        </div>
      )}

      {/* Zone 4 : Conséquences */}
      {consText && (
        <div className="mx-3 mb-2.5 flex items-start gap-1.5 bg-indigo-50 border border-indigo-100 rounded-md px-2.5 py-1.5">
          <span className="text-xs font-semibold text-indigo-700 shrink-0">Effets :</span>
          <span className="text-xs text-indigo-800 leading-snug">{consText}</span>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export function SpQuestionsManager({ templates }: Props) {
  const wordTemplates = templates.filter((t) => t.file_type === 'word');
  const [expanded, setExpanded] = useState<string | null>(wordTemplates[0]?.id ?? null);
  const [questionsByTemplate, setQuestionsByTemplate] = useState<Record<string, SpQuestion[]>>({});
  const [buildingForTemplate, setBuildingForTemplate] = useState<string | null>(null);
  const [builderQuestionTitle, setBuilderQuestionTitle] = useState('');
  const [aiGeneratingForTemplate, setAiGeneratingForTemplate] = useState<{ templateId: string; mode: SpAiWorkflowMode } | null>(null);
  const [simulatingForTemplate, setSimulatingForTemplate] = useState<{ templateId: string; startFromQuestionId?: string } | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{ templateId: string; question: SpQuestion } | null>(null);
  const [niveauOverrides, setNiveauOverrides] = useState<Record<string, 0 | 1>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('sp-question-niveaux') ?? '{}'); } catch { return {}; }
  });
  const [draggingInfo, setDraggingInfo] = useState<{
    qId: string; templateId: string;
  } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    templateId: string; qId: string; position: 'before' | 'after';
  } | null>(null);
  const [dragHint, setDragHint] = useState<'indent' | 'outdent' | null>(null);
  const dragStartX = useRef(0);
  const pendingDragId = useRef<string | null>(null);

  const changeNiveau = (qId: string, niveau: 0 | 1) => {
    setNiveauOverrides((prev) => {
      const next = { ...prev, [qId]: niveau };
      try { localStorage.setItem('sp-question-niveaux', JSON.stringify(next)); } catch {}
      return next;
    });
  };

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
    const templateQuestions = questionsByTemplate[templateId] ?? [];
    const idsToDelete = collectDescendantQuestionIds(templateQuestions, qid);
    const descendantCount = idsToDelete.size - 1;
    const confirmationMessage = descendantCount > 0
      ? `Supprimer cette question et ses ${descendantCount} question${descendantCount > 1 ? 's' : ''} enfant${descendantCount > 1 ? 's' : ''} ?`
      : 'Supprimer cette question ?';
    if (!confirm(confirmationMessage)) return;

    await fetch(`/api/templates/${templateId}/sp-questions/${qid}`, { method: 'DELETE' });
    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).filter((q) => !idsToDelete.has(q.id)),
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

  const duplicateQuestion = async (templateId: string, questionId: string) => {
    const questions = questionsByTemplate[templateId] ?? [];
    const treeItems = buildTreeOrder(questions);

    const startIdx = treeItems.findIndex((item) => item.q.id === questionId);
    if (startIdx === -1) return;
    const startDepth = treeItems[startIdx].depth;
    let endIdx = startIdx + 1;
    while (endIdx < treeItems.length && treeItems[endIdx].depth > startDepth) endIdx++;
    const questionsToClone = treeItems.slice(startIdx, endIdx).map((item) => item.q);

    const varRes = await fetch(`/api/templates/${templateId}/sp-variables`);
    const { standard, custom } = await varRes.json();
    const allVarKeys = new Set<string>([
      ...(standard as string[]),
      ...(custom as SpVariableCustom[]).map((v) => v.key),
      ...questions.flatMap((q) => q.consequences?.filter((c) => c.variable_cible).map((c) => c.variable_cible!) ?? []),
    ]);
    const customVarMap = new Map<string, SpVariableCustom>(
      (custom as SpVariableCustom[]).map((v) => [v.key, v])
    );

    const idMap = new Map<string, string>();
    const varMap = new Map<string, string>();

    for (const q of questionsToClone) {
      idMap.set(q.id, crypto.randomUUID());
      for (const c of q.consequences ?? []) {
        if (c.type === 'renseigner_variable' && c.variable_cible && !varMap.has(c.variable_cible)) {
          const newKey = generateUniqueVarKey(c.variable_cible, allVarKeys);
          allVarKeys.add(newKey);
          varMap.set(c.variable_cible, newKey);
        }
      }
    }

    for (const [oldKey, newKey] of varMap) {
      const src = customVarMap.get(oldKey);
      await fetch(`/api/templates/${templateId}/sp-variables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey,
          label: src ? `${src.label} (copie)` : newKey,
          description: src?.description ?? '',
          type: 'string',
        }),
      });
    }

    const newQuestions: SpQuestion[] = questionsToClone.map((q) => ({
      ...q,
      id: idMap.get(q.id)!,
      groupes_conditions: q.groupes_conditions?.map((group) => ({
        ...group,
        conditions: group.conditions.map((cond) => ({
          ...cond,
          question_id: cond.question_id && idMap.has(cond.question_id)
            ? idMap.get(cond.question_id)!
            : cond.question_id,
        })),
      })),
      consequences: q.consequences?.map((c) => ({
        ...c,
        question_id: c.question_id && idMap.has(c.question_id)
          ? idMap.get(c.question_id)!
          : c.question_id,
        variable_cible: c.variable_cible && varMap.has(c.variable_cible)
          ? varMap.get(c.variable_cible)!
          : c.variable_cible,
      })),
    }));

    const created: SpQuestion[] = [];
    for (const nq of newQuestions) {
      const res = await fetch(`/api/templates/${templateId}/sp-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nq),
      });
      const { question } = await res.json();
      created.push(question);
    }

    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] ?? []), ...created].sort((a, b) => a.ordre - b.ordre),
    }));
  };

  const deleteAllQuestions = async (templateId: string, templateNom: string) => {
    if (!confirm(`Supprimer tout le workflow de "${templateNom}" ?\n\nCette action supprimera définitivement toutes les questions SP de ce template. Cette action est irréversible.`)) return;
    await fetch(`/api/templates/${templateId}/sp-questions/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [] }),
    });
    setQuestionsByTemplate((prev) => ({ ...prev, [templateId]: [] }));
  };

  const exportWorkflow = (templateId: string, templateNom: string) => {
    const questions = (questionsByTemplate[templateId] ?? []).sort((a, b) => a.ordre - b.ordre);
    const payload = {
      type: 'sp-workflow-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      template: { id: templateId, nom: templateNom },
      questions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = templateNom.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'workflow';
    link.href = url;
    link.download = `sp-workflow-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importWorkflow = (templateId: string, templateNom: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const parsed = JSON.parse(content) as { questions?: SpQuestion[] } | SpQuestion[];
        const questions = Array.isArray(parsed) ? parsed : parsed.questions;

        if (!Array.isArray(questions)) {
          alert('Fichier invalide : aucune liste de questions trouvée.');
          return;
        }

        if (!confirm(`Importer ce workflow dans "${templateNom}" ?\n\nCela remplacera les ${questionsByTemplate[templateId]?.length ?? 0} question(s) actuelles par ${questions.length} question(s) importée(s).`)) return;

        const res = await fetch(`/api/templates/${templateId}/sp-questions/replace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions }),
        });
        const data = await res.json() as { questions?: SpQuestion[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'import");

        setQuestionsByTemplate((prev) => ({
          ...prev,
          [templateId]: (data.questions ?? []).sort((a, b) => a.ordre - b.ordre),
        }));
      } catch (error) {
        alert(error instanceof Error ? error.message : "Impossible d'importer ce workflow.");
      }
    };
    input.click();
  };

  const handleReorder = async (
    treeItems: TreeItem[],
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
    templateId: string
  ) => {
    const newOrderedIds = reorderInTree(treeItems, draggedId, targetId, position);
    setQuestionsByTemplate((prev) => {
      const current = prev[templateId] ?? [];
      const idToQ = new Map(current.map((q) => [q.id, q]));
      const reordered = newOrderedIds
        .map((id, i) => { const q = idToQ.get(id); return q ? { ...q, ordre: i + 1 } : null; })
        .filter(Boolean) as SpQuestion[];
      return { ...prev, [templateId]: reordered };
    });
    await fetch(`/api/templates/${templateId}/sp-questions/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newOrderedIds }),
    });
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
      <div className="flex items-start gap-3">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 flex-1">
          <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-medium">Comment fonctionnent les questions SP ?</p>
            <p className="mt-0.5 text-blue-700">
              Ces questions sont posées à l&apos;utilisateur avant la génération de la Situation Proposée. Les réponses guident l&apos;IA et alimentent les variables <code className="bg-blue-100 px-1 rounded">{'{{sp_...}}'}</code> de votre template Word.
            </p>
          </div>
        </div>
      </div>

      {wordTemplates.map((t) => {
        const questions = questionsByTemplate[t.id] ?? [];
        const isExpanded = expanded === t.id;
        const activeCount = questions.filter((q) => q.actif).length;
        const conditionalCount = questions.filter((q) => (q.groupes_conditions?.length ?? 0) > 0).length;
        const treeItems = buildTreeOrder(questions, niveauOverrides);
        const visibleItemsWithIdx = treeItems.map((treeItem, i) => ({ treeItem, idx: i }));
        const renderGroups = groupTreeItemsForRender(visibleItemsWithIdx);

        const LEVEL_THRESHOLD = 40;

        const renderItem = (q: SpQuestion, depth: number, _idx: number) => {
          const isDragging = draggingInfo?.qId === q.id;
          const isCompatibleTarget =
            draggingInfo !== null &&
            draggingInfo.qId !== q.id &&
            draggingInfo.templateId === t.id;
          const dropPos =
            dragOverInfo?.templateId === t.id && dragOverInfo?.qId === q.id
              ? dragOverInfo.position
              : null;

          return (
            <div
              key={q.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                dragStartX.current = e.clientX;
                pendingDragId.current = q.id;
                setDraggingInfo({ qId: q.id, templateId: t.id });
              }}
              onDrag={(e) => {
                if (e.clientX === 0) return;
                const dx = e.clientX - dragStartX.current;
                if (dx > LEVEL_THRESHOLD) setDragHint('indent');
                else if (dx < -LEVEL_THRESHOLD) setDragHint('outdent');
                else setDragHint(null);
              }}
              onDragOver={(e) => {
                if (!isCompatibleTarget) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                if (dragOverInfo?.qId !== q.id || dragOverInfo?.position !== position || dragOverInfo?.templateId !== t.id)
                  setDragOverInfo({ templateId: t.id, qId: q.id, position });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  if (dragOverInfo?.qId === q.id && dragOverInfo?.templateId === t.id) setDragOverInfo(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggingInfo || !isCompatibleTarget || !dragOverInfo) return;
                const dx = e.clientX - dragStartX.current;
                if (Math.abs(dx) <= LEVEL_THRESHOLD) {
                  handleReorder(treeItems, draggingInfo.qId, q.id, dragOverInfo.position, t.id);
                }
                setDragOverInfo(null);
              }}
              onDragEnd={(e) => {
                const dx = e.clientX - dragStartX.current;
                if (Math.abs(dx) > LEVEL_THRESHOLD && pendingDragId.current) {
                  changeNiveau(pendingDragId.current, dx > 0 ? 1 : 0);
                }
                pendingDragId.current = null;
                setDragHint(null);
                setDraggingInfo(null);
                setDragOverInfo(null);
              }}
              className={`relative transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
              style={{
                borderTop: dropPos === 'before' ? '2px solid #6366f1' : '2px solid transparent',
                borderBottom: dropPos === 'after' ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              {isDragging && dragHint && (
                <div className="absolute -top-6 left-8 z-10 flex items-center gap-1 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                  {dragHint === 'indent'
                    ? <><span>→</span><span>Sous-question</span></>
                    : <><span>←</span><span>Question principale</span></>
                  }
                </div>
              )}
              <div style={{ marginLeft: depth * 24 + 'px' }}>
                <QuestionCard
                  q={q}
                  questionNumber={q.ordre}
                  allQuestions={questions}
                  isParent={depth === 0}
                  onToggle={() => toggleActive(t.id, q)}
                  onEdit={() => setEditingQuestion({ templateId: t.id, question: q })}
                  onDelete={() => deleteQuestion(t.id, q.id)}
                  onDuplicate={() => duplicateQuestion(t.id, q.id)}
                  onSimulateFrom={() => setSimulatingForTemplate({ templateId: t.id, startFromQuestionId: q.id })}
                  showDragHandle
                />
              </div>
            </div>
          );
        };

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
                <Tooltip text={`${questions.length} question${questions.length !== 1 ? 's' : ''} au total, ${activeCount} active${activeCount !== 1 ? 's' : ''}${conditionalCount > 0 ? `, ${conditionalCount} conditionnelle${conditionalCount > 1 ? 's' : ''}` : ''}`}>
                  <span className="text-xs text-gray-500 cursor-help">
                    ({activeCount}/{questions.length} active{activeCount !== 1 ? 's' : ''})
                  </span>
                </Tooltip>
                {conditionalCount > 0 && (
                  <Tooltip text={`${conditionalCount} question${conditionalCount > 1 ? 's' : ''} conditionnel${conditionalCount > 1 ? 'les' : 'le'} — les conditions sont visibles directement sur chaque carte.`}>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 cursor-help">
                      {conditionalCount} conditionnelle{conditionalCount > 1 ? 's' : ''}
                    </span>
                  </Tooltip>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    Aucune question configurée. Cliquez sur &ldquo;Ajouter une question&rdquo; pour commencer.
                  </p>
                )}

                {/* ── Vue arbre ── */}
                <div className="space-y-1.5">
                  {renderGroups.map((group, gi) => {
                    if (group.type === 'boucle_container') {
                      return (
                        <div key={`boucle-${group.boucleId}-${gi}`} className="rounded-lg border border-teal-200 bg-teal-50/30 p-2">
                          <div className="flex items-center gap-1.5 px-1 pb-1.5 mb-1.5 border-b border-teal-200">
                            <RefreshCw className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="text-xs font-medium text-teal-700">
                              {getBoucleHeaderText(group.boucleLeader!, questions)} — groupe &quot;{group.boucleId}&quot;
                            </span>
                          </div>
                          <div className="space-y-1">
                            {group.items.map(({ treeItem: { q, depth }, idx }) => renderItem(q, depth, idx))}
                          </div>
                        </div>
                      );
                    }
                    const { treeItem: { q, depth }, idx } = group.items[0];
                    return renderItem(q, depth, idx);
                  })}
                </div>

                <div className="flex gap-2 mt-2">
                  <Tooltip text="Ouvre le constructeur de questions pour créer une nouvelle question SP pour ce template.">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBuilderQuestionTitle('');
                        setBuildingForTemplate(t.id);
                      }}
                      className="flex-1"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Ajouter
                    </Button>
                  </Tooltip>
                  <Tooltip text="Supprimer définitivement toutes les questions de ce workflow.">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteAllQuestions(t.id, t.nom)}
                      disabled={questions.length === 0}
                      className="border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Tout supprimer
                    </Button>
                  </Tooltip>
                  <Tooltip text="Télécharge une sauvegarde JSON complète de ce workflow.">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportWorkflow(t.id, t.nom)}
                      disabled={questions.length === 0}
                      className="border-sky-200 text-sky-700 hover:bg-sky-50 hover:border-sky-300 disabled:opacity-40"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Exporter
                    </Button>
                  </Tooltip>
                  <Tooltip text="Restaure un workflow depuis une sauvegarde JSON. Le workflow actuel sera remplacé après confirmation.">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => importWorkflow(t.id, t.nom)}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Importer
                    </Button>
                  </Tooltip>
                  {questions.length === 0 ? (
                    SHOW_SP_AI_APPEND_EDIT && (
                      <Tooltip text="Décris ton workflow en langage naturel et l'IA génère les questions SP automatiquement.">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAiGeneratingForTemplate({ templateId: t.id, mode: 'create' })}
                          className="flex-1 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Générer IA
                        </Button>
                      </Tooltip>
                    )
                  ) : (
                    <>
                      {SHOW_SP_AI_APPEND_EDIT && (
                        <>
                          <Tooltip text="Ajoute de nouvelles questions avec l'IA sans modifier le workflow existant.">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAiGeneratingForTemplate({ templateId: t.id, mode: 'append' })}
                              className="flex-1 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              Ajouter IA
                            </Button>
                          </Tooltip>
                          <Tooltip text="Modifie le workflow complet avec l'IA. Cette action remplacera le workflow après validation.">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAiGeneratingForTemplate({ templateId: t.id, mode: 'modify' })}
                              className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              Modifier IA
                            </Button>
                          </Tooltip>
                        </>
                      )}
                    </>
                  )}
                  <Tooltip text="Simule le formulaire de questions pour tester les conditions et la logique du workflow.">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSimulatingForTemplate({ templateId: t.id })}
                      disabled={questions.filter((q) => q.actif).length === 0}
                      className="flex-1 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 disabled:opacity-40"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Simuler
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Modal ajout */}
      {buildingForTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Nouvelle question SP</h2>
                  <InfoIcon tooltip="Une question SP est posée à l'utilisateur avant la génération de la Situation Proposée. Sa réponse guide l'IA et peut alimenter une variable dans votre template Word." />
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {builderQuestionTitle || 'Titre de la question a definir'}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                setBuilderQuestionTitle('');
                setBuildingForTemplate(null);
              }} className="h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SpQuestionBuilder
              templateId={buildingForTemplate}
              otherQuestions={questionsByTemplate[buildingForTemplate] ?? []}
              onTitleChange={setBuilderQuestionTitle}
              onSaved={(q) => {
                setQuestionsByTemplate((prev) => ({
                  ...prev,
                  [buildingForTemplate]: [...(prev[buildingForTemplate] ?? []), q],
                }));
                setBuilderQuestionTitle('');
                setBuildingForTemplate(null);
              }}
              onCancel={() => {
                setBuilderQuestionTitle('');
                setBuildingForTemplate(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal simulateur */}
      {simulatingForTemplate && (
        <SpWorkflowSimulatorModal
          questions={questionsByTemplate[simulatingForTemplate.templateId] ?? []}
          templateId={simulatingForTemplate.templateId}
          templateNom={wordTemplates.find((t) => t.id === simulatingForTemplate.templateId)?.nom ?? ''}
          startFromQuestionId={simulatingForTemplate.startFromQuestionId}
          onClose={() => setSimulatingForTemplate(null)}
        />
      )}

      {/* Modal génération / modification IA */}
      {aiGeneratingForTemplate && (() => {
        const aiTemplateId = aiGeneratingForTemplate.templateId;
        return (
        <SpAiGeneratorModal
          templateId={aiTemplateId}
          mode={aiGeneratingForTemplate.mode}
          nextOrdre={(questionsByTemplate[aiTemplateId] ?? []).length + 1}
          existingQuestions={questionsByTemplate[aiTemplateId] ?? []}
          onImport={async (questions, replace) => {
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const idMap = new Map<string, string>(
              questions.map((q) => [
                q.id,
                UUID_RE.test(q.id ?? '') ? q.id : crypto.randomUUID(),
              ])
            );
            const remapped = questions.map((q) => ({
              ...q,
              id: idMap.get(q.id)!,
              groupes_conditions: q.groupes_conditions?.map((g) => ({
                ...g,
                conditions: g.conditions.map((c) => ({
                  ...c,
                  question_id: c.question_id ? (idMap.get(c.question_id) ?? c.question_id) : c.question_id,
                })),
              })),
              consequences: (q.consequences ?? []).map((c) => ({
                ...c,
                question_id: c.question_id ? (idMap.get(c.question_id) ?? c.question_id) : c.question_id,
              })),
            }));

            if (replace) {
              const res = await fetch(`/api/templates/${aiTemplateId}/sp-questions/replace`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: remapped }),
              });
              const data = await res.json() as { questions: SpQuestion[] };
              setQuestionsByTemplate((prev) => ({
                ...prev,
                [aiTemplateId]: (data.questions ?? []).sort((a, b) => a.ordre - b.ordre),
              }));
            } else {
              const saved: SpQuestion[] = [];
              for (const q of remapped) {
                const res = await fetch(`/api/templates/${aiTemplateId}/sp-questions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(q),
                });
                const data = await res.json() as { question: SpQuestion };
                if (data.question) saved.push(data.question);
              }
              setQuestionsByTemplate((prev) => ({
                ...prev,
                [aiTemplateId]: [
                  ...(prev[aiTemplateId] ?? []),
                  ...saved,
                ].sort((a, b) => a.ordre - b.ordre),
              }));
            }
            setAiGeneratingForTemplate(null);
          }}
          onClose={() => setAiGeneratingForTemplate(null)}
        />
        );
      })()}

      {/* Modal édition */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Modifier la question</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {builderQuestionTitle || editingQuestion.question.libelle}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => {
                setBuilderQuestionTitle('');
                setEditingQuestion(null);
              }} className="h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SpQuestionBuilder
              templateId={editingQuestion.templateId}
              initial={editingQuestion.question}
              otherQuestions={(questionsByTemplate[editingQuestion.templateId] ?? []).filter((q) => q?.id !== editingQuestion.question.id)}
              onTitleChange={setBuilderQuestionTitle}
              onSaved={(q) => {
                setQuestionsByTemplate((prev) => ({
                  ...prev,
                  [editingQuestion.templateId]: (prev[editingQuestion.templateId] ?? []).filter(Boolean).map((existing) =>
                    existing.id === q.id ? q : existing
                  ),
                }));
                setBuilderQuestionTitle('');
                setEditingQuestion(null);
              }}
              onCancel={() => {
                setBuilderQuestionTitle('');
                setEditingQuestion(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
