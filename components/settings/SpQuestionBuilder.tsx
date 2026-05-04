'use client';

import { useState } from 'react';
import { HelpCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpConditionEditor } from './SpConditionEditor';
import type {
  SpQuestion,
  SpQuestionSource,
  SpQuestionAffichage,
  SpGroupeConditions,
  SpConditionLogique,
  SpConsequence,
  SpQuestionBoucle,
} from '@/types';

interface Props {
  templateId: string;
  onSaved: (q: SpQuestion) => void;
  onCancel: () => void;
  initial?: Partial<SpQuestion>;
  /** All other questions in the template (for condition/consequence references) */
  otherQuestions?: SpQuestion[];
}

type Block = 1 | 2 | 3 | 4 | 5;

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

// ── Données ───────────────────────────────────────────────────────────────────
const SOURCES: { value: SpQuestionSource; label: string; desc: string; tooltip: string }[] = [
  {
    value: 'catalogue',
    label: 'Catalogue produits',
    desc: "L'IA propose des choix issus de votre catalogue",
    tooltip: "L'IA parcourt votre catalogue et propose les produits correspondant aux critères. Idéal pour choisir un opérateur, un forfait mobile, un équipement.",
  },
  {
    value: 'sa',
    label: 'Données SA extraites',
    desc: "Utilise les données du document situation actuelle",
    tooltip: "La question s'appuie sur les données extraites automatiquement du document SA (ex: opérateur actuel, nombre de lignes, montant). L'utilisateur confirme ou corrige.",
  },
  {
    value: 'aucune',
    label: 'Aucune (saisie manuelle)',
    desc: "L'utilisateur saisit une réponse libre",
    tooltip: "Aucune donnée n'est pré-remplie. L'utilisateur répond directement (texte, nombre, date, adresse…). Utile pour des informations non présentes dans le document SA.",
  },
  {
    value: 'catalogue_et_sa',
    label: 'Catalogue + SA combinés',
    desc: "Propose des choix du catalogue en tenant compte du SA",
    tooltip: "Combine les deux : l'IA filtre le catalogue en tenant compte des données SA. Ex: proposer des forfaits adaptés au nombre de lignes détecté dans le SA.",
  },
];

const AFFICHAGE_TOOLTIPS: Record<SpQuestionAffichage, string> = {
  boutons_choix_unique: "L'utilisateur clique sur un seul bouton parmi les choix proposés. Idéal pour choisir un fournisseur ou un forfait.",
  boutons_choix_multiple: "L'utilisateur peut cocher plusieurs réponses. Idéal pour sélectionner plusieurs produits ou services.",
  liste_deroulante: "Menu déroulant compact. Utile quand il y a beaucoup de choix possibles.",
  oui_non: "Deux boutons Oui / Non. Pour les questions binaires simples.",
  confirmation_sa: "Affiche la valeur extraite du document SA et demande à l'utilisateur de confirmer. Pas de modification possible.",
  edition_sa: "Affiche la valeur extraite du SA et permet à l'utilisateur de la modifier avant de valider.",
  texte_court: "Champ de saisie texte sur une seule ligne. Pour les réponses courtes (nom, référence…).",
  texte_long: "Zone de texte multi-lignes. Pour les commentaires ou descriptions longues.",
  nombre: "Champ numérique. L'utilisateur saisit un nombre (ex: nombre de postes, budget mensuel).",
  date: "Sélecteur de date. Pour une date de fin d'engagement, date de démarrage…",
  choix_liste_manuelle: "L'utilisateur choisit dans une liste que vous définissez vous-même (ex: 'Oui / Non / En cours').",
  adresse_complete: "Formulaire d'adresse structuré avec rue, complément, code postal, ville, pays.",
};

