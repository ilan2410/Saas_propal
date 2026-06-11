'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { filterCatalogueByFiltre } from '@/lib/sp/evaluateConditions';
import type {
  SpGroupeConditions,
  SpCondition,
  SpConditionOperateur,
  SpConditionLogique,
  SpQuestion,
  CatalogueProduit,
} from '@/types';

interface Props {
  groupes: SpGroupeConditions[];
  logiqueRacine: SpConditionLogique;
  onChange: (groupes: SpGroupeConditions[], logique: SpConditionLogique) => void;
  /** All other questions in the same template (for "reponse_question" source) */
  otherQuestions: SpQuestion[];
  /** Catalogue products (for "catalogue" source) */
  catalogueProduits?: CatalogueProduit[];
  /** Enable "suggestions" source (SuggestionsSpCompletes fields) */
  enableSuggestionsSource?: boolean;
}

const OPERATEURS: { value: SpConditionOperateur; label: string }[] = [
  { value: 'egal', label: '= Égal' },
  { value: 'different', label: '≠ Différent' },
  { value: 'vide', label: 'Est vide' },
  { value: 'non_vide', label: 'N\'est pas vide' },
  { value: 'contient', label: 'Contient' },
  { value: 'ne_contient_pas', label: 'Ne contient pas' },
  { value: 'superieur', label: '> Supérieur' },
  { value: 'inferieur', label: '< Inférieur' },
  { value: 'plus_de_elements', label: '> N éléments' },
  { value: 'moins_de_elements', label: '< N éléments' },
  { value: 'element_ou', label: 'Contient un de…' },
];

const SOURCES: { value: SpCondition['source']; label: string }[] = [
  { value: 'reponse_question', label: 'Réponse à une question' },
  { value: 'catalogue', label: 'Catalogue produits' },
];

const SOURCES_WITH_SUGGESTIONS: { value: SpCondition['source']; label: string }[] = [
  ...SOURCES,
  { value: 'suggestions', label: 'Données SP calculées' },
];

const SUGGESTIONS_FIELDS: { value: string; label: string }[] = [
  { value: 'sp_est_economie',       label: 'Est une économie (Oui/Non)' },
  { value: 'sp_taux_economie_pct',  label: 'Taux d\'économie (%)' },
  { value: 'sp_economie_mensuelle', label: 'Économie mensuelle (€)' },
  { value: 'sp_economie_annuelle',  label: 'Économie annuelle (€)' },
  { value: 'sp_total_actuel',       label: 'Total actuel (€)' },
  { value: 'sp_total_propose',      label: 'Total proposé (€)' },
];

// Operators shown when source is 'catalogue' (checks if a product is selected in SP)
const CATALOGUE_OPERATEURS: { value: SpConditionOperateur; label: string }[] = [
  { value: 'non_vide', label: 'Est sélectionné dans les réponses SP' },
  { value: 'vide', label: 'N\'est pas sélectionné dans les réponses SP' },
];

const NEEDS_VALUE: SpConditionOperateur[] = [
  'egal', 'different', 'contient', 'ne_contient_pas',
  'superieur', 'inferieur', 'plus_de_elements', 'moins_de_elements', 'element_ou',
];

