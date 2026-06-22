'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { SpConditionEditor } from '@/components/settings/SpConditionEditor';
import type {
  SpClauseConditionnelle,
  SpClausePortee,
  SpClauseCollection,
  SpGroupeConditions,
  SpConditionLogique,
  SpQuestion,
  CatalogueProduit,
} from '@/types';

interface Props {
  templateId: string;
  fileConfig: Record<string, unknown>;
  onSaved: (updatedConfig: Record<string, unknown>) => void;
}

const COLLECTIONS: { value: SpClauseCollection; label: string }[] = [
  { value: 'cadeaux_produits', label: 'Cadeaux (produits du catalogue)' },
  { value: 'cadeaux_libres', label: 'Cadeaux (saisies libres)' },
  { value: 'cadeaux_tous', label: 'Cadeaux (tous)' },
  { value: 'materiel', label: 'Matériel' },
];

// Jetons disponibles selon la portée / collection (insérables dans le texte)
const TOKENS_GLOBAL = [
  'noms_cadeaux', 'noms_cadeaux_produits', 'noms_cadeaux_libres',
  'nb_cadeaux', 'nb_cadeaux_produits', 'nb_cadeaux_libres',
  'total_cadeaux', 'economie_mensuelle', 'economie_annuelle',
  'total_actuel', 'total_propose', 'fournisseur', 'nb_lignes',
];
const TOKENS_ELEMENT_CADEAU = ['nom', 'denomination', 'montant', 'valeur', 'ref'];
const TOKENS_ELEMENT_MATERIEL = ['nom', 'prix', 'montant', 'quantite', 'fournisseur', 'ref'];

function tokensFor(clause: SpClauseConditionnelle): string[] {
  if (clause.portee === 'global') return TOKENS_GLOBAL;
  return clause.collection === 'materiel' ? TOKENS_ELEMENT_MATERIEL : TOKENS_ELEMENT_CADEAU;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i')
    .replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');
}

function emptyClause(ordre: number): SpClauseConditionnelle {
  return {
    id: generateId(),
    actif: true,
    ordre,
    libelle: 'Nouvelle clause',
    cle_variable: '',
    groupes_conditions: [],
    logique_conditions: 'ET',
    portee: 'global',
    texte: '',
  };
}

