'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpConditionEditor } from './SpConditionEditor';
import { SpAiAssistPanel } from './SpAiAssistPanel';
import type {
  SpQuestion,
  SpQuestionSource,
  SpQuestionAffichage,
  SpGroupeConditions,
  SpConditionLogique,
  SpConsequence,
  SpQuestionBoucle,
  SpQuestionNombreConfig,
  SpVariableCustom,
  SpFiltresCatalogue,
  CatalogueProduit,
} from '@/types';

interface SpVariableOption {
  key: string;
  label: string;
  group: 'standard' | 'custom' | 'question';
}

interface Props {
  templateId: string;
  onSaved: (q: SpQuestion) => void;
  onCancel: () => void;
  initial?: Partial<SpQuestion>;
  onTitleChange?: (title: string) => void;
  /** All other questions in the template (for condition/consequence references) */
  otherQuestions?: SpQuestion[];
}

type Block = 1 | 2 | 3 | 4 | 5;
type TextInsertSource = 'sa' | 'sp';

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

// ── SA Schema helpers ─────────────────────────────────────────────────────────

const SA_DEFAULT_SCHEMA: Record<string, string[]> = {
  'situation_actuelle.lignes': [
    'numero_ligne', 'type', 'libelle', 'reference_contrat', 'libelle_contrat', 'engagement_ref', 'forfait', 'operateur', 'site',
    'tarif_brut_mensuel', 'tarif_net_mensuel', 'remise_mensuelle',
    'date_fin_engagement_source', 'date_limite_resiliation_calculee',
  ],
  'situation_actuelle.abonnements': [
    'libelle', 'reference_contrat', 'libelle_contrat', 'engagement_ref', 'operateur', 'site', 'quantite',
    'tarif_brut_mensuel', 'tarif_net_mensuel', 'remise_mensuelle',
  ],
  'situation_actuelle.locations': [
    'libelle', 'reference_contrat', 'libelle_contrat', 'engagement_ref', 'leaser', 'site', 'materiel', 'quantite',
    'loyer_brut_mensuel', 'loyer_net_mensuel', 'remise_mensuelle',
  ],
  'situation_actuelle.engagements': [
    'reference_contrat', 'libelle_contrat', 'engagement_ref', 'libelle', 'operateur', 'site', 'elements_rattaches', 'date_fin_engagement_source', 'date_limite_resiliation_calculee', 'preavis_mois',
  ],
  'situation_actuelle.sites': ['nom', 'adresse', 'code_postal', 'ville'],
  'situation_actuelle.operateurs': ['nom', 'type'],
  'situation_actuelle.documents': ['type_document', 'numero_document', 'date_document'],
  'situation_actuelle.indemnites': [
    'montant_source', 'montant_calcule', 'montant_estime', 'mois_restants_source',
    'preavis_mois_source', 'base_mensuelle_source', 'mensualites_restantes',
    'frais_resiliation_fixes', 'penalites', 'frais_materiel', 'services_annexes',
    'source_retenue', 'fiabilite', 'methode_calcul',
  ],
};

function parseJsonFromPrompt(promptText: string): Record<string, unknown> | null {
  const match = promptText.match(/STRUCTURE JSON ATTENDUE\s*:\s*(\{[\s\S]*?\})\s*(?:CHAMPS|RÈGLES)/);
  if (!match) return null;
  try { return JSON.parse(match[1]) as Record<string, unknown>; } catch { return null; }
}

function findArrayPathsInJson(obj: unknown, prefix = '', depth = 0): Record<string, string[]> {
  if (depth > 3 || obj == null || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      result[path] = Object.keys(value[0] as Record<string, unknown>);
    }
    Object.assign(result, findArrayPathsInJson(value, path, depth + 1));
  }
  return result;
}

function findScalarPathsInJson(obj: unknown, prefix = '', depth = 0): string[] {
  if (depth > 4 || obj == null || typeof obj !== 'object') return [];
  const result: string[] = [];
  if (Array.isArray(obj)) {
    const first = obj[0];
    if (first != null && typeof first === 'object' && !Array.isArray(first)) {
      for (const [key, value] of Object.entries(first as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value == null || typeof value !== 'object') result.push(path);
      }
    }
    return result;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value == null || typeof value !== 'object') result.push(path);
    else result.push(...findScalarPathsInJson(value, path, depth + 1));
  }
  return result;
}

function buildDefaultScalarSaPaths(schema: Record<string, string[]>): string[] {
  return Object.entries(schema).flatMap(([arrayPath, fields]) => fields.map((field) => `${arrayPath}.${field}`));
}

function getSaRealFieldValues(saData: Record<string, unknown>, path: string, field: string): string[] {
  const parts = path.split('.');
  let cur: unknown = saData;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return [];
    cur = (cur as Record<string, unknown>)[p];
  }
  if (!Array.isArray(cur)) return [];
  const seen = new Set<string>();
  for (const item of cur) {
    if (item != null && typeof item === 'object') {
      const v = (item as Record<string, unknown>)[field];
      if (v != null) seen.add(String(v));
    }
  }
  return Array.from(seen);
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
    value: 'aucune',
    label: 'Aucune (saisie manuelle)',
    desc: "L'utilisateur saisit une réponse libre",
    tooltip: "Aucune donnée n'est pré-remplie. L'utilisateur répond directement (texte, nombre, date, adresse…). Utile pour des informations non présentes dans le document SA.",
  },
];

