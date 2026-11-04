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
  SpMargeOperande,
  SpMargeOperateur,
  SpLibellesConfig,
  CatalogueProduit,
  WordConfig,
} from '@/types';
import { SpConditionEditor } from './SpConditionEditor';
import {
  DEFAULT_BAREME,
  DEFAULT_COMPOSANTES_BASE_LOYER,
  DEFAULT_CONFIG_LOYER,
  DEFAULT_FORMULE_LOYER,
  DEFAULT_MULTIPLICATEUR_ANNEE_LISSEE,
} from '@/lib/sp/calculLoyer';
import { supportsSp } from '@/lib/templates/supportsSp';
import { MARGE_FORMULE_DEFAUT, MARGE_OPERANDES, validerFormuleMarge } from '@/lib/sp/calculMargeAuto';
import { resolveLibelle, SP_LIBELLES_DEFAUT } from '@/lib/sp/libelles';

interface Props {
  templates: PropositionTemplate[];
}

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => supportsSp(t.file_type));
}

function getLoyerConfig(template: PropositionTemplate | undefined): SpConfigLoyer {
  const cfg = template?.file_config as WordConfig | undefined;
  const saved = cfg?.sp_config_loyer?.baremes ? cfg.sp_config_loyer : DEFAULT_CONFIG_LOYER;
  return {
    ...saved,
    baremes: saved.baremes.map((bareme) => ({
      ...bareme,
      taux_durees: bareme.taux_durees.map((taux) => ({ ...taux })),
    })),
    mois_offerts_actifs: saved.mois_offerts_actifs ?? true,
    formule: { ...DEFAULT_FORMULE_LOYER, ...saved.formule },
    composantes_base: { ...DEFAULT_COMPOSANTES_BASE_LOYER, ...saved.composantes_base },
    mode_total_mensuel: saved.mode_total_mensuel ?? 'tout_compris',
    widget_marge: {
      mode: saved.widget_marge?.mode ?? 'manuel',
      visible_auto: saved.widget_marge?.visible_auto ?? true,
      loyer_modifiable: saved.widget_marge?.loyer_modifiable ?? false,
      operandes: [...(saved.widget_marge?.operandes ?? MARGE_FORMULE_DEFAUT.operandes)],
      operateurs: [...(saved.widget_marge?.operateurs ?? MARGE_FORMULE_DEFAUT.operateurs)],
    },
  };
}

