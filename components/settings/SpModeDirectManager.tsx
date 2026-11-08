'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Zap, Info, Layers, Percent } from 'lucide-react';
import type {
  PropositionTemplate,
  SpBandeauFlottantChamp,
  SpConfigModeDirect,
  SpLibellesConfig,
  WordConfig,
} from '@/types';
import { supportsSp } from '@/lib/templates/supportsSp';
import { resolveLibelle, SP_LIBELLES_DEFAUT } from '@/lib/sp/libelles';

export const DEFAULT_CHAMPS_BANDEAU_FLOTTANT: SpBandeauFlottantChamp[] = [
  'total_mensuel',
  'fas',
  'indemnites',
  'marge',
  'montant_annee_lissee',
  'base_loyer',
  'loyer_mensuel',
  'montant_finance',
];

export const ALL_BANDEAU_FLOTTANT_CHAMPS: {
  key: SpBandeauFlottantChamp;
  defaultExplanation: string;
}[] = [
  { key: 'total_mensuel', defaultExplanation: 'Total Abonnement' },
  { key: 'fas', defaultExplanation: 'FAS (Frais d’accès au service)' },
  { key: 'indemnites', defaultExplanation: 'Indemnités / Rachat' },
  { key: 'marge', defaultExplanation: 'Marge' },
  { key: 'montant_annee_lissee', defaultExplanation: 'Montant année lissée' },
  { key: 'base_loyer', defaultExplanation: 'Base loyer / Coût Dossier' },
  { key: 'loyer_mensuel', defaultExplanation: 'Loyer mensuel / Total Matériel' },
  { key: 'montant_finance', defaultExplanation: 'Montant financé' },
  { key: 'materiel', defaultExplanation: 'Matériel (ponctuel)' },
  { key: 'installations', defaultExplanation: 'Installations' },
  { key: 'cadeaux', defaultExplanation: 'Cadeaux / Avantages' },
  { key: 'total_ponctuel', defaultExplanation: 'Total ponctuel' },
  { key: 'remise_mois_offert', defaultExplanation: 'Remise mois offert' },
  { key: 'loyer_trimestriel', defaultExplanation: 'Loyer trimestriel' },
];

export const DEFAULT_CONFIG_MODE_DIRECT: SpConfigModeDirect = {
  actif: false,
  champs_bandeau_flottant: DEFAULT_CHAMPS_BANDEAU_FLOTTANT,
  mode_remises_operateur: 'manuel',
};

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => supportsSp(t.file_type));
}

export function getModeDirectConfig(template: PropositionTemplate | undefined): SpConfigModeDirect {
  if (!template) return DEFAULT_CONFIG_MODE_DIRECT;
  const cfg = template.file_config as WordConfig | undefined;
  const saved = cfg?.sp_config_mode_direct;
  return {
    actif: saved?.actif ?? false,
    champs_bandeau_flottant: saved?.champs_bandeau_flottant
      ? [...saved.champs_bandeau_flottant]
      : [...DEFAULT_CHAMPS_BANDEAU_FLOTTANT],
    mode_remises_operateur: saved?.mode_remises_operateur ?? 'manuel',
  };
}

interface Props {
  templates: PropositionTemplate[];
}

