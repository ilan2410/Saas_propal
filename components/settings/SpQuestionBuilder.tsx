'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpQuestionSource, SpQuestionAffichage } from '@/types';

interface Props {
  templateId: string;
  onSaved: (q: SpQuestion) => void;
  onCancel: () => void;
  initial?: Partial<SpQuestion>;
}

type Block = 1 | 2 | 3 | 4;

const SOURCES: { value: SpQuestionSource; label: string; desc: string }[] = [
  { value: 'catalogue', label: 'Catalogue produits', desc: "L'IA utilise le catalogue pour proposer des choix" },
  { value: 'sa', label: 'Données SA extraites', desc: 'La question utilise les données de la situation actuelle' },
  { value: 'aucune', label: 'Aucune (saisie manuelle)', desc: "L'utilisateur saisit une réponse libre" },
  { value: 'catalogue_et_sa', label: 'Catalogue + SA combinés', desc: 'Combine les deux sources' },
];

const AFFICHAGE_BY_SOURCE: Record<SpQuestionSource, Array<{ value: SpQuestionAffichage; label: string }>> = {
  catalogue: [
    { value: 'boutons_choix_unique', label: 'Boutons choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons choix multiple' },
    { value: 'liste_deroulante', label: 'Liste déroulante' },
  ],
  sa: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'confirmation_sa', label: 'Confirmation (affiche valeur SA)' },
    { value: 'edition_sa', label: 'Édition (affiche et permet de modifier)' },
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
    { value: 'boutons_choix_unique', label: 'Boutons choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons choix multiple' },
    { value: 'confirmation_sa', label: 'Confirmation (affiche valeur SA)' },
  ],
};

export function SpQuestionBuilder({ templateId, onSaved, onCancel, initial }: Props) {
  const [activeBlock, setActiveBlock] = useState<Block>(1);
  const [source, setSource] = useState<SpQuestionSource>(initial?.source ?? 'aucune');
  const [affichage, setAffichage] = useState<SpQuestionAffichage>(initial?.affichage ?? 'texte_court');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [obligatoire, setObligatoire] = useState(initial?.obligatoire ?? true);
  const [variableCible, setVariableCible] = useState(initial?.consequences?.[0]?.variable_cible ?? '');
  const [prioriteIa, setPrioriteIa] = useState<'normale' | 'haute'>(initial?.priorite_ia ?? 'normale');
  const [isSaving, setIsSaving] = useState(false);

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
        consequences: variableCible ? [{ type: 'renseigner_variable', variable_cible: variableCible }] : [],
        template_id: templateId,
        ordre: 0,
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

  const blockComplete: Record<Block, boolean> = {
    1: !!source,
    2: true,
    3: !!affichage && !!libelle,
    4: true,
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {([1, 2, 3, 4] as Block[]).map((b) => (
          <button
            key={b}
            onClick={() => setActiveBlock(b)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeBlock === b ? 'bg-blue-600 text-white' : blockComplete[b] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
          >
            {b}. {(['Source', 'Conditions', 'Affichage', 'Résultat'] as const)[b - 1]}
          </button>
        ))}
      </div>

      {/* BLOCK 1 — SOURCE */}
      {activeBlock === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Bloc 1 — Source</h3>
          <p className="text-sm text-gray-500">Qu&apos;est-ce que l&apos;IA utilise pour répondre à cette question ?</p>
          <div className="space-y-2">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setSource(s.value);
                  setAffichage(AFFICHAGE_BY_SOURCE[s.value][0].value);
                }}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${source === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="font-medium text-sm text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setActiveBlock(2)}>Suivant →</Button>
        </div>
      )}

      {/* BLOCK 2 — CONDITIONS */}
      {activeBlock === 2 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Bloc 2 — Conditions d&apos;affichage</h3>
          <p className="text-sm text-gray-500">Quand cette question s&apos;affiche-t-elle ?</p>
          <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-sm text-gray-600">✓ Toujours afficher (par défaut)</p>
            <p className="text-xs text-gray-400 mt-1">La configuration de conditions avancées est disponible après création.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(1)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(3)}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* BLOCK 3 — AFFICHAGE */}
      {activeBlock === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Bloc 3 — Affichage</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Type d&apos;affichage</label>
            <div className="grid grid-cols-2 gap-2">
              {availableAffichages.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAffichage(a.value)}
                  className={`text-left p-2 rounded-lg border text-xs transition-colors ${affichage === a.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Libellé de la question *</label>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Quel fournisseur souhaitez-vous retenir ?"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description / aide (optionnel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aide contextuelle affichée sous la question..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="obligatoire" checked={obligatoire} onChange={(e) => setObligatoire(e.target.checked)} />
            <label htmlFor="obligatoire" className="text-sm text-gray-700">Question obligatoire</label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(2)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(4)} disabled={!libelle.trim()}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* BLOCK 4 — RÉSULTAT */}
      {activeBlock === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Bloc 4 — Résultat</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Variable SP renseignée</label>
            <input
              value={variableCible}
              onChange={(e) => setVariableCible(e.target.value)}
              placeholder="ex: sp_fournisseur_propose"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">Doit commencer par sp_. Doit être présente dans votre template Word.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Priorité pour l&apos;IA</label>
            <div className="flex gap-2">
              {(['normale', 'haute'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPrioriteIa(p)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${prioriteIa === p ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700'}`}
                >
                  {p === 'normale' ? 'Normale' : 'Haute (IA doit en tenir compte absolument)'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(3)}>← Précédent</Button>
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
          <p className="text-xs font-medium text-gray-500 mb-2">Aperçu</p>
          <p className="text-sm font-medium text-gray-900">{libelle}</p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
          <div className="flex gap-1 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{source}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{affichage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