const AFFICHAGE_TOOLTIPS: Record<SpQuestionAffichage, string> = {
  boutons_choix_unique: "L'utilisateur clique sur un seul bouton parmi les choix proposés. Idéal pour choisir un fournisseur ou un forfait.",
  boutons_choix_multiple: "L'utilisateur peut cocher plusieurs réponses. Idéal pour sélectionner plusieurs produits ou services.",
  liste_deroulante: "Menu déroulant compact avec un seul choix possible. Utile quand il y a beaucoup de choix possibles.",
  liste_deroulante_choix_multiple: "Menu déroulant compact permettant de sélectionner plusieurs choix. Utile quand il y a beaucoup de choix possibles.",
  oui_non: "Deux boutons Oui / Non. Pour les questions binaires simples.",
  texte_court: "Champ de saisie texte sur une seule ligne. Pour les réponses courtes (nom, référence…).",
  texte_long: "Zone de texte multi-lignes. Pour les commentaires ou descriptions longues.",
  nombre: "Champ numérique. L'utilisateur saisit un nombre (ex: nombre de postes, budget mensuel).",
  date: "Sélecteur de date. Pour une date de fin d'engagement, date de démarrage…",
  remise_produits: "Affiche les produits déjà sélectionnés qui sont éligibles à une remise conditionnelle.",
  choix_liste_manuelle: "L'utilisateur choisit dans une liste que vous définissez vous-même (ex: 'Oui / Non / En cours').",
  adresse_complete: "Formulaire d'adresse structuré avec rue, complément, code postal, ville, pays.",
  marge: "Champ libre où l'utilisateur saisit sa marge en €. Le loyer mensuel/trimestriel est calculé en live selon le barème applicable du template.",
};

const AFFICHAGE_BY_SOURCE: Record<SpQuestionSource, Array<{ value: SpQuestionAffichage; label: string }>> = {
  catalogue: [
    { value: 'boutons_choix_unique', label: 'Boutons — choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons — choix multiple' },
    { value: 'liste_deroulante', label: 'Liste déroulante — choix unique' },
    { value: 'liste_deroulante_choix_multiple', label: 'Liste déroulante — choix multiple' },
  ],
  aucune: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'texte_court', label: 'Texte court' },
    { value: 'texte_long', label: 'Texte long' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'remise_produits', label: 'Remises produits' },
    { value: 'choix_liste_manuelle', label: 'Choix dans une liste' },
    { value: 'adresse_complete', label: 'Adresse complète' },
    { value: 'marge', label: 'Marge (calcul loyer)' },
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
  { value: 'afficher_message', label: 'Afficher un message', desc: 'Affiche un message dans le chat selon la réponse' },
];

// ── Catalogue filter ──────────────────────────────────────────────────────────
const CATALOGUE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'internet', label: 'Internet' },
  { value: 'fixe', label: 'Fixe' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'equipement', label: 'Équipement' },
  { value: 'cadeau', label: 'Cadeau' },
  { value: 'installation', label: 'Installation' },
  { value: 'autre', label: 'Autre' },
];