const QUESTION_VALUE_SELECT_OPERATORS: SpConditionOperateur[] = [
  'egal',
  'different',
  'contient',
  'ne_contient_pas',
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyCondition(): SpCondition {
  return {
    id: generateId(),
    source: 'reponse_question',
    operateur: 'egal',
    valeur: '',
  };
}

function emptyGroupe(): SpGroupeConditions {
  return {
    id: generateId(),
    conditions: [emptyCondition()],
    logique_groupe: 'ET',
  };
}

function getQuestionSelectableValues(question?: SpQuestion): string[] {
  if (!question) return [];

  if (question.affichage === 'oui_non') {
    return ['Oui', 'Non'];
  }

  if (
    question.affichage === 'boutons_choix_unique' ||
    question.affichage === 'boutons_choix_multiple' ||
    question.affichage === 'liste_deroulante' ||
    question.affichage === 'choix_liste_manuelle'
  ) {
    return (question.options_manuelles ?? []).filter(Boolean);
  }

  return [];
}

export function SpConditionEditor({ groupes, logiqueRacine, onChange, otherQuestions, catalogueProduits, enableSuggestionsSource }: Props) {
  const availableSources = enableSuggestionsSource ? SOURCES_WITH_SUGGESTIONS : SOURCES;
  const [localGroupes, setLocalGroupes] = useState<SpGroupeConditions[]>(
    groupes.length > 0 ? groupes : [],
  );
  const [localLogique, setLocalLogique] = useState<SpConditionLogique>(logiqueRacine);

  const emit = (g: SpGroupeConditions[], l: SpConditionLogique) => {
    setLocalGroupes(g);
    setLocalLogique(l);
    onChange(g, l);
  };

  const addGroupe = () => {
    emit([...localGroupes, emptyGroupe()], localLogique);
  };

  const removeGroupe = (groupeId: string) => {
    emit(localGroupes.filter((g) => g.id !== groupeId), localLogique);
  };

  const updateGroupe = (groupeId: string, patch: Partial<SpGroupeConditions>) => {
    emit(
      localGroupes.map((g) => (g.id === groupeId ? { ...g, ...patch } : g)),
      localLogique,
    );
  };

  const addCondition = (groupeId: string) => {
    updateGroupe(groupeId, {
      conditions: [
        ...(localGroupes.find((g) => g.id === groupeId)?.conditions ?? []),
        emptyCondition(),
      ],
    });
  };

  const removeCondition = (groupeId: string, condId: string) => {
    const grp = localGroupes.find((g) => g.id === groupeId);
    if (!grp) return;
    updateGroupe(groupeId, {
      conditions: grp.conditions.filter((c) => c.id !== condId),
    });
  };

  const updateCondition = (groupeId: string, condId: string, patch: Partial<SpCondition>) => {
    const grp = localGroupes.find((g) => g.id === groupeId);
    if (!grp) return;
    updateGroupe(groupeId, {
      conditions: grp.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
    });
  };

  if (localGroupes.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Aucune condition — la question s&apos;affiche toujours.</p>
        <Button size="sm" variant="outline" onClick={addGroupe}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une condition
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Root logic selector */}
      {localGroupes.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>Afficher si</span>
          <select
            value={localLogique}
            onChange={(e) => emit(localGroupes, e.target.value as SpConditionLogique)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="ET">TOUS les groupes</option>
            <option value="OU">AU MOINS UN groupe</option>
          </select>
          <span>sont vrais</span>
        </div>
      )}

      {localGroupes.map((groupe, gi) => (
        <div key={groupe.id} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs font-semibold text-gray-500">Groupe {gi + 1}</span>
              {groupe.conditions.length > 1 && (
                <select
                  value={groupe.logique_groupe ?? 'ET'}
                  onChange={(e) =>
                    updateGroupe(groupe.id, { logique_groupe: e.target.value as SpConditionLogique })
                  }
                  className="px-2 py-0.5 border border-gray-200 rounded text-xs bg-gray-50"
                >
                  <option value="ET">ET (toutes)</option>
                  <option value="OU">OU (au moins une)</option>
                </select>
              )}
            </div>
            <button
              onClick={() => removeGroupe(groupe.id)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Supprimer le groupe"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {groupe.conditions.map((cond) => (
            <div key={cond.id} className="flex flex-wrap items-center gap-2 pl-4 text-xs">
              {(() => {
                const selectedQuestion = cond.source === 'reponse_question'
                  ? otherQuestions.find((q) => q.id === cond.question_id)
                  : undefined;
                const isCatalogueQuestion = selectedQuestion?.source === 'catalogue';
                const filteredCatalogueProducts = (() => {
                  if (!isCatalogueQuestion || !catalogueProduits?.length) return [];
                  if (selectedQuestion?.filtres_catalogue) {
                    return filterCatalogueByFiltre(catalogueProduits, selectedQuestion.filtres_catalogue);
                  }
                  return catalogueProduits;
                })();
                const selectableValues = getQuestionSelectableValues(selectedQuestion);
                const useCatalogueProductSelect =
                  cond.source === 'reponse_question' &&
                  filteredCatalogueProducts.length > 0 &&
                  QUESTION_VALUE_SELECT_OPERATORS.includes(cond.operateur);
                const useSelectForValue =
                  cond.source === 'reponse_question' &&
                  !isCatalogueQuestion &&
                  selectableValues.length > 0 &&
                  QUESTION_VALUE_SELECT_OPERATORS.includes(cond.operateur);

                return (
                  <>
              {/* Source */}
              <select
                value={cond.source}
                onChange={(e) =>
                  updateCondition(groupe.id, cond.id, {
                    source: e.target.value as SpCondition['source'],
                    question_id: undefined,
                    variable_sa: undefined,
                  })
                }
                className="px-2 py-1 border border-gray-300 rounded bg-white"
              >
                {availableSources.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>

              {/* Field selector (for suggestions) */}
              {cond.source === 'suggestions' && (
                <select
                  value={cond.variable_sa ?? ''}
                  onChange={(e) =>
                    updateCondition(groupe.id, cond.id, { variable_sa: e.target.value || undefined })
                  }
                  className="px-2 py-1 border border-gray-300 rounded bg-white max-w-56"
                >
                  <option value="">-- Champ --</option>
                  {SUGGESTIONS_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              )}

              {/* Question selector (for reponse_question) */}
              {cond.source === 'reponse_question' && (
                <select
                  value={cond.question_id ?? ''}
                  onChange={(e) =>
                    updateCondition(groupe.id, cond.id, { question_id: e.target.value || undefined })
                  }
                  className="px-2 py-1 border border-gray-300 rounded bg-white max-w-48 truncate"
                >
                  <option value="">-- Question --</option>
                  {otherQuestions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.libelle.length > 40 ? q.libelle.slice(0, 40) + '…' : q.libelle}
                    </option>
                  ))}
                </select>
              )}

              {/* Produit catalogue (for catalogue) */}
              {cond.source === 'catalogue' && catalogueProduits && catalogueProduits.length > 0 ? (
                <select
                  value={cond.valeur != null ? String(cond.valeur) : ''}
                  onChange={(e) => {
                    const nom = e.target.value;
                    updateCondition(groupe.id, cond.id, {
                      valeur: nom,
                      // Build filtre_catalogue so the evaluator can match the selected product
                      filtre_catalogue: nom ? { produits_ids: [nom] } : undefined,
                      // Default to "selected" when switching catalogue product
                      operateur: ['non_vide', 'vide'].includes(cond.operateur) ? cond.operateur : 'non_vide',
                    });
                  }}
                  className="px-2 py-1 border border-gray-300 rounded bg-white max-w-56 truncate"
                >
                  <option value="">-- Produit --</option>
                  {catalogueProduits.map((p) => (
                    <option key={p.id} value={p.nom}>
                      {p.nom}{p.fournisseur ? ` (${p.fournisseur})` : ''}
                    </option>
                  ))}
                </select>
              ) : cond.source === 'catalogue' ? (
                <input
                  value={cond.valeur != null ? String(cond.valeur) : ''}
                  onChange={(e) => {
                    const nom = e.target.value;
                    updateCondition(groupe.id, cond.id, {
                      valeur: nom,
                      filtre_catalogue: nom ? { produits_ids: [nom] } : undefined,
                    });
                  }}
                  placeholder="Nom du produit"
                  className="px-2 py-1 border border-gray-300 rounded bg-white w-40"
                />
              ) : null}

              {/* Operator — limited set for catalogue source */}
              <select
                value={cond.operateur}
                onChange={(e) =>
                  updateCondition(groupe.id, cond.id, { operateur: e.target.value as SpConditionOperateur })
                }
                className="px-2 py-1 border border-gray-300 rounded bg-white"
              >
                {(cond.source === 'catalogue' ? CATALOGUE_OPERATEURS : OPERATEURS).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Value input for 'suggestions' source */}
              {NEEDS_VALUE.includes(cond.operateur) && cond.source === 'suggestions' && (
                <input
                  value={cond.valeur != null ? String(cond.valeur) : ''}
                  onChange={(e) =>
                    updateCondition(groupe.id, cond.id, { valeur: e.target.value })
                  }
                  placeholder="Valeur (ex: 15, Oui)"
                  className="px-2 py-1 border border-gray-300 rounded bg-white w-36"
                />
              )}

              {/* Value — hidden for catalogue source because the product filter drives the condition */}
              {NEEDS_VALUE.includes(cond.operateur) && cond.source !== 'catalogue' && cond.source !== 'suggestions' && (
                useCatalogueProductSelect ? (
                  <select
                    value={cond.valeur != null ? String(cond.valeur) : ''}
                    onChange={(e) =>
                      updateCondition(groupe.id, cond.id, { valeur: e.target.value })
                    }
                    className="px-2 py-1 border border-gray-300 rounded bg-white min-w-40 max-w-56"
                  >
                    <option value="">-- Produit --</option>
                    {filteredCatalogueProducts.map((p) => (
                      <option key={p.id} value={p.nom}>
                        {p.nom}{p.fournisseur ? ` (${p.fournisseur})` : ''}
                      </option>
                    ))}
                  </select>
                ) : useSelectForValue ? (
                  <select
                    value={cond.valeur != null ? String(cond.valeur) : ''}
                    onChange={(e) =>
                      updateCondition(groupe.id, cond.id, { valeur: e.target.value })
                    }
                    className="px-2 py-1 border border-gray-300 rounded bg-white min-w-40 max-w-56"
                  >
                    <option value="">-- Valeur --</option>
                    {selectableValues.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={cond.valeur != null ? String(cond.valeur) : ''}
                    onChange={(e) =>
                      updateCondition(groupe.id, cond.id, { valeur: e.target.value })
                    }
                    placeholder="Valeur"
                    className="px-2 py-1 border border-gray-300 rounded bg-white w-32"
                  />
                )
              )}

              <button
                onClick={() => removeCondition(groupe.id, cond.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
                  </>
                );
              })()}
            </div>
          ))}

          <button
            onClick={() => addCondition(groupe.id)}
            className="text-xs text-blue-600 hover:text-blue-800 pl-4 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Ajouter une condition
          </button>
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={addGroupe}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter un groupe
      </Button>
    </div>
  );
}