const AFFICHAGE_BY_SOURCE: Record<SpQuestionSource, Array<{ value: SpQuestionAffichage; label: string }>> = {
  catalogue: [
    { value: 'boutons_choix_unique', label: 'Boutons — choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons — choix multiple' },
    { value: 'liste_deroulante', label: 'Liste déroulante' },
  ],
  sa: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'confirmation_sa', label: 'Confirmation (lecture seule)' },
    { value: 'edition_sa', label: 'Édition (modifiable)' },
  ],
  aucune: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'texte_court', label: 'Texte court' },
    { value: 'texte_long', label: 'Texte long' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'choix_liste_manuelle', label: 'Choix dans une liste' },
    { value: 'adresse_complete', label: 'Adresse complète' },
  ],
  catalogue_et_sa: [
    { value: 'boutons_choix_unique', label: 'Boutons — choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons — choix multiple' },
    { value: 'confirmation_sa', label: 'Confirmation (lecture seule)' },
  ],
};

const BLOCK_TOOLTIPS: Record<Block, string> = {
  1: "D'où proviennent les choix proposés ? Catalogue, données SA extraites, ou saisie libre.",
  2: "Définissez sous quelles conditions cette question s'affiche (réponses précédentes, données SA…).",
  3: "Comment la question est présentée à l'utilisateur : type d'interface, libellé, aide.",
  4: "Variable SP remplie, conséquences (afficher/masquer/sauter), et priorité IA.",
  5: "Optionnel — rattacher cette question à une boucle (multisite, multi-ligne…).",
};

const CONSEQUENCE_TYPES: { value: SpConsequence['type']; label: string; desc: string }[] = [
  { value: 'renseigner_variable', label: 'Renseigner variable', desc: 'Stocke la réponse dans une variable SP' },
  { value: 'afficher_question', label: 'Afficher question', desc: 'Rend visible une autre question' },
  { value: 'masquer_question', label: 'Masquer question', desc: 'Cache une autre question' },
  { value: 'aller_question', label: 'Aller à question', desc: 'Saute directement à une question' },
  { value: 'filtrer_question', label: 'Filtrer catalogue', desc: 'Applique un filtre catalogue à une question' },
];

