'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type {
  PropositionTemplate,
  SpBareme,
  SpConfigLoyer,
  SpGroupeConditions,
  SpConditionLogique,
  SpTauxDuree,
  SpQuestion,
  CatalogueProduit,
  WordConfig,
} from '@/types';
import { SpConditionEditor } from './SpConditionEditor';
import { DEFAULT_BAREME, DEFAULT_CONFIG_LOYER } from '@/lib/sp/calculLoyer';

interface Props {
  templates: PropositionTemplate[];
}

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => t.file_type === 'word');
}

function getLoyerConfig(template: PropositionTemplate | undefined): SpConfigLoyer {
  if (!template) return DEFAULT_CONFIG_LOYER;
  const cfg = template.file_config as WordConfig | undefined;
  if (cfg?.sp_config_loyer?.baremes) return cfg.sp_config_loyer;
  return DEFAULT_CONFIG_LOYER;
}

export function SpLoyerManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedBaremes, setExpandedBaremes] = useState<Set<string>>(new Set());
  const [spQuestions, setSpQuestions] = useState<SpQuestion[]>([]);
  const [catalogueProduits, setCatalogueProduits] = useState<CatalogueProduit[]>([]);

  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const [loyerConfig, setLoyerConfig] = useState<SpConfigLoyer>(() =>
    getLoyerConfig(selectedTemplate),
  );

  // Chargement questions SP + catalogue quand le template change
  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
    ]).then(([qData, cData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setSpQuestions(qs);
      setCatalogueProduits(cData.produits ?? []);
    }).catch(() => { /* silencieux */ });
  }, [templateId]);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = wordTemplates.find((t) => t.id === id);
    setLoyerConfig(getLoyerConfig(tmpl));
    setExpandedBaremes(new Set());
  };

  const toggleExpand = (id: string) => {
    setExpandedBaremes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addBareme = () => {
    const maxOrdre = loyerConfig.baremes.reduce((m, b) => Math.max(m, b.ordre), -1);
    const newBareme: SpBareme = {
      id: crypto.randomUUID(),
      nom: 'Nouveau barème',
      ordre: maxOrdre + 1,
      taux_durees: [...DEFAULT_BAREME.taux_durees],
    };
    setLoyerConfig((prev) => ({ baremes: [...prev.baremes, newBareme] }));
    setExpandedBaremes((prev) => new Set([...prev, newBareme.id]));
  };

  const removeBareme = (id: string) => {
    setLoyerConfig((prev) => ({ baremes: prev.baremes.filter((b) => b.id !== id) }));
    setExpandedBaremes((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const updateBareme = (id: string, patch: Partial<SpBareme>) => {
    setLoyerConfig((prev) => ({
      baremes: prev.baremes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };

  const addTauxDuree = (baremeId: string) => {
    updateBareme(baremeId, {
      taux_durees: [
        ...(loyerConfig.baremes.find((b) => b.id === baremeId)?.taux_durees ?? []),
        { duree_mois: 12, taux_loyer: 0.1, mois_offerts: 0, trimestres: 4 },
      ],
    });
  };

  const updateTauxDuree = (baremeId: string, idx: number, field: keyof SpTauxDuree, value: number) => {
    const bareme = loyerConfig.baremes.find((b) => b.id === baremeId);
    if (!bareme) return;
    updateBareme(baremeId, {
      taux_durees: bareme.taux_durees.map((td, i) => (i === idx ? { ...td, [field]: value } : td)),
    });
  };

  const removeTauxDuree = (baremeId: string, idx: number) => {
    const bareme = loyerConfig.baremes.find((b) => b.id === baremeId);
    if (!bareme) return;
    updateBareme(baremeId, {
      taux_durees: bareme.taux_durees.filter((_, i) => i !== idx),
    });
  };

  const handleSave = async () => {
    if (!templateId || isSaving) return;
    setIsSaving(true);
    try {
      const currentCfg = (selectedTemplate?.file_config ?? {}) as WordConfig;
      const newFileConfig: WordConfig = { ...currentCfg, sp_config_loyer: loyerConfig };

      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Barèmes enregistrés');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aucun template Word trouvé. Créez un template Word SP pour configurer les barèmes de loyer.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sélecteur de template */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Template :</label>
        <select
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {wordTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.nom}</option>
          ))}
        </select>
      </div>

      {/* Liste des barèmes */}
      <div className="space-y-3">
        {loyerConfig.baremes
          .slice()
          .sort((a, b) => a.ordre - b.ordre)
          .map((bareme, _idx) => {
            const isOpen = expandedBaremes.has(bareme.id);
            return (
              <div key={bareme.id} className="rounded-lg border border-gray-200 overflow-hidden">
                {/* En-tête carte */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer select-none"
                  onClick={() => toggleExpand(bareme.id)}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <input
                    className="flex-1 bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
                    value={bareme.nom}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateBareme(bareme.id, { nom: e.target.value })}
                    placeholder="Nom du barème"
                  />
                  <span className="text-xs text-gray-400 shrink-0">
                    {bareme.groupes_conditions?.length
                      ? `${bareme.groupes_conditions.length} condition(s)`
                      : 'Sans condition (fallback)'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeBareme(bareme.id); }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                    title="Supprimer ce barème"
                    disabled={loyerConfig.baremes.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Contenu dépliable */}
                {isOpen && (
                  <div className="p-4 space-y-5 border-t border-gray-200">
                    {/* Conditions de déclenchement */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        Conditions de déclenchement
                      </h4>
                      <p className="text-xs text-gray-500 mb-3">
                        Sans condition, ce barème s&apos;applique en fallback (premier barème sans condition qui match).
                      </p>
                      <SpConditionEditor
                        groupes={bareme.groupes_conditions ?? []}
                        logiqueRacine={bareme.logique_declencheur ?? 'ET'}
                        onChange={(groupes: SpGroupeConditions[], logique: SpConditionLogique) =>
                          updateBareme(bareme.id, { groupes_conditions: groupes, logique_declencheur: logique })
                        }
                        otherQuestions={spQuestions}
                        catalogueProduits={catalogueProduits}
                      />
                    </div>

                    {/* Taux par durée */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Taux par durée
                        </h4>
                        <button
                          type="button"
                          onClick={() => addTauxDuree(bareme.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Plus className="w-3.5 h-3.5" /> Ajouter une durée
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b">
                              <th className="pb-2 pr-2 font-medium">Durée (mois)</th>
                              <th className="pb-2 pr-2 font-medium">Taux loyer</th>
                              <th className="pb-2 pr-2 font-medium">Mois offerts</th>
                              <th className="pb-2 pr-2 font-medium">Trimestres</th>
                              <th className="pb-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {bareme.taux_durees.map((td, tdIdx) => (
                              <tr key={tdIdx} className="border-b border-gray-100">
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="number"
                                    value={td.duree_mois}
                                    onChange={(e) => updateTauxDuree(bareme.id, tdIdx, 'duree_mois', Number(e.target.value) || 0)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </td>
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={td.taux_loyer}
                                    onChange={(e) => updateTauxDuree(bareme.id, tdIdx, 'taux_loyer', Number(e.target.value) || 0)}
                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                                  />
                                </td>
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="number"
                                    value={td.mois_offerts}
                                    onChange={(e) => updateTauxDuree(bareme.id, tdIdx, 'mois_offerts', Number(e.target.value) || 0)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </td>
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="number"
                                    value={td.trimestres}
                                    onChange={(e) => updateTauxDuree(bareme.id, tdIdx, 'trimestres', Number(e.target.value) || 0)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                </td>
                                <td className="py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => removeTauxDuree(bareme.id, tdIdx)}
                                    className="text-gray-400 hover:text-red-500"
                                    disabled={bareme.taux_durees.length <= 1}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={addBareme} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nouveau barème
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Sauvegarde...' : 'Enregistrer les barèmes'}
        </Button>
      </div>
    </div>
  );
}