export function SpModeDirectManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<Record<string, SpConfigModeDirect>>({});

  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const spLibelles = (selectedTemplate?.file_config as WordConfig | undefined)?.sp_libelles as
    | SpLibellesConfig
    | undefined;

  const [config, setConfig] = useState<SpConfigModeDirect>(() =>
    getModeDirectConfig(selectedTemplate),
  );

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = wordTemplates.find((t) => t.id === id);
    setConfig(savedConfigs[id] ?? getModeDirectConfig(tmpl));
  };

  const toggleChampBandeau = (champ: SpBandeauFlottantChamp) => {
    setConfig((prev) => {
      const current = prev.champs_bandeau_flottant ?? DEFAULT_CHAMPS_BANDEAU_FLOTTANT;
      const exists = current.includes(champ);
      const next = exists ? current.filter((c) => c !== champ) : [...current, champ];
      return { ...prev, champs_bandeau_flottant: next };
    });
  };

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const resGet = await fetch(`/api/templates/${templateId}`);
      if (!resGet.ok) throw new Error('Impossible de charger le template');
      const { template } = await resGet.json();
      const existingFileConfig = (template?.file_config ?? {}) as WordConfig;

      const updatedFileConfig: WordConfig = {
        ...existingFileConfig,
        sp_config_mode_direct: config,
      };

      const resPatch = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: updatedFileConfig }),
      });
      if (!resPatch.ok) throw new Error('Erreur lors de la sauvegarde');

      setSavedConfigs((prev) => ({ ...prev, [templateId]: config }));
      toast.success('Configuration du Mode direct enregistrée');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aucun template Word ou Excel disponible. Créez d&apos;abord un template supportant la SP.
      </p>
    );
  }

  const activeChamps = config.champs_bandeau_flottant ?? DEFAULT_CHAMPS_BANDEAU_FLOTTANT;

  return (
    <div className="space-y-6">
      {/* Sélecteur de template */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Template configuré
          </label>
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {wordTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {/* Section 1 : Activation du Mode direct */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Activer le Mode direct (sans questions SP)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Lorsque ce mode est activé, le questionnaire SP est désactivé pour ce template : après
                l&apos;extraction IA des documents, vous passez directement sur le <strong>Résumé SP</strong> pour
                ajouter, modifier ou supprimer vos produits en direct avant de générer la proposition.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={config.actif}
            onClick={() => setConfig((prev) => ({ ...prev, actif: !prev.actif }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              config.actif ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                config.actif ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div
          className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            config.actif
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {config.actif
              ? 'Le Mode direct est ACTIF sur ce template : les questions SP sont désactivées et la section « Réponses au questionnaire SP » est masquée.'
              : 'Le Mode direct est DÉSACTIVÉ : ce template utilise le parcours classique avec les questions SP.'}
          </span>
        </div>
      </div>

      {/* Section 2 : Bandeau flottant compacté au scroll */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
              <Layers className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Bandeau flottant compacté au scroll
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Choisissez les champs qui restent affichés en haut de l&apos;écran lorsque vous scrollez vers le bas
                dans le Résumé SP. Les libellés personnalisés et la visibilité configurés dans l&apos;onglet
                « Libellés » sont automatiquement respectés.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                champs_bandeau_flottant: [...DEFAULT_CHAMPS_BANDEAU_FLOTTANT],
              }))
            }
          >
            Rétablir par défaut
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
          {ALL_BANDEAU_FLOTTANT_CHAMPS.map(({ key, defaultExplanation }) => {
            const checked = activeChamps.includes(key);
            const customLabel = resolveLibelle(spLibelles, key);
            const defaultLabel = SP_LIBELLES_DEFAUT[key];
            const isRenamed = customLabel !== defaultLabel;

            return (
              <label
                key={key}
                className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked
                    ? 'border-blue-300 bg-blue-50/50 text-blue-950'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChampBandeau(key)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{customLabel}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {isRenamed ? `Par défaut : ${defaultExplanation}` : defaultExplanation}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Section 3 : Gestion des remises opérateur */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
            <Percent className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Gestion des remises opérateur dans le Résumé SP
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Définissez comment les remises opérateur configurées dans l&apos;onglet « Remises » s&apos;appliquent
              aux produits éligibles du panier dans le Résumé SP.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {(
            [
              {
                value: 'manuel' as const,
                title: 'Bloc dédié avec bouton « Appliquer les remises »',
                desc: 'Affiche les produits éligibles dans le cadre Indemnités & remises avec la possibilité d’ajuster chaque prix remisé et de cliquer sur « Appliquer les remises ».',
              },
              {
                value: 'automatique' as const,
                title: 'Calcul automatique (sans rien toucher)',
                desc: 'Applique automatiquement les remises opérateur dès que les produits ajoutés au panier remplissent les conditions configurées.',
              },
            ]
          ).map(({ value, title, desc }) => {
            const selected = (config.mode_remises_operateur ?? 'manuel') === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, mode_remises_operateur: value }))}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  selected
                    ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-200'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                      selected ? 'border-emerald-600' : 'border-gray-300'
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{title}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5 ml-6 leading-relaxed">{desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