function formatEuro(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function formatProduitMeta(produit: CatalogueProduit): string | null {
  const parts: string[] = [];

  if (produit.type_frequence === 'mensuel' && produit.prix_mensuel != null) {
    parts.push(`${formatEuro(produit.prix_mensuel)}/mois`);
  } else if (produit.type_frequence === 'unique' && produit.prix_vente != null) {
    parts.push(formatEuro(produit.prix_vente));
  }

  if (produit.prix_installation != null) {
    parts.push(`FAS ${formatEuro(produit.prix_installation)}`);
  }

  return parts.length > 0 ? parts.join(' - ') : null;
}

function FiltreCatalogueUI({
  filtre,
  onChange,
  allProduits,
  colorScheme = 'blue',
}: {
  filtre: SpFiltresCatalogue;
  onChange: (f: SpFiltresCatalogue) => void;
  allProduits: CatalogueProduit[];
  colorScheme?: 'blue' | 'amber';
}) {
  const [search, setSearch] = useState('');
  const active = colorScheme === 'blue'
    ? 'bg-blue-600 text-white border-blue-600'
    : 'bg-amber-600 text-white border-amber-600';
  const hover = colorScheme === 'blue' ? 'hover:border-blue-400' : 'hover:border-amber-400';
  const hasSpecificProducts = (filtre.produits_ids?.length ?? 0) > 0;

  const displayedProducts = allProduits.filter((p) =>
    !search || p.nom.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {!hasSpecificProducts && (
        <>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Catégories <span className="text-gray-400">(laisser vide = toutes)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {CATALOGUE_CATEGORIES.map((cat) => {
                const isSelected = filtre.categories?.includes(cat.value) ?? false;
                return (
                  <button key={cat.value} type="button"
                    onClick={() => {
                      const current = filtre.categories ?? [];
                      const next = isSelected ? current.filter((c) => c !== cat.value) : [...current, cat.value];
                      onChange({ ...filtre, categories: next.length > 0 ? next : undefined });
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${isSelected ? active : `bg-white text-gray-600 border-gray-300 ${hover}`}`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-gray-500 shrink-0">Facturation</p>
            <div className="flex gap-1.5">
              {([
                { value: 'tous', label: 'Tous' },
                { value: 'mensuel', label: 'Mensuel' },
                { value: 'unique', label: 'Ponctuel' },
              ] as const).map((tf) => (
                <button key={tf.value} type="button"
                  onClick={() => onChange({ ...filtre, type_facturation: tf.value === 'tous' ? undefined : tf.value })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${(filtre.type_facturation ?? 'tous') === tf.value ? active : `bg-white text-gray-600 border-gray-300 ${hover}`}`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="border-t border-gray-100 pt-2">
        <p className="text-xs text-gray-500 mb-1.5">
          Produits spécifiques <span className="text-gray-400">(remplace les filtres ci-dessus si sélectionnés)</span>
        </p>
        {allProduits.length > 0 ? (
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1.5 focus:outline-none focus:border-blue-400"
            />
            <div className="max-h-36 overflow-y-auto space-y-0.5 border border-gray-100 rounded p-1 bg-white">
              {displayedProducts.map((p) => {
                const isSelected = filtre.produits_ids?.includes(p.id) ?? false;
                const produitMeta = formatProduitMeta(p);
                return (
                  <label key={p.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const current = filtre.produits_ids ?? [];
                        const next = isSelected ? current.filter((id) => id !== p.id) : [...current, p.id];
                        onChange({ ...filtre, produits_ids: next.length > 0 ? next : undefined });
                      }}
                      className="w-3 h-3 accent-blue-600"
                    />
                    <span className="flex items-baseline gap-1 text-xs text-gray-700 flex-1 min-w-0 overflow-hidden">
                      <span className="truncate">{p.nom}</span>
                      {produitMeta && (
                        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                          ({produitMeta})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{p.categorie}</span>
                  </label>
                );
              })}
              {displayedProducts.length === 0 && (
                <p className="text-xs text-gray-400 px-1 py-1">Aucun produit trouvé</p>
              )}
            </div>
            {hasSpecificProducts && (
              <button type="button" onClick={() => onChange({ ...filtre, produits_ids: undefined })}
                className="mt-1 text-xs text-red-500 hover:underline">
                Réinitialiser la sélection ({filtre.produits_ids!.length} produit{filtre.produits_ids!.length > 1 ? 's' : ''})
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Chargement du catalogue...</p>
        )}
      </div>
    </div>
  );
}

// ── Composant ─────────────────────────────────────────────────────────────────
export function SpQuestionBuilder({ templateId, onSaved, onCancel, initial, onTitleChange, otherQuestions = [] }: Props) {
  const [activeBlock, setActiveBlock] = useState<Block>(1);
  const [source, setSource] = useState<SpQuestionSource>(initial?.source ?? 'aucune');
  const [affichage, setAffichage] = useState<SpQuestionAffichage>(initial?.affichage ?? 'texte_court');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [obligatoire, setObligatoire] = useState(initial?.obligatoire ?? true);
  const [prioriteIa, setPrioriteIa] = useState<'normale' | 'haute'>(initial?.priorite_ia ?? 'normale');
  const [nombreConfig, setNombreConfig] = useState<SpQuestionNombreConfig>(initial?.nombre_config ?? {});
  const [isSaving, setIsSaving] = useState(false);

  // Variables SP disponibles
  const [spVariables, setSpVariables] = useState<SpVariableOption[]>([]);
  const [showCreateVar, setShowCreateVar] = useState<number | null>(null); // index de la conséquence
  const [showRenameVar, setShowRenameVar] = useState<number | null>(null);
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarDescription, setNewVarDescription] = useState('');
  const [creatingSaving, setCreatingSaving] = useState(false);
  const [renameVarKey, setRenameVarKey] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [variableRenameMap, setVariableRenameMap] = useState<Record<string, { key: string; label: string }>>({});

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}/sp-variables`)
      .then((r) => r.json())
      .then((data: { standard: string[]; custom: SpVariableCustom[] }) => {
        const opts: SpVariableOption[] = [
          ...(data.standard ?? []).map((k) => ({ key: k, label: k, group: 'standard' as const })),
          ...(data.custom ?? []).map((c) => ({ key: c.key, label: `${c.key} — ${c.label}`, group: 'custom' as const })),
        ];
        setSpVariables(opts);
      })
      .catch(() => {});
  }, [templateId]);

  const slugifyVar = (s: string) =>
    'sp_' + s.toLowerCase()
      .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ùû]/g, 'u')
      .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i')
      .replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');

  const handleCreateVariable = async (consIdx: number) => {
    const key = newVarKey || slugifyVar(newVarLabel);
    if (!key || !newVarLabel.trim()) return;
    setCreatingSaving(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/sp-variables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label: newVarLabel.trim(), description: newVarDescription.trim(), type: 'string' }),
      });
      if (res.ok) {
        const newOpt: SpVariableOption = { key, label: `${key} — ${newVarLabel.trim()}`, group: 'custom' };
        setSpVariables((prev) => [...prev, newOpt]);
        updateConsequence(consIdx, { variable_cible: key });
        setShowCreateVar(null);
        setNewVarLabel('');
        setNewVarKey('');
        setNewVarDescription('');
      }
    } finally {
      setCreatingSaving(false);
    }
  };

  const buildRenamedOptionLabel = (baseLabel: string, oldKey: string, nextKey: string) => {
    if (baseLabel.startsWith(`${oldKey} — `)) {
      return `${nextKey} — ${baseLabel.slice(oldKey.length + 3)}`;
    }
    return `${nextKey} — ${baseLabel}`;
  };

  const startRenameVariable = (consIdx: number, currentKey: string, currentLabel?: string) => {
    setShowRenameVar(consIdx);
    setRenameVarKey(currentKey);
    setRenameError('');
    if (currentLabel) {
      setVariableRenameMap((prev) => ({
        ...prev,
        [currentKey]: prev[currentKey] ?? { key: currentKey, label: currentLabel },
      }));
    }
  };

  const handleRenameVariable = async (consIdx: number) => {
    const oldKey = consequences[consIdx]?.variable_cible?.trim();
    const nextKey = renameVarKey.trim();
    if (!oldKey || !nextKey) return;

    setRenameSaving(true);
    setRenameError('');
    try {
      const res = await fetch(`/api/templates/${templateId}/sp-variables`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldKey, newKey: nextKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Erreur lors du renommage');
      }

      const selectedOption = [...templateCustomVariables, ...previousQuestionVariables, ...selectedQuestionVariables]
        .find((v) => v.key === oldKey);
      const nextLabel = selectedOption
        ? buildRenamedOptionLabel(selectedOption.label, oldKey, nextKey)
        : `${nextKey} — variable renommée`;

      setSpVariables((prev) => prev.map((v) =>
        v.key === oldKey ? { ...v, key: nextKey, label: buildRenamedOptionLabel(v.label, oldKey, nextKey) } : v,
      ));
      setVariableRenameMap((prev) => ({
        ...prev,
        [oldKey]: { key: nextKey, label: nextLabel },
      }));
      setConsequences((prev) => prev.map((c) =>
        c.type === 'renseigner_variable' && c.variable_cible === oldKey
          ? { ...c, variable_cible: nextKey }
          : c,
      ));
      setShowRenameVar(null);
      setRenameVarKey('');
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Erreur lors du renommage');
    } finally {
      setRenameSaving(false);
    }
  };

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

  const knownVariableKeys = new Set<string>();
  const templateStandardVariables: SpVariableOption[] = [];
  const templateCustomVariables: SpVariableOption[] = [];
  for (const variable of spVariables) {
    knownVariableKeys.add(variable.key);
    if (variable.group === 'standard') templateStandardVariables.push(variable);
    if (variable.group === 'custom') templateCustomVariables.push(variable);
  }

  const previousQuestionVariables: SpVariableOption[] = [];
  const currentQuestionOrdre = initial?.ordre;
  const orderedQuestions = [...otherQuestions].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  for (const question of orderedQuestions) {
    if (currentQuestionOrdre != null && question.ordre != null && question.ordre >= currentQuestionOrdre) continue;
    for (const consequence of question.consequences ?? []) {
      if (consequence.type !== 'renseigner_variable' || !consequence.variable_cible) continue;
      const renamedVariable = variableRenameMap[consequence.variable_cible];
      const variableKey = renamedVariable?.key ?? consequence.variable_cible;
      if (knownVariableKeys.has(variableKey)) continue;
      const shortLabel =
        question.libelle.length > 40 ? `${question.libelle.slice(0, 40)}…` : question.libelle;
      const variableLabel = renamedVariable?.label ?? `${variableKey} — ${shortLabel}`;
      previousQuestionVariables.push({
        key: variableKey,
        label: variableLabel,
        group: 'question',
      });
      knownVariableKeys.add(variableKey);
    }
  }

  const selectedQuestionVariables: SpVariableOption[] = [];
  for (const consequence of consequences) {
    if (consequence.type !== 'renseigner_variable' || !consequence.variable_cible) continue;
    const renamedVariable = variableRenameMap[consequence.variable_cible];
    const variableKey = renamedVariable?.key ?? consequence.variable_cible;
    if (knownVariableKeys.has(variableKey)) continue;
    selectedQuestionVariables.push({
      key: variableKey,
      label: renamedVariable?.label ?? `${variableKey} — variable de cette question`,
      group: 'question',
    });
    knownVariableKeys.add(variableKey);
  }

  const previousQuestionsForText = orderedQuestions.filter((question) => {
    if (currentQuestionOrdre == null || question.ordre == null) return true;
    return question.ordre < currentQuestionOrdre;
  });
  const previousCatalogueQuestionsForCount = previousQuestionsForText.filter((question) =>
    question.source === 'catalogue',
  );

  // Options manuelles (pour choix_liste_manuelle)
  const [optionsManuelles, setOptionsManuelles] = useState<string[]>(initial?.options_manuelles ?? []);
  const [newOption, setNewOption] = useState('');
  // Options libres (pour catalogue)
  const [optionsLibres, setOptionsLibres] = useState<boolean>(initial?.options_libres ?? false);

  // Filtre catalogue
  const [filtresCatalogue, setFiltresCatalogue] = useState<SpFiltresCatalogue>(
    initial?.filtres_catalogue ?? {}
  );
  const [allProduits, setAllProduits] = useState<CatalogueProduit[]>([]);
  const [produitsLoaded, setProduitsLoaded] = useState(false);

  useEffect(() => {
    if (source === 'catalogue' && !produitsLoaded) {
      fetch('/api/catalogue')
        .then((r) => r.json())
        .then((d: { produits?: CatalogueProduit[] }) => {
          setAllProduits(d.produits ?? []);
          setProduitsLoaded(true);
        })
        .catch(() => setProduitsLoaded(true));
    }
  }, [source, produitsLoaded]);

  // Boucle state
  const [groupeBoucleId, setGroupeBoucleId] = useState<string>(initial?.groupe_boucle_id ?? '');
  const [boucleEnabled, setBoucleEnabled] = useState<boolean>(!!initial?.boucle);
  const [boucle, setBoucle] = useState<SpQuestionBoucle>(
    initial?.boucle ?? { label_prefix: '' },
  );

  // SA schema state
  const [saSchema, setSaSchema] = useState<Record<string, string[]>>(SA_DEFAULT_SCHEMA);
  const [saScalarPaths, setSaScalarPaths] = useState<string[]>(() => buildDefaultScalarSaPaths(SA_DEFAULT_SCHEMA));
  const [saRealData, setSaRealData] = useState<Record<string, unknown> | null>(null);
  const [saSchemaLoading, setSaSchemaLoading] = useState(false);
  const [saSchemaLoaded, setSaSchemaLoaded] = useState(false);
  const [saCountPath, setSaCountPath] = useState('');
  const [saCountFilterField, setSaCountFilterField] = useState('');
  const [saCountFilterValue, setSaCountFilterValue] = useState('');
  const [textInsertSource, setTextInsertSource] = useState<TextInsertSource>('sa');

  useEffect(() => {
    if (saSchemaLoaded || saSchemaLoading) return;
    setSaSchemaLoading(true);
    Promise.all([
      fetch(`/api/templates/${templateId}`).then((r) => r.json()),
      fetch(`/api/propositions/latest-extracted-data?template_id=${templateId}`).then((r) => r.json()),
    ])
      .then(([tplData, latestData]) => {
        const promptText: string = tplData?.template?.prompt_template ?? '';
        const parsed = parseJsonFromPrompt(promptText);
        const fromPrompt = parsed ? findArrayPathsInJson(parsed) : {};
        const nextSchema = Object.keys(fromPrompt).length > 0
          ? { ...SA_DEFAULT_SCHEMA, ...fromPrompt }
          : SA_DEFAULT_SCHEMA;
        setSaSchema(nextSchema);
        setSaScalarPaths(parsed ? findScalarPathsInJson(parsed) : buildDefaultScalarSaPaths(nextSchema));
        if (latestData?.extracted_data) {
          setSaRealData(latestData.extracted_data as Record<string, unknown>);
        }
        setSaSchemaLoaded(true);
      })
      .catch(() => setSaSchemaLoaded(true))
      .finally(() => setSaSchemaLoading(false));
  }, [templateId, saSchemaLoaded, saSchemaLoading]);

  useEffect(() => {
    onTitleChange?.(libelle.trim());
  }, [libelle, onTitleChange]);

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
        options_manuelles: affichage === 'choix_liste_manuelle' && optionsManuelles.length > 0 ? optionsManuelles : undefined,
        options_libres: source === 'catalogue' && optionsLibres ? true : undefined,
        filtres_catalogue: source === 'catalogue' &&
          (filtresCatalogue.categories?.length || filtresCatalogue.type_facturation || filtresCatalogue.produits_ids?.length)
          ? filtresCatalogue
          : undefined,
        obligatoire,
        priorite_ia: prioriteIa,
        nombre_config: affichage === 'nombre' && nombreConfig.suggestion_source
          ? nombreConfig
          : undefined,
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

  const insertSaVariable = (target: 'libelle' | 'description', token: string) => {
    if (target === 'libelle') {
      setLibelle((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
    } else {
      setDescription((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
    }
  };

  const insertSaCountVariable = (target: 'libelle' | 'description') => {
    if (!saCountPath) return;
    const token = saCountFilterField && saCountFilterValue.trim()
      ? `{{count:${saCountPath}|${saCountFilterField}=${saCountFilterValue.trim()}}}`
      : `{{count:${saCountPath}}}`;
    insertSaVariable(target, token);
  };

  const insertSpVariable = (
    target: 'libelle' | 'description',
    questionId: string,
    mode: 'value' | 'count',
  ) => {
    if (!questionId) return;
    const questionLabel = previousQuestionsForText.find((question) => question.id === questionId)?.libelle?.trim();
    const readableSuffix = questionLabel ? `|${questionLabel}` : '';
    const token = mode === 'count'
      ? `{{sp_count:${questionId}${readableSuffix}}}`
      : `{{sp:${questionId}${readableSuffix}}}`;
    insertSaVariable(target, token);
  };

  const blockComplete: Record<Block, boolean> = {
    1: !!source,
    2: true,
    3: !!affichage && !!libelle && (affichage !== 'choix_liste_manuelle' || optionsManuelles.length > 0),
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
                    setOptionsManuelles([]);
                    setOptionsLibres(false);
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

          {source === 'catalogue' && (
            <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-700">Filtrer les produits affichés</p>
                <InfoIcon tooltip="Restreint les produits du catalogue visibles pour cette question. Laissez tout vide pour afficher tous les produits." />
              </div>
              <FiltreCatalogueUI
                filtre={filtresCatalogue}
                onChange={setFiltresCatalogue}
                allProduits={allProduits}
                colorScheme="blue"
              />
            </div>
          )}

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

          {/* Options manuelles (choix_liste_manuelle) */}
          {affichage === 'choix_liste_manuelle' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Options de la liste *</label>
                <InfoIcon tooltip="Définissez les choix que l'utilisateur pourra sélectionner. Ajoutez au moins une option." />
              </div>
              <div className="space-y-1.5">
                {optionsManuelles.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...optionsManuelles];
                        next[i] = e.target.value;
                        setOptionsManuelles(next);
                      }}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setOptionsManuelles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newOption.trim()) {
                        setOptionsManuelles((prev) => [...prev, newOption.trim()]);
                        setNewOption('');
                      }
                    }}
                    placeholder="Nouvelle option… (Entrée pour valider)"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (newOption.trim()) {
                        setOptionsManuelles((prev) => [...prev, newOption.trim()]);
                        setNewOption('');
                      }
                    }}
                    disabled={!newOption.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {optionsManuelles.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  ⚠ Ajoutez au moins une option pour que ce type de question fonctionne.
                </p>
              )}
              {optionsManuelles.length > 0 && (
                <p className="text-xs text-gray-400">
                  {optionsManuelles.length} option{optionsManuelles.length > 1 ? 's' : ''} — l&apos;utilisateur choisira dans cette liste.
                </p>
              )}
            </div>
          )}

          {/* Options libres (catalogue) */}
          {source === 'catalogue' && (
            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="options_libres"
                checked={optionsLibres}
                onChange={(e) => setOptionsLibres(e.target.checked)}
              />
              <label htmlFor="options_libres" className="text-sm text-gray-700">
                Autoriser une saisie libre en complément du catalogue
              </label>
              <InfoIcon tooltip="Si activé, l'utilisateur peut ajouter un produit hors-catalogue en saisissant son libellé, son prix (ponctuel) et sa catégorie. Il apparaît alors dans le panier temps réel et dans les exports SA/SP." />
            </div>
          )}

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

          <div className="border border-green-200 rounded-lg p-3 bg-green-50/50 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-green-800">Insérer une donnée dans le texte</p>
              {saSchemaLoading && <Loader2 className="w-3 h-3 animate-spin text-green-600" />}
              <InfoIcon tooltip="Ajoute automatiquement une variable dans le libellé ou la description. Choisissez une donnée SA ou une réponse SP précédente." />
            </div>
            <div className="flex gap-2">
              {([
                { value: 'sa', label: 'Données SA' },
                { value: 'sp', label: 'Réponses SP' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTextInsertSource(option.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    textInsertSource === option.value
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {textInsertSource === 'sa' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Afficher une valeur SA</label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) insertSaVariable('description', `{{sa:${e.target.value}}}`);
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                  >
                    <option value="">Ajouter dans la description…</option>
                    {saScalarPaths.map((path) => (
                      <option key={path} value={path}>{path}</option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) insertSaVariable('libelle', `{{sa:${e.target.value}}}`);
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                  >
                    <option value="">Ajouter dans le libellé…</option>
                    {saScalarPaths.map((path) => (
                      <option key={path} value={path}>{path}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600">Afficher un nombre d&apos;éléments</label>
                  <select
                    value={saCountPath}
                    onChange={(e) => {
                      setSaCountPath(e.target.value);
                      setSaCountFilterField('');
                      setSaCountFilterValue('');
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                  >
                    <option value="">1. Choisir un tableau SA…</option>
                    {Object.keys(saSchema).map((path) => (
                      <option key={path} value={path}>{path}</option>
                    ))}
                  </select>
                  <select
                    value={saCountFilterField}
                    disabled={!saCountPath}
                    onChange={(e) => {
                      setSaCountFilterField(e.target.value);
                      setSaCountFilterValue('');
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono disabled:opacity-40"
                  >
                    <option value="">2. Filtre optionnel : choisir un champ…</option>
                    {(saSchema[saCountPath] ?? []).map((field) => (
                      <option key={field} value={field}>{field}</option>
                    ))}
                  </select>
                  {saCountFilterField && (
                    (() => {
                      const values = saRealData
                        ? getSaRealFieldValues(saRealData, saCountPath, saCountFilterField)
                        : [];
                      return values.length > 0 ? (
                        <select
                          value={saCountFilterValue}
                          onChange={(e) => setSaCountFilterValue(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                        >
                          <option value="">3. Choisir une valeur…</option>
                          {values.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={saCountFilterValue}
                          onChange={(e) => setSaCountFilterValue(e.target.value)}
                          placeholder="3. Valeur du filtre… ex: mobile"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                        />
                      );
                    })()
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!saCountPath || (!!saCountFilterField && !saCountFilterValue.trim())}
                      onClick={() => insertSaCountVariable('description')}
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-40"
                    >
                      Ajouter description
                    </button>
                    <button
                      type="button"
                      disabled={!saCountPath || (!!saCountFilterField && !saCountFilterValue.trim())}
                      onClick={() => insertSaCountVariable('libelle')}
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-40"
                    >
                      Ajouter libellé
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Afficher une réponse SP</label>
                  <select
                    value=""
                    onChange={(e) => insertSpVariable('description', e.target.value, 'value')}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">Ajouter dans la description…</option>
                    {previousQuestionsForText.map((question) => (
                      <option key={question.id} value={question.id}>{question.libelle}</option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(e) => insertSpVariable('libelle', e.target.value, 'value')}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">Ajouter dans le libellé…</option>
                    {previousQuestionsForText.map((question) => (
                      <option key={question.id} value={question.id}>{question.libelle}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Afficher un nombre / comptage SP</label>
                  <select
                    value=""
                    onChange={(e) => insertSpVariable('description', e.target.value, 'count')}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">Ajouter dans la description…</option>
                    {previousCatalogueQuestionsForCount.map((question) => (
                      <option key={question.id} value={question.id}>{question.libelle}</option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(e) => insertSpVariable('libelle', e.target.value, 'count')}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    <option value="">Ajouter dans le libellé…</option>
                    {previousCatalogueQuestionsForCount.map((question) => (
                      <option key={question.id} value={question.id}>{question.libelle}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Obligatoire */}
          {affichage === 'nombre' && (
            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Suggestion affichée sur le champ nombre</label>
                <InfoIcon tooltip="Permet d’afficher une estimation issue de la SA dans une question de type nombre, sans créer automatiquement la question." />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Source de suggestion</label>
                <select
                  value={nombreConfig.suggestion_source ?? ''}
                  onChange={(e) => setNombreConfig((prev) => ({
                    ...prev,
                    suggestion_source: e.target.value
                      ? e.target.value as SpQuestionNombreConfig['suggestion_source']
                      : undefined,
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="">Aucune suggestion</option>
                  <option value="indemnite_resiliation">Indemnité de résiliation</option>
                </select>
              </div>

              {nombreConfig.suggestion_source === 'indemnite_resiliation' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={nombreConfig.afficher_estimation ?? true}
                      onChange={(e) => setNombreConfig((prev) => ({ ...prev, afficher_estimation: e.target.checked }))}
                    />
                    Afficher le montant estimé issu de la SA
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={nombreConfig.afficher_detail_calcul ?? false}
                      onChange={(e) => setNombreConfig((prev) => ({ ...prev, afficher_detail_calcul: e.target.checked }))}
                    />
                    Afficher le détail de calcul et les informations manquantes
                  </label>
                  <p className="text-xs text-gray-500">
                    La saisie vendeur reste prioritaire et pourra alimenter `sp_total_indemnites` via une conséquence `renseigner_variable`.
                  </p>
                </div>
              )}
            </div>
          )}

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

                {/* Déclencheur conditionnel (optionnel pour tous les types) */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0 whitespace-nowrap">Si la réponse est (optionnel) :</label>
                  <input
                    value={cons.valeur_declencheur ?? ''}
                    onChange={(e) => updateConsequence(ci, { valeur_declencheur: e.target.value || undefined })}
                    placeholder="Ex : Oui, Non, Orange… (vide = toujours)"
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                  />
                </div>

                {cons.type === 'renseigner_variable' && (
                  <div className="space-y-2">
                    {(() => {
                      const selectedVariable = [...templateStandardVariables, ...templateCustomVariables, ...previousQuestionVariables, ...selectedQuestionVariables]
                        .find((v) => v.key === cons.variable_cible);
                      const canRename = !!cons.variable_cible && selectedVariable?.group !== 'standard';
                      return (
                        <>
                    <div className="flex gap-2">
                      <select
                        value={cons.variable_cible ?? ''}
                        onChange={(e) => {
                          if (e.target.value === '__create__') {
                            setShowCreateVar(ci);
                          } else {
                            updateConsequence(ci, { variable_cible: e.target.value });
                          }
                        }}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                      >
                        <option value="">-- Sélectionner une variable --</option>
                        {(previousQuestionVariables.length > 0 || selectedQuestionVariables.length > 0) && (
                          <optgroup label="Variables des questions">
                            {[...previousQuestionVariables, ...selectedQuestionVariables].map((v) => (
                              <option key={v.key} value={v.key}>{v.label}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Variables standard">
                          {templateStandardVariables.map((v) => (
                            <option key={v.key} value={v.key}>{v.key}</option>
                          ))}
                        </optgroup>
                        {templateCustomVariables.length > 0 && (
                          <optgroup label="Variables custom">
                            {templateCustomVariables.map((v) => (
                              <option key={v.key} value={v.key}>{v.label}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="─────────────">
                          <option value="__create__">＋ Créer une nouvelle variable…</option>
                        </optgroup>
                      </select>
                      {cons.variable_cible && (
                        <code className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded whitespace-nowrap">
                          {`{{${cons.variable_cible}}}`}
                        </code>
                      )}
                    </div>

                    {canRename && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startRenameVariable(ci, cons.variable_cible!, selectedVariable?.label)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Renommer cette variable SP
                        </button>
                        <span className="text-[11px] text-gray-400">
                          Le renommage mettra aussi à jour les autres questions du template.
                        </span>
                      </div>
                    )}

                    {showRenameVar === ci && cons.variable_cible && (
                      <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 space-y-2">
                        <p className="text-xs font-semibold text-amber-900">Renommer la variable SP</p>
                        <input
                          value={renameVarKey}
                          onChange={(e) => setRenameVarKey(e.target.value)}
                          placeholder="Nouvelle clé (ex: sp_type_forfait_mobile)"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                        />
                        <code className="text-xs text-amber-700">{`{{${renameVarKey || cons.variable_cible}}}`}</code>
                        {renameError && (
                          <p className="text-xs text-red-600">{renameError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleRenameVariable(ci)}
                            disabled={renameSaving || !renameVarKey.trim()}
                            className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 disabled:opacity-50"
                          >
                            {renameSaving ? 'Renommage…' : 'Renommer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowRenameVar(null); setRenameVarKey(''); setRenameError(''); }}
                            className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mini-formulaire de création */}
                    {showCreateVar === ci && (
                      <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                        <p className="text-xs font-semibold text-blue-900">Nouvelle variable SP</p>
                        <div className="space-y-1">
                          <input
                            value={newVarLabel}
                            onChange={(e) => {
                              setNewVarLabel(e.target.value);
                              setNewVarKey(slugifyVar(e.target.value));
                            }}
                            placeholder="Libellé (ex: Type de fibre)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              value={newVarKey}
                              onChange={(e) => setNewVarKey(e.target.value)}
                              placeholder="Clé auto-générée"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                            />
                            <code className="text-xs text-blue-600">{`{{${newVarKey || 'sp_...'}}}`}</code>
                          </div>
                          <input
                            value={newVarDescription}
                            onChange={(e) => setNewVarDescription(e.target.value)}
                            placeholder="Description (optionnel - aide l'IA et l'utilisateur)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCreateVariable(ci)}
                            disabled={creatingSaving || !newVarLabel.trim()}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                          >
                            {creatingSaving ? 'Création…' : 'Créer'}
                          </button>
                          <button
                            onClick={() => { setShowCreateVar(null); setNewVarLabel(''); setNewVarKey(''); setNewVarDescription(''); }}
                            className="px-2 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>
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

                {cons.type === 'filtrer_question' && cons.question_id && (
                  <div className="border border-amber-100 rounded-lg p-2 bg-amber-50/50 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-gray-700">Filtre à appliquer</p>
                      <InfoIcon tooltip="Quand cette réponse est donnée, le catalogue de la question cible sera filtré selon ces critères." />
                    </div>
                    <FiltreCatalogueUI
                      filtre={cons.filtre ?? {}}
                      onChange={(f) => updateConsequence(ci, {
                        filtre: (f.categories?.length || f.type_facturation || f.produits_ids?.length) ? f : undefined,
                      })}
                      allProduits={allProduits}
                      colorScheme="amber"
                    />
                  </div>
                )}

                {cons.type === 'afficher_message' && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Message à afficher dans le chat</label>
                    <textarea
                      value={cons.message_texte ?? ''}
                      onChange={(e) => updateConsequence(ci, { message_texte: e.target.value || undefined })}
                      placeholder="Ex : Demander confirmation avant."
                      rows={2}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-none"
                    />
                  </div>
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
                        value={boucle.source_sa_array !== undefined ? '__sa_array__' : (boucle.source_nombre_question_id ?? '__fixe__')}
                        onChange={(e) => {
                          if (e.target.value === '__fixe__') {
                            setBoucle((p) => ({ ...p, source_nombre_question_id: undefined, source_sa_array: undefined, source_sa_label_champ: undefined, nombre_fixe: p.nombre_fixe ?? 2 }));
                          } else if (e.target.value === '__sa_array__') {
                            setBoucle((p) => ({ ...p, source_nombre_question_id: undefined, nombre_fixe: undefined, source_sa_array: p.source_sa_array ?? '' }));
                          } else {
                            setBoucle((p) => ({ ...p, source_nombre_question_id: e.target.value, nombre_fixe: undefined, source_sa_array: undefined, source_sa_label_champ: undefined }));
                          }
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                      >
                        <option value="__fixe__">Nombre fixe</option>
                        <option value="__sa_array__">Tableau SA</option>
                        {otherQuestions.filter((q) => q.affichage === 'nombre').map((q) => (
                          <option key={q.id} value={q.id}>
                            Réponse à : {q.libelle.length > 40 ? q.libelle.slice(0, 40) + '…' : q.libelle}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!boucle.source_nombre_question_id && !boucle.source_sa_array && (
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

                    {boucle.source_sa_array !== undefined && (
                      <div className="space-y-2 border border-green-200 rounded p-2 bg-green-50/50">

                        {/* a) Chemin SA */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs font-medium text-gray-600">Tableau SA</label>
                            {saSchemaLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                          </div>
                          <select
                            value={boucle.source_sa_array ?? ''}
                            onChange={(e) => setBoucle((p) => ({
                              ...p,
                              source_sa_array: e.target.value || undefined,
                              source_sa_filtre_champ: undefined,
                              source_sa_filtre_valeur: undefined,
                              source_sa_label_champ: undefined,
                            }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                          >
                            <option value="">Choisir un tableau…</option>
                            {Object.keys(saSchema).map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>

                        {/* b) Filtrer sur */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600">
                            Filtrer sur <span className="font-normal text-gray-400">(optionnel)</span>
                          </label>
                          <select
                            value={boucle.source_sa_filtre_champ ?? ''}
                            disabled={!boucle.source_sa_array}
                            onChange={(e) => setBoucle((p) => ({
                              ...p,
                              source_sa_filtre_champ: e.target.value || undefined,
                              source_sa_filtre_valeur: undefined,
                            }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono disabled:opacity-40"
                          >
                            <option value="">Aucun filtre</option>
                            {(saSchema[boucle.source_sa_array ?? ''] ?? []).map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>

                        {/* c) Valeur du filtre */}
                        {boucle.source_sa_filtre_champ && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Valeur du filtre</label>
                            {(() => {
                              const vals = saRealData
                                ? getSaRealFieldValues(saRealData, boucle.source_sa_array ?? '', boucle.source_sa_filtre_champ)
                                : [];
                              return vals.length > 0 ? (
                                <select
                                  value={boucle.source_sa_filtre_valeur ?? ''}
                                  onChange={(e) => setBoucle((p) => ({ ...p, source_sa_filtre_valeur: e.target.value || undefined }))}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                                >
                                  <option value="">Toutes les valeurs</option>
                                  {vals.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={boucle.source_sa_filtre_valeur ?? ''}
                                  onChange={(e) => setBoucle((p) => ({ ...p, source_sa_filtre_valeur: e.target.value || undefined }))}
                                  placeholder="ex: mobile"
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                                />
                              );
                            })()}
                          </div>
                        )}

                        {/* d) Sous-champ label */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600">
                            Label de chaque itération <span className="font-normal text-gray-400">(optionnel)</span>
                          </label>
                          <select
                            value={boucle.source_sa_label_champ ?? ''}
                            disabled={!boucle.source_sa_array}
                            onChange={(e) => setBoucle((p) => ({ ...p, source_sa_label_champ: e.target.value || undefined }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono disabled:opacity-40"
                          >
                            <option value="">Aucun (préfixe numéroté)</option>
                            {(saSchema[boucle.source_sa_array ?? ''] ?? []).map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>

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

      {/* ── ASSISTANT IA ─────────────────────────────────────────────── */}
      <SpAiAssistPanel
        currentQuestion={{
          libelle,
          description,
          source,
          affichage,
          options_manuelles: optionsManuelles,
          options_libres: optionsLibres,
          filtres_catalogue: filtresCatalogue,
          groupes_conditions: groupesConditions,
          logique_declencheur: logiqueDeclencheur,
          obligatoire,
          priorite_ia: prioriteIa,
          nombre_config: nombreConfig,
          consequences,
          groupe_boucle_id: groupeBoucleId,
          boucle: boucleEnabled ? boucle : undefined,
        }}
        otherQuestions={otherQuestions}
        spVariables={spVariables}
        onApply={(patch) => {
          if (patch.libelle !== undefined) setLibelle(patch.libelle);
          if (patch.description !== undefined) setDescription(patch.description);
          if (patch.source !== undefined) {
            setSource(patch.source);
            setAffichage(AFFICHAGE_BY_SOURCE[patch.source][0].value);
          }
          if (patch.affichage !== undefined) setAffichage(patch.affichage);
          if (patch.options_manuelles !== undefined) setOptionsManuelles(patch.options_manuelles);
          if (patch.options_libres !== undefined) setOptionsLibres(patch.options_libres);
          if (patch.filtres_catalogue !== undefined) setFiltresCatalogue(patch.filtres_catalogue);
          if (patch.groupes_conditions !== undefined) setGroupesConditions(patch.groupes_conditions);
          if (patch.logique_declencheur !== undefined) setLogiqueDeclencheur(patch.logique_declencheur);
          if (patch.consequences !== undefined) setConsequences(patch.consequences);
          if (patch.obligatoire !== undefined) setObligatoire(patch.obligatoire);
          if (patch.priorite_ia !== undefined) setPrioriteIa(patch.priorite_ia);
          if (patch.groupe_boucle_id !== undefined) setGroupeBoucleId(patch.groupe_boucle_id);
          if (patch.boucle !== undefined) {
            setBoucleEnabled(true);
            setBoucle(patch.boucle);
          }
        }}
        onVariableSuggestion={(suggestion) => {
          // If a variable is suggested and exists, auto-add a renseigner_variable consequence
          if (suggestion.exists) {
            const alreadyHas = consequences.some((c) => c.type === 'renseigner_variable' && c.variable_cible === suggestion.key);
            if (!alreadyHas) {
              setConsequences((prev) => [...prev, { type: 'renseigner_variable', variable_cible: suggestion.key }]);
            }
          }
          // If doesn't exist, pre-fill the create form for when user goes to Bloc 4
          if (!suggestion.exists) {
            setNewVarLabel(suggestion.label);
            setNewVarKey(suggestion.key);
            setNewVarDescription(suggestion.description ?? '');
          }
        }}
      />

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