export function SpLoyerManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedBaremes, setExpandedBaremes] = useState<Set<string>>(new Set());
  const [spQuestions, setSpQuestions] = useState<SpQuestion[]>([]);
  const [catalogueProduits, setCatalogueProduits] = useState<CatalogueProduit[]>([]);

  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const [spLibelles, setSpLibelles] = useState<SpLibellesConfig | undefined>(
    (selectedTemplate?.file_config as WordConfig | undefined)?.sp_libelles,
  );
  const [loyerConfig, setLoyerConfig] = useState<SpConfigLoyer>(() =>
    getLoyerConfig(selectedTemplate),
  );

  // Chargement questions SP + catalogue quand le template change
  useEffect(() => {
    if (!templateId) return;
    Promise.all([
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch(`/api/catalogue?template_id=${encodeURIComponent(templateId)}`).then((r) => r.json()),
      fetch(`/api/templates/${templateId}`).then((r) => r.json()),
    ]).then(([qData, cData, templateData]) => {
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setSpQuestions(qs);
      setCatalogueProduits(cData.produits ?? []);
      setSpLibelles((templateData.template?.file_config as WordConfig | undefined)?.sp_libelles);
    }).catch(() => { /* silencieux */ });
  }, [templateId]);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = wordTemplates.find((t) => t.id === id);
    setLoyerConfig(getLoyerConfig(tmpl));
    setSpLibelles((tmpl?.file_config as WordConfig | undefined)?.sp_libelles);
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
    setLoyerConfig((prev) => ({ ...prev, baremes: [...prev.baremes, newBareme] }));
    setExpandedBaremes((prev) => new Set([...prev, newBareme.id]));
  };

  const removeBareme = (id: string) => {
    setLoyerConfig((prev) => ({ ...prev, baremes: prev.baremes.filter((b) => b.id !== id) }));
    setExpandedBaremes((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const updateBareme = (id: string, patch: Partial<SpBareme>) => {
    setLoyerConfig((prev) => ({
      ...prev,
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

  const updateFormule = (patch: Partial<NonNullable<SpConfigLoyer['formule']>>) => {
    setLoyerConfig((prev) => ({
      ...prev,
      formule: { ...DEFAULT_FORMULE_LOYER, ...prev.formule, ...patch },
    }));
  };

  const toggleComposante = (key: keyof NonNullable<SpConfigLoyer['composantes_base']>) => {
    setLoyerConfig((prev) => {
      const composantes = { ...DEFAULT_COMPOSANTES_BASE_LOYER, ...prev.composantes_base };
      return {
        ...prev,
        composantes_base: { ...composantes, [key]: !composantes[key] },
      };
    });
  };

  const handleSave = async () => {
    if (!templateId || isSaving) return;
    const erreur = validerFormuleMarge(loyerConfig);
    if (erreur) { toast.error(erreur); return; }
    setIsSaving(true);
    try {
      const latest = await fetch(`/api/templates/${templateId}`).then((r) => {
        if (!r.ok) throw new Error('Erreur serveur');
        return r.json();
      });
      const currentCfg = (latest.template?.file_config ?? {}) as WordConfig;
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

  const widgetMarge = loyerConfig.widget_marge;
  const formuleErreur = validerFormuleMarge(loyerConfig);
  const updateWidgetMarge = (patch: Partial<NonNullable<SpConfigLoyer['widget_marge']>>) =>
    setLoyerConfig((prev) => ({ ...prev, widget_marge: { ...prev.widget_marge, mode: prev.widget_marge?.mode ?? 'manuel', ...patch } }));
  const operandes = widgetMarge?.operandes ?? MARGE_FORMULE_DEFAUT.operandes;
  const operateurs = widgetMarge?.operateurs ?? MARGE_FORMULE_DEFAUT.operateurs;
  const updateOperande = (index: number, value: SpMargeOperande) =>
    updateWidgetMarge({ operandes: operandes.map((key, i) => i === index ? value : key) });
  const updateOperateur = (index: number, value: SpMargeOperateur) =>
    updateWidgetMarge({ operateurs: operateurs.map((key, i) => i === index ? value : key) });

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

      {/* Durée du contrat (loyer) */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-4 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Durée du contrat</h4>
          <p className="text-xs text-gray-500 mt-1">Elle détermine le taux et le nombre de trimestres appliqués par le barème.</p>
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={loyerConfig.duree_depends_question ?? false}
            onChange={(e) =>
              setLoyerConfig((prev) => ({
                ...prev,
                duree_depends_question: e.target.checked,
              }))
            }
            className="mt-0.5"
          />
          <span>
            Déterminer la durée depuis une question SP
            <span className="block text-xs text-gray-500 font-normal mt-0.5">
              La première durée en mois trouvée dans la réponse sera utilisée.
            </span>
          </span>
        </label>

        <div className={`grid gap-4 ${loyerConfig.duree_depends_question ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
          {loyerConfig.duree_depends_question && (
            <label className="space-y-1 text-xs text-gray-600">
              <span className="block">Question SP</span>
              <select
                value={loyerConfig.duree_question_id ?? ''}
                onChange={(e) =>
                  setLoyerConfig((prev) => ({
                    ...prev,
                    duree_question_id: e.target.value || undefined,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="">Sélectionner une question</option>
                {spQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.libelle || q.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="space-y-1 text-xs text-gray-600">
            <span className="block">
              {loyerConfig.duree_depends_question ? 'Durée de secours' : 'Durée du contrat'}
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={loyerConfig.duree_mois_par_defaut ?? 63}
                onChange={(e) =>
                  setLoyerConfig((prev) => ({
                    ...prev,
                    duree_mois_par_defaut: Number(e.target.value) || 63,
                  }))
                }
                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
              <span className="text-sm text-gray-500">mois</span>
            </span>
            {loyerConfig.duree_depends_question && (
              <span className="block text-xs text-gray-500">Utilisée si la question n’a pas de réponse exploitable.</span>
            )}
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-4 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Formule du loyer</h4>
          <p className="text-xs text-gray-500 mt-1">Loyer mensuel = base financée × taux du barème ÷ diviseur.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-gray-600">
            <span className="block">Diviseur</span>
            <input
              type="number"
              min={0.0001}
              step="0.1"
              value={loyerConfig.formule?.diviseur ?? DEFAULT_FORMULE_LOYER.diviseur}
              onChange={(e) => updateFormule({ diviseur: Number(e.target.value) || 3 })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span className="block">Arrondi</span>
            <select
              value={loyerConfig.formule?.arrondi ?? DEFAULT_FORMULE_LOYER.arrondi}
              onChange={(e) => updateFormule({ arrondi: e.target.value as NonNullable<SpConfigLoyer['formule']>['arrondi'] })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="superieur">Au supérieur</option>
              <option value="standard">Au plus proche</option>
              <option value="inferieur">À l’inférieur</option>
              <option value="aucun">Aucun</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            <span className="block">Décimales</span>
            <input
              type="number"
              min={0}
              max={4}
              step={1}
              disabled={loyerConfig.formule?.arrondi === 'aucun'}
              value={loyerConfig.formule?.decimales ?? DEFAULT_FORMULE_LOYER.decimales}
              onChange={(e) => updateFormule({ decimales: Math.min(4, Math.max(0, Number(e.target.value) || 0)) })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white disabled:bg-gray-100"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Montant année lissée</h4>
          <p className="text-xs text-gray-500 mt-1">
            Montant année lissée = total mensuel des abonnements × multiplicateur. La ligne s&apos;affiche
            dans le panier une fois activée dans Questions SP → Libellés.
          </p>
        </div>
        <label className="space-y-1 text-xs text-gray-600 block max-w-[10rem]">
          <span className="block">Multiplicateur</span>
          <input
            type="number"
            min={0.0001}
            step="any"
            value={loyerConfig.multiplicateur_annee_lissee ?? DEFAULT_MULTIPLICATEUR_ANNEE_LISSEE}
            onChange={(e) => setLoyerConfig((prev) => ({
              ...prev,
              multiplicateur_annee_lissee: Number(e.target.value) > 0
                ? Number(e.target.value)
                : DEFAULT_MULTIPLICATEUR_ANNEE_LISSEE,
            }))}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
          />
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total mensuel affiché</h4>
          <p className="text-xs text-gray-500 mt-1">Montant mensuel mis en avant pour le client (badge du panier, page proposition, variable {'{{sp_total_mensuel_final}}'}).</p>
        </div>
        <select
          value={loyerConfig.mode_total_mensuel ?? 'tout_compris'}
          onChange={(e) => setLoyerConfig((prev) => ({
            ...prev,
            mode_total_mensuel: e.target.value as NonNullable<SpConfigLoyer['mode_total_mensuel']>,
          }))}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
        >
          <option value="tout_compris">Tout compris — loyer seul (abonnements en repli s’il n’y a pas de loyer)</option>
          <option value="separe">Abonnements + loyer — les deux montants sont additionnés</option>
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-4 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Base financée</h4>
          <p className="text-xs text-gray-500 mt-1">Cochez chaque composante à inclure dans la base utilisée par la formule.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={loyerConfig.mois_offerts_actifs ?? true}
            onChange={(e) => setLoyerConfig((prev) => ({ ...prev, mois_offerts_actifs: e.target.checked }))}
            className="mt-0.5"
          />
          <span>
            Inclure le financement des mois offerts
            <span className="block text-xs text-gray-500 mt-0.5">Les valeurs restent enregistrées dans les barèmes lorsque cette option est désactivée.</span>
          </span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['materiel', 'Matériel'],
            ['cadeaux', 'Cadeaux'],
            ['installations', 'Installations'],
            ['fas', 'Frais d’accès au service (FAS)'],
            ['autres_ponctuels', 'Autres éléments ponctuels'],
            ['indemnites', 'Indemnités de résiliation'],
            ['marge', 'Marge'],
            ['annee_lissee', 'Montant année lissée'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={loyerConfig.composantes_base?.[key] ?? DEFAULT_COMPOSANTES_BASE_LOYER[key] ?? true}
                onChange={() => toggleComposante(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-4 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Widget Marge &amp; Loyer</h4>
          <p className="text-xs text-gray-500 mt-1">Réglage du widget et de la marge pour ce template SP.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-800">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode-widget-marge" checked={widgetMarge?.mode !== 'automatique'} onChange={() => updateWidgetMarge({ mode: 'manuel' })} />
            Saisie manuelle
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode-widget-marge" checked={widgetMarge?.mode === 'automatique'} onChange={() => updateWidgetMarge({ mode: 'automatique' })} />
            Calcul automatique
          </label>
        </div>
        {widgetMarge?.mode === 'automatique' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={widgetMarge.visible_auto !== false} onChange={(e) => updateWidgetMarge({ visible_auto: e.target.checked })} />
              Afficher le widget Marge &amp; Loyer
            </label>
            <p className="text-xs text-gray-500">La marge est calculée même lorsque ce widget est masqué. Les champs utilisent les valeurs du panier SP, même si leurs libellés ont été renommés.</p>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={widgetMarge.loyer_modifiable === true} onChange={(e) => updateWidgetMarge({ loyer_modifiable: e.target.checked })} />
              Autoriser la modification manuelle du loyer mensuel dans le panier
            </label>
            {widgetMarge.loyer_modifiable === true && (
              <p className="text-xs text-gray-500">Le loyer saisi reste fixe quand le panier change : la marge absorbe l&apos;écart et s&apos;affiche en rouge si elle est négative.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {operandes.map((key, index) => (
                <div key={index} className="flex items-center gap-2">
                  {index > 0 && (
                    <select value={operateurs[index - 1]} onChange={(e) => updateOperateur(index - 1, e.target.value as SpMargeOperateur)} aria-label={`Opérateur ${index}`} className="h-9 rounded border border-gray-300 bg-white px-2 text-sm">
                      <option value="+">+</option><option value="-">−</option>
                      <option value="*">×</option><option value="/">÷</option>
                    </select>
                  )}
                  <select value={key} onChange={(e) => updateOperande(index, e.target.value as SpMargeOperande)} aria-label={`Champ ${index + 1}`} className="h-9 max-w-60 rounded border border-gray-300 bg-white px-2 text-sm">
                    {MARGE_OPERANDES.map((field) => (
                      <option key={field} value={field}>
                        {resolveLibelle(spLibelles, field)}
                        {' — '}{SP_LIBELLES_DEFAUT[field]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => updateWidgetMarge({ operandes: [...operandes, 'loyer_total_ponctuel'], operateurs: [...operateurs, '+'] })}>Ajouter un champ</Button>
              {operandes.length > 1 && (
                <Button type="button" variant="outline" size="sm" onClick={() => updateWidgetMarge({ operandes: operandes.slice(0, -1), operateurs: operateurs.slice(0, -1) })}>Retirer le dernier</Button>
              )}
            </div>
            {formuleErreur && <p role="alert" className="text-sm text-red-600">{formuleErreur}</p>}
          </div>
        )}
      </div>

      {/* Liste des barèmes */}
      <div className="space-y-3">
        {loyerConfig.baremes
          .slice()
          .sort((a, b) => a.ordre - b.ordre)
          .map((bareme) => {
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
                              <th className="pb-2 pr-2 font-medium">Mois offerts (loyer mensuel)</th>
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