export function SpClausesManager({ templateId, fileConfig, onSaved }: Props) {
  const initial = Array.isArray(fileConfig.spClausesConditionnelles)
    ? (fileConfig.spClausesConditionnelles as SpClauseConditionnelle[])
    : [];

  const [clauses, setClauses] = useState<SpClauseConditionnelle[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [spQuestions, setSpQuestions] = useState<SpQuestion[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);

  // Charge questions + catalogue pour l'éditeur de conditions
  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()).catch(() => ({})),
      fetch('/api/catalogue').then((r) => r.json()).catch(() => ({})),
    ]).then(([qData, catData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setSpQuestions(qs);
      setCatalogue(catData.produits ?? []);
    });
  }, [templateId]);

  const persist = async (updated: SpClauseConditionnelle[]) => {
    if (!templateId) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const newConfig = { ...fileConfig, spClausesConditionnelles: updated };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newConfig }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur sauvegarde');
      }
      setClauses(updated);
      onSaved(newConfig);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const update = (id: string, patch: Partial<SpClauseConditionnelle>) => {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addClause = () => {
    const maxOrdre = clauses.reduce((m, c) => Math.max(m, c.ordre), 0);
    const c = emptyClause(maxOrdre + 1);
    setClauses((prev) => [...prev, c]);
    setExpandedId(c.id);
  };

  const removeClause = (id: string) => {
    const updated = clauses.filter((c) => c.id !== id);
    setClauses(updated);
    if (expandedId === id) setExpandedId(null);
    persist(updated);
  };

  const move = (id: string, dir: 'up' | 'down') => {
    const idx = clauses.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = [...clauses];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setClauses(next.map((c, i) => ({ ...c, ordre: i + 1 })));
  };

  const insertToken = (clause: SpClauseConditionnelle, token: string) => {
    update(clause.id, { texte: `${clause.texte ?? ''}{${token}}` });
  };

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            Clauses conditionnelles
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-normal">
              {clauses.length}
            </span>
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            Phrases injectées dans le Word via <code className="bg-gray-100 px-1 rounded">{'{{sp_clause_<clé>}}'}</code>, affichées seulement si leurs conditions sont réunies.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addClause}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Nouvelle clause
          </button>
          <button
            type="button"
            onClick={() => persist(clauses)}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {saveError && <p className="text-xs text-red-600 mb-3">{saveError}</p>}

      {clauses.length === 0 && (
        <p className="text-xs text-gray-400 italic mb-3">Aucune clause conditionnelle définie.</p>
      )}

      <div className="space-y-2">
        {clauses.map((clause, idx) => {
          const isExpanded = expandedId === clause.id;
          const cle = (clause.cle_variable || slugify(clause.libelle)).trim();
          return (
            <div key={clause.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 flex-shrink-0">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-medium text-gray-800 truncate"
                  onClick={() => setExpandedId(isExpanded ? null : clause.id)}
                >
                  {clause.libelle || 'Clause sans nom'}
                  <code className="ml-2 text-xs font-mono text-indigo-600">{`{{sp_clause_${cle}}}`}</code>
                  {clause.groupes_conditions.length === 0 && (
                    <span className="ml-2 text-gray-400 font-normal text-xs">(toujours affichée)</span>
                  )}
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button type="button" onClick={() => move(clause.id, 'up')} disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(clause.id, 'down')} disabled={idx === clauses.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => update(clause.id, { actif: !clause.actif })}
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${
                      clause.actif ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {clause.actif ? 'Actif' : 'Inactif'}
                  </button>
                  <button type="button" onClick={() => removeClause(clause.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setExpandedId(isExpanded ? null : clause.id)} className="p-1 text-gray-400">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-100">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Nom interne</label>
                      <input
                        value={clause.libelle}
                        onChange={(e) => update(clause.id, { libelle: e.target.value })}
                        placeholder="Ex: Geste commercial"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">
                        Clé de variable
                        <span className="ml-1 font-normal text-gray-400">— auto depuis le nom si vide</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          value={clause.cle_variable}
                          onChange={(e) => update(clause.id, { cle_variable: slugify(e.target.value) })}
                          placeholder={slugify(clause.libelle)}
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                        />
                        <code className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 font-mono whitespace-nowrap">
                          {`{{sp_clause_${cle}}}`}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Portée</label>
                      <select
                        value={clause.portee}
                        onChange={(e) => update(clause.id, {
                          portee: e.target.value as SpClausePortee,
                          collection: e.target.value === 'par_element' ? (clause.collection ?? 'cadeaux_produits') : undefined,
                        })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                      >
                        <option value="global">Une fois (phrase groupée)</option>
                        <option value="par_element">Une fois par élément</option>
                      </select>
                    </div>
                    {clause.portee === 'par_element' && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Collection</label>
                        <select
                          value={clause.collection ?? 'cadeaux_produits'}
                          onChange={(e) => update(clause.id, { collection: e.target.value as SpClauseCollection })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                        >
                          {COLLECTIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Texte de la clause</label>
                    <div className="flex flex-wrap gap-1">
                      {tokensFor(clause).map((tok) => (
                        <button
                          key={tok}
                          type="button"
                          onClick={() => insertToken(clause, tok)}
                          className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-indigo-100 text-xs font-mono text-gray-600 border border-gray-200"
                        >
                          {`{${tok}}`}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={clause.texte}
                      onChange={(e) => update(clause.id, { texte: e.target.value })}
                      rows={2}
                      placeholder={clause.portee === 'global'
                        ? 'Ex: Geste commercial : {noms_cadeaux_produits}'
                        : 'Ex: Participation à hauteur de {montant} pour {denomination}'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">
                      Conditions d&apos;affichage
                      <span className="ml-1 font-normal text-gray-400">(vide = toujours affichée)</span>
                    </label>
                    <SpConditionEditor
                      groupes={clause.groupes_conditions}
                      logiqueRacine={clause.logique_conditions}
                      onChange={(groupes: SpGroupeConditions[], logique: SpConditionLogique) =>
                        update(clause.id, { groupes_conditions: groupes, logique_conditions: logique })
                      }
                      otherQuestions={spQuestions}
                      catalogueProduits={catalogue}
                      enableSuggestionsSource
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => persist(clauses.map((c) => (c.id === clause.id ? { ...clause, cle_variable: cle } : c)))}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Enregistrement…' : 'Enregistrer cette clause'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