// ── Composant ─────────────────────────────────────────────────────────────────
export function SpQuestionBuilder({ templateId, onSaved, onCancel, initial, otherQuestions = [] }: Props) {
  const [activeBlock, setActiveBlock] = useState<Block>(1);
  const [source, setSource] = useState<SpQuestionSource>(initial?.source ?? 'aucune');
  const [affichage, setAffichage] = useState<SpQuestionAffichage>(initial?.affichage ?? 'texte_court');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [obligatoire, setObligatoire] = useState(initial?.obligatoire ?? true);
  const [prioriteIa, setPrioriteIa] = useState<'normale' | 'haute'>(initial?.priorite_ia ?? 'normale');
  const [isSaving, setIsSaving] = useState(false);

  // Conditions state
  const [groupesConditions, setGroupesConditions] = useState<SpGroupeConditions[]>(
    initial?.groupes_conditions ?? [],
  );
  const [logiqueDeclencheur, setLogiqueDeclencheur] = useState<SpConditionLogique>(
    initial?.logique_declencheur ?? 'ET',
  );

  // Consequences state
  const [consequences, setConsequences] = useState<SpConsequence[]>(
    initial?.consequences ?? [],
  );

  // Boucle state
  const [groupeBoucleId, setGroupeBoucleId] = useState<string>(initial?.groupe_boucle_id ?? '');
  const [boucleEnabled, setBoucleEnabled] = useState<boolean>(!!initial?.boucle);
  const [boucle, setBoucle] = useState<SpQuestionBoucle>(
    initial?.boucle ?? { label_prefix: '' },
  );

  const availableAffichages = AFFICHAGE_BY_SOURCE[source] ?? AFFICHAGE_BY_SOURCE.aucune;

  const handleSave = async () => {
    if (!libelle.trim()) return;
    setIsSaving(true);
    try {
      const body: Partial<SpQuestion> = {
        libelle,
        description: description || undefined,
        source,
        affichage,
        obligatoire,
        priorite_ia: prioriteIa,
        actif: true,
        consequences: consequences.length > 0 ? consequences : [],
        groupes_conditions: groupesConditions.length > 0 ? groupesConditions : undefined,
        logique_declencheur: groupesConditions.length > 0 ? logiqueDeclencheur : undefined,
        groupe_boucle_id: groupeBoucleId || undefined,
        boucle: boucleEnabled ? boucle : undefined,
        template_id: templateId,
        ordre: initial?.ordre ?? 0,
      };

      const isEdit = !!initial?.id;
      const url = isEdit
        ? `/api/templates/${templateId}/sp-questions/${initial.id}`
        : `/api/templates/${templateId}/sp-questions`;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) onSaved(data.question);
    } finally {
      setIsSaving(false);
    }
  };

  const addConsequence = () => {
    setConsequences((prev) => [...prev, { type: 'renseigner_variable', variable_cible: '' }]);
  };

  const updateConsequence = (index: number, patch: Partial<SpConsequence>) => {
    setConsequences((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeConsequence = (index: number) => {
    setConsequences((prev) => prev.filter((_, i) => i !== index));
  };

  const blockComplete: Record<Block, boolean> = {
    1: !!source,
    2: true,
    3: !!affichage && !!libelle,
    4: true,
    5: true,
  };

  const BLOCK_LABELS = ['Source', 'Conditions', 'Affichage', 'Résultat', 'Boucle'] as const;

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Navigation blocs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([1, 2, 3, 4, 5] as Block[]).map((b) => (
          <Tooltip key={b} text={BLOCK_TOOLTIPS[b]}>
            <button
              onClick={() => setActiveBlock(b)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeBlock === b
                  ? 'bg-blue-600 text-white'
                  : blockComplete[b]
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {b}. {BLOCK_LABELS[b - 1]}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* ── BLOC 1 — SOURCE ────────────────────────────────────────────── */}
      {activeBlock === 1 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Bloc 1 — Source</h3>
            <InfoIcon tooltip="La source détermine d'où proviennent les choix proposés à l'utilisateur. Elle conditionne aussi les types d'affichage disponibles au bloc 3." />
          </div>
          <p className="text-sm text-gray-500">
            Qu&apos;est-ce que l&apos;IA utilise pour répondre à cette question ?
          </p>
          <div className="space-y-2">
            {SOURCES.map((s) => (
              <Tooltip key={s.value} text={s.tooltip}>
                <button
                  onClick={() => {
                    setSource(s.value);
                    setAffichage(AFFICHAGE_BY_SOURCE[s.value][0].value);
                  }}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    source === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900">{s.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </button>
              </Tooltip>
            ))}
          </div>
          <Button size="sm" onClick={() => setActiveBlock(2)}>Suivant →</Button>
        </div>
      )}

      {/* ── BLOC 2 — CONDITIONS ────────────────────────────────────────── */}
      {activeBlock === 2 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Bloc 2 — Conditions d&apos;affichage</h3>
            <InfoIcon tooltip="Les conditions permettent d'afficher ou masquer cette question selon les réponses aux questions précédentes ou les données SA. Sans condition, la question s'affiche toujours." />
          </div>
          <p className="text-sm text-gray-500">Quand cette question s&apos;affiche-t-elle ?</p>
          <SpConditionEditor
            groupes={groupesConditions}
            logiqueRacine={logiqueDeclencheur}
            onChange={(g, l) => {
              setGroupesConditions(g);
              setLogiqueDeclencheur(l);
            }}
            otherQuestions={otherQuestions}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(1)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(3)}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* ── BLOC 3 — AFFICHAGE ─────────────────────────────────────────── */}
      {activeBlock === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Bloc 3 — Affichage</h3>
            <InfoIcon tooltip="Définissez comment la question est présentée dans le formulaire SP : type de widget, libellé affiché et aide contextuelle." />
          </div>

          {/* Type d'affichage */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Type d&apos;affichage</label>
              <InfoIcon tooltip="Le type d'affichage détermine l'interface proposée à l'utilisateur. Les options disponibles dépendent de la source choisie au bloc 1." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {availableAffichages.map((a) => (
                <Tooltip key={a.value} text={AFFICHAGE_TOOLTIPS[a.value]}>
                  <button
                    onClick={() => setAffichage(a.value)}
                    className={`w-full text-left p-2 rounded-lg border text-xs transition-colors ${
                      affichage === a.value
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {a.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Libellé */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Libellé de la question *</label>
              <InfoIcon tooltip="Le texte affiché à l'utilisateur lors de la génération SP. Soyez précis et actionnable : l'utilisateur doit comprendre ce qu'on lui demande sans contexte." />
            </div>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Quel fournisseur souhaitez-vous retenir ?"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Description / aide <span className="font-normal text-gray-400">(optionnel)</span></label>
              <InfoIcon tooltip="Texte d'aide affiché en gris sous la question. Utile pour expliquer le contexte, donner un exemple de réponse ou préciser le format attendu." />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Indiquez le fournisseur retenu pour la proposition finale. Ce nom apparaîtra sur le document."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Obligatoire */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="obligatoire"
              checked={obligatoire}
              onChange={(e) => setObligatoire(e.target.checked)}
            />
            <label htmlFor="obligatoire" className="text-sm text-gray-700">Question obligatoire</label>
            <InfoIcon tooltip="Si activé, l'utilisateur devra obligatoirement répondre à cette question avant de pouvoir lancer la génération de la SP. Les questions non-obligatoires peuvent être ignorées." />
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(2)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(4)} disabled={!libelle.trim()}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* ── BLOC 4 — RÉSULTAT & CONSÉQUENCES ──────────────────────────── */}
      {activeBlock === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Bloc 4 — Résultat &amp; Conséquences</h3>
            <InfoIcon tooltip="Définissez ce qui se passe quand l'utilisateur répond : variable SP remplie, questions affichées/masquées, sauts, filtres, et priorité IA." />
          </div>

          {/* Conséquences */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Conséquences</label>
                <InfoIcon tooltip="Actions déclenchées quand l'utilisateur répond. Vous pouvez en ajouter plusieurs." />
              </div>
              <button
                onClick={addConsequence}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>

            {consequences.length === 0 && (
              <p className="text-xs text-gray-400">Aucune conséquence. Ajoutez-en pour renseigner une variable, naviguer, etc.</p>
            )}

            {consequences.map((cons, ci) => (
              <div key={ci} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={cons.type}
                    onChange={(e) => updateConsequence(ci, { type: e.target.value as SpConsequence['type'] })}
                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    {CONSEQUENCE_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400 flex-1">
                    {CONSEQUENCE_TYPES.find((ct) => ct.value === cons.type)?.desc}
                  </span>
                  <button onClick={() => removeConsequence(ci)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {cons.type === 'renseigner_variable' && (
                  <input
                    value={cons.variable_cible ?? ''}
                    onChange={(e) => updateConsequence(ci, { variable_cible: e.target.value })}
                    placeholder="ex: sp_fournisseur_propose"
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                  />
                )}

                {(cons.type === 'afficher_question' || cons.type === 'masquer_question' || cons.type === 'aller_question' || cons.type === 'filtrer_question') && (
                  <select
                    value={cons.question_id ?? ''}
                    onChange={(e) => updateConsequence(ci, { question_id: e.target.value || undefined })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">-- Sélectionner une question --</option>
                    {otherQuestions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.libelle.length > 50 ? q.libelle.slice(0, 50) + '…' : q.libelle}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Priorité IA */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Priorité pour l&apos;IA</label>
              <InfoIcon tooltip="Indique à l'IA l'importance de cette réponse lors de la génération SP. Haute = l'IA doit s'y conformer absolument." />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Tooltip text="L'IA tient compte de la réponse comme d'une indication forte, mais peut en tenir compte avec nuance.">
                <button
                  onClick={() => setPrioriteIa('normale')}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    prioriteIa === 'normale' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Normale
                </button>
              </Tooltip>
              <Tooltip text="L'IA doit absolument respecter cette réponse. Elle prime sur toute autre logique.">
                <button
                  onClick={() => setPrioriteIa('haute')}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    prioriteIa === 'haute' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Haute — l&apos;IA doit l&apos;appliquer sans exception
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(3)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(5)}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* ── BLOC 5 — BOUCLE ──────────────────────────────────────────── */}
      {activeBlock === 5 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Bloc 5 — Boucle <span className="text-gray-400 font-normal">(optionnel)</span></h3>
            <InfoIcon tooltip="Rattachez cette question à un groupe de boucle pour la répéter N fois (par site, par ligne…). Laissez vide si ce n'est pas une question en boucle." />
          </div>

          <div className="space-y-3">
            {/* Groupe boucle ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Identifiant du groupe de boucle</label>
              <input
                value={groupeBoucleId}
                onChange={(e) => setGroupeBoucleId(e.target.value)}
                placeholder="ex: boucle_sites ou boucle_lignes"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
              />
              <p className="text-xs text-gray-400">
                Toutes les questions avec le même identifiant forment un bloc répété. Laissez vide pour une question hors boucle.
              </p>
            </div>

            {/* Boucle config (only if this is the group leader) */}
            {groupeBoucleId && (
              <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="boucle_leader"
                    checked={boucleEnabled}
                    onChange={(e) => setBoucleEnabled(e.target.checked)}
                  />
                  <label htmlFor="boucle_leader" className="text-sm text-gray-700">
                    Cette question définit la boucle (première du groupe)
                  </label>
                </div>

                {boucleEnabled && (
                  <div className="space-y-2 pl-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Source du nombre d&apos;itérations</label>
                      <select
                        value={boucle.source_nombre_question_id ?? '__fixe__'}
                        onChange={(e) => {
                          if (e.target.value === '__fixe__') {
                            setBoucle((p) => ({ ...p, source_nombre_question_id: undefined, nombre_fixe: p.nombre_fixe ?? 2 }));
                          } else {
                            setBoucle((p) => ({ ...p, source_nombre_question_id: e.target.value, nombre_fixe: undefined }));
                          }
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                      >
                        <option value="__fixe__">Nombre fixe</option>
                        {otherQuestions.filter((q) => q.affichage === 'nombre').map((q) => (
                          <option key={q.id} value={q.id}>
                            Réponse à : {q.libelle.length > 40 ? q.libelle.slice(0, 40) + '…' : q.libelle}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!boucle.source_nombre_question_id && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Nombre fixe</label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={boucle.nombre_fixe ?? 2}
                          onChange={(e) => setBoucle((p) => ({ ...p, nombre_fixe: Number(e.target.value) || 2 }))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Source des labels (optionnel)</label>
                      <select
                        value={boucle.source_labels_question_id ?? ''}
                        onChange={(e) => setBoucle((p) => ({ ...p, source_labels_question_id: e.target.value || undefined }))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                      >
                        <option value="">Aucune (utiliser le préfixe)</option>
                        {otherQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            Réponse à : {q.libelle.length > 40 ? q.libelle.slice(0, 40) + '…' : q.libelle}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Préfixe label par défaut</label>
                      <input
                        value={boucle.label_prefix ?? ''}
                        onChange={(e) => setBoucle((p) => ({ ...p, label_prefix: e.target.value }))}
                        placeholder="ex: Site"
                        className="w-40 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(4)}>← Précédent</Button>
            <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
            <Button size="sm" onClick={handleSave} disabled={!libelle.trim() || isSaving}>
              {isSaving ? 'Sauvegarde...' : initial?.id ? 'Mettre à jour' : 'Créer la question'}
            </Button>
          </div>
        </div>
      )}

      {/* Aperçu */}
      {libelle && (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
            Aperçu
            <InfoIcon tooltip="Prévisualisation de la question telle qu'elle apparaîtra dans le formulaire SP présenté à l'utilisateur." />
          </p>
          <p className="text-sm font-medium text-gray-900">{libelle}</p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
          <div className="flex gap-1 mt-2 flex-wrap">
            <Tooltip text={SOURCES.find((s) => s.value === source)?.tooltip ?? ''}>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 cursor-help">{source}</span>
            </Tooltip>
            <Tooltip text={AFFICHAGE_TOOLTIPS[affichage]}>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 cursor-help">{affichage}</span>
            </Tooltip>
            {obligatoire && (
              <Tooltip text="Cette question est obligatoire — l'utilisateur devra y répondre avant de générer la SP.">
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 cursor-help">Obligatoire</span>
              </Tooltip>
            )}
            {prioriteIa === 'haute' && (
              <Tooltip text="Priorité haute — l'IA appliquera cette réponse sans exception.">
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 cursor-help">🔒 Priorité haute</span>
              </Tooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
