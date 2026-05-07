'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PropositionData } from './PropositionWizard';
import type { SuggestionsSpCompletes, SpLigneMobile, SpLigneFixe, SpInternet, SpMateriel } from '@/types';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

type AnyLigne = SpLigneMobile | SpLigneFixe | SpInternet;

const LIGNE_HEADERS = ['Ligne', 'Produit proposé', 'Prix actuel', 'Prix proposé', 'Économie', 'Analyse', ''];

function LigneRow({
  ligne,
  onChange,
  onDelete,
}: {
  ligne: AnyLigne;
  onChange: (l: AnyLigne) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-2 py-1">
        <input
          value={ligne.sp_nom_ligne}
          onChange={(e) => onChange({ ...ligne, sp_nom_ligne: e.target.value })}
          className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={ligne.sp_produit}
          onChange={(e) => onChange({ ...ligne, sp_produit: e.target.value })}
          className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="px-2 py-1 text-xs text-gray-500 whitespace-nowrap">{ligne.sp_prix_actuel}</td>
      <td className="px-2 py-1">
        <input
          value={ligne.sp_prix_propose}
          onChange={(e) => onChange({ ...ligne, sp_prix_propose: e.target.value })}
          className="w-24 h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="px-2 py-1 text-xs font-medium text-green-700 whitespace-nowrap">{ligne.sp_economie}</td>
      <td className="px-2 py-1 text-xs text-gray-500 max-w-xs">
        <span className="truncate block">{ligne.sp_analyse}</span>
      </td>
      <td className="px-2 py-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
}

function emptyLigne(type: AnyLigne['sp_type_ligne']): AnyLigne {
  return {
    sp_nom_ligne: '',
    sp_produit: '',
    sp_prix_actuel: '0,00 €',
    sp_prix_propose: '0,00 €',
    sp_economie: '0,00 €',
    sp_analyse: '',
    sp_justification: '',
    sp_type_ligne: type,
    _prix_actuel_raw: 0,
    _prix_propose_raw: 0,
    _economie_raw: 0,
  };
}

function LigneTable({
  lignes,
  title,
  ligneType,
  onUpdate,
}: {
  lignes: AnyLigne[];
  title: string;
  ligneType: AnyLigne['sp_type_ligne'];
  onUpdate: (ls: AnyLigne[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          {title} <span className="text-gray-400 font-normal">({lignes.length})</span>
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate([...lignes, emptyLigne(ligneType)])}
          className="h-7 text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Ajouter
        </Button>
      </div>
      {lignes.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {LIGNE_HEADERS.map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <LigneRow
                  key={i}
                  ligne={l}
                  onChange={(updated) => {
                    const next = [...lignes];
                    next[i] = updated;
                    onUpdate(next);
                  }}
                  onDelete={() => onUpdate(lignes.filter((_, j) => j !== i))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Step5EditSp({ propositionData, updatePropositionData, onNext, onPrev }: Props) {
  const [sp, setSp] = useState<SuggestionsSpCompletes | null>(
    propositionData.suggestions_sp_completes ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const updateSp = useCallback((patch: Partial<SuggestionsSpCompletes>) => {
    setSp((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleValidate = async () => {
    if (!sp || !propositionData.proposition_id) {
      onNext();
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions_sp_completes: sp }),
      });
      if (!res.ok) throw new Error('Erreur sauvegarde SP');
      updatePropositionData({ suggestions_sp_completes: sp });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setIsSaving(false);
    }
  };

  if (!sp) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Validation SP</h2>
          <p className="text-gray-500 mt-1">Aucune donnée SP générée.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev}>Précédent</Button>
          <Button onClick={onNext}>Continuer</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Validation de la Situation Proposée</h2>
        <p className="text-gray-600 mt-1">
          Vérifiez et ajustez les propositions avant de générer le document final.
        </p>
      </div>

      {/* Synthèse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Économie mensuelle', value: sp.sp_economie_mensuelle },
          { label: 'Économie annuelle', value: sp.sp_economie_annuelle },
          { label: 'Total actuel', value: sp.sp_total_actuel },
          { label: 'Total proposé', value: sp.sp_total_propose },
        ].map(({ label, value }) => (
          <div key={label} className="border border-gray-200 rounded-lg p-3 text-center bg-white">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-sm font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Récurrent / Ponctuel / Loyer */}
      {(sp.sp_total_recurrent || sp.sp_total_ponctuel || sp.sp_loyer_mensuel) && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Détails financiers</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sp.sp_total_recurrent && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Total récurrent (mensuel)</p>
                <p className="text-sm font-semibold text-blue-700">{sp.sp_total_recurrent}</p>
              </div>
            )}
            {sp.sp_total_ponctuel && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Total ponctuel</p>
                <p className="text-sm font-semibold text-orange-700">{sp.sp_total_ponctuel}</p>
              </div>
            )}
            {sp.sp_remise_mois_offert && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Remise mois offerts</p>
                <p className="text-sm font-semibold text-green-700">-{sp.sp_remise_mois_offert}</p>
              </div>
            )}
            {sp.sp_loyer_mensuel && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Loyer mensuel</p>
                <p className="text-sm font-semibold text-purple-700">{sp.sp_loyer_mensuel}</p>
              </div>
            )}
            {sp.sp_loyer_trimestriel && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Loyer trimestriel</p>
                <p className="text-sm font-semibold text-purple-600">{sp.sp_loyer_trimestriel}</p>
              </div>
            )}
            {sp.sp_marge && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Marge appliquée</p>
                <p className="text-sm font-semibold text-gray-700">{sp.sp_marge}</p>
              </div>
            )}
            {sp.sp_duree_mois != null && sp.sp_duree_mois > 0 && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Durée contrat</p>
                <p className="text-sm font-semibold text-gray-700">{sp.sp_duree_mois} mois ({sp.sp_trimestres} trim.)</p>
              </div>
            )}
            {sp.sp_mois_offerts != null && sp.sp_mois_offerts > 0 && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Mois offerts</p>
                <p className="text-sm font-semibold text-green-700">{sp.sp_mois_offerts} mois</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tableaux de lignes */}
      <div className="space-y-6">
        <LigneTable
          lignes={sp.sp_lignes_mobiles as AnyLigne[]}
          title="Lignes mobiles"
          ligneType="Mobile"
          onUpdate={(ls) => updateSp({ sp_lignes_mobiles: ls as SpLigneMobile[] })}
        />
        <LigneTable
          lignes={sp.sp_lignes_fixes as AnyLigne[]}
          title="Lignes fixes"
          ligneType="Fixe"
          onUpdate={(ls) => updateSp({ sp_lignes_fixes: ls as SpLigneFixe[] })}
        />
        <LigneTable
          lignes={sp.sp_internet as AnyLigne[]}
          title="Internet"
          ligneType="Internet"
          onUpdate={(ls) => updateSp({ sp_internet: ls as SpInternet[] })}
        />
      </div>

      {/* Matériel */}
      {sp.sp_materiel.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Matériel <span className="text-gray-400 font-normal">({sp.sp_materiel.length})</span>
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateSp({
                  sp_materiel: [
                    ...sp.sp_materiel,
                    {
                      sp_materiel_nom: '',
                      sp_materiel_ref: '',
                      sp_materiel_prix_mensuel: '0,00 €',
                      sp_materiel_duree_engagement: '',
                      sp_materiel_commentaire: '',
                      sp_type_ligne: 'Materiel',
                      _prix_mensuel_raw: 0,
                    } satisfies SpMateriel,
                  ],
                })
              }
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Ajouter
            </Button>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Nom', 'Référence', 'Prix mensuel', 'Durée engagement', 'Commentaire', ''].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sp.sp_materiel.map((m, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        value={m.sp_materiel_nom}
                        onChange={(e) => {
                          const next = [...sp.sp_materiel];
                          next[i] = { ...m, sp_materiel_nom: e.target.value };
                          updateSp({ sp_materiel: next });
                        }}
                        className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={m.sp_materiel_ref ?? ''}
                        onChange={(e) => {
                          const next = [...sp.sp_materiel];
                          next[i] = { ...m, sp_materiel_ref: e.target.value };
                          updateSp({ sp_materiel: next });
                        }}
                        className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1 text-xs text-gray-500 whitespace-nowrap">{m.sp_materiel_prix_mensuel}</td>
                    <td className="px-2 py-1">
                      <input
                        value={m.sp_materiel_duree_engagement}
                        onChange={(e) => {
                          const next = [...sp.sp_materiel];
                          next[i] = { ...m, sp_materiel_duree_engagement: e.target.value };
                          updateSp({ sp_materiel: next });
                        }}
                        className="w-32 h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={m.sp_materiel_commentaire}
                        onChange={(e) => {
                          const next = [...sp.sp_materiel];
                          next[i] = { ...m, sp_materiel_commentaire: e.target.value };
                          updateSp({ sp_materiel: next });
                        }}
                        className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateSp({ sp_materiel: sp.sp_materiel.filter((_, j) => j !== i) })}
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
        <Button onClick={handleValidate} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            <>
              <ChevronRight className="w-4 h-4 mr-2" />
              Valider la SP
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
