'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PropositionTemplate, SpConfigResiliation, WordConfig } from '@/types';
import { DEFAULT_SP_CONFIG_RESILIATION } from '@/lib/sp/resiliation';

interface Props {
  templates: PropositionTemplate[];
}

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((template) => template.file_type === 'word');
}

function getResiliationConfig(template: PropositionTemplate | undefined): SpConfigResiliation {
  if (!template) return DEFAULT_SP_CONFIG_RESILIATION;
  const config = (template.file_config as WordConfig | undefined)?.sp_config_resiliation;
  return {
    ...DEFAULT_SP_CONFIG_RESILIATION,
    ...config,
    elements_pris_en_compte: {
      ...DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte,
      ...config?.elements_pris_en_compte,
    },
  };
}

const ELEMENT_OPTIONS: Array<{
  key: keyof NonNullable<SpConfigResiliation['elements_pris_en_compte']>;
  label: string;
  description: string;
}> = [
  { key: 'lignes_mensuelles', label: 'Lignes mensuelles', description: 'Additionne les montants mensuels issus des lignes de la SA.' },
  { key: 'abonnements_mensuels', label: 'Abonnements mensuels', description: 'Ajoute les abonnements mensuels détectés dans la SA.' },
  { key: 'locations_mensuelles', label: 'Locations mensuelles', description: 'Ajoute les loyers mensuels de location si le client les inclut.' },
  { key: 'frais_resiliation_fixes', label: 'Frais fixes de résiliation', description: 'Ajoute les frais fixes de clôture ou de désactivation.' },
  { key: 'penalites', label: 'Pénalités', description: 'Ajoute les pénalités contractuelles spécifiques.' },
  { key: 'frais_materiel', label: 'Frais matériel', description: 'Ajoute les frais liés au matériel non restitué ou subventionné.' },
  { key: 'services_annexes', label: 'Services annexes', description: 'Ajoute les services additionnels inclus dans le calcul.' },
];

export function SpResiliationManager({ templates }: Props) {
  const wordTemplates = useMemo(() => getWordTemplates(templates), [templates]);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate = wordTemplates.find((template) => template.id === templateId);
  const [config, setConfig] = useState<SpConfigResiliation>(() => getResiliationConfig(selectedTemplate));

  const handleTemplateChange = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    setConfig(getResiliationConfig(wordTemplates.find((template) => template.id === nextTemplateId)));
  };

  const handleToggleElement = (key: keyof NonNullable<SpConfigResiliation['elements_pris_en_compte']>) => {
    setConfig((prev) => ({
      ...prev,
      elements_pris_en_compte: {
        ...DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte,
        ...prev.elements_pris_en_compte,
        [key]: !(prev.elements_pris_en_compte?.[key] ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.[key] ?? false),
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedTemplate || isSaving) return;
    setIsSaving(true);
    try {
      const currentConfig = (selectedTemplate.file_config ?? {}) as WordConfig;
      const nextFileConfig: WordConfig = {
        ...currentConfig,
        sp_config_resiliation: config,
      };

      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: nextFileConfig }),
      });

      if (!response.ok) throw new Error('Erreur serveur');
      toast.success('Configuration de résiliation enregistrée');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aucun template Word trouvé. Créez un template Word SP pour configurer le calcul d&apos;indemnité de résiliation.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Template :</label>
        <select
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {wordTemplates.map((template) => (
            <option key={template.id} value={template.id}>{template.nom}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {ELEMENT_OPTIONS.map((element) => {
            const checked = config.elements_pris_en_compte?.[element.key]
              ?? DEFAULT_SP_CONFIG_RESILIATION.elements_pris_en_compte?.[element.key]
              ?? false;
            return (
              <label
                key={element.key}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-white cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleElement(element.key)}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900">{element.label}</p>
                  <p className="text-xs text-gray-500">{element.description}</p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50 h-fit">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Préavis par défaut</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={config.preavis_mois_defaut ?? DEFAULT_SP_CONFIG_RESILIATION.preavis_mois_defaut ?? 3}
                onChange={(e) => setConfig((prev) => ({ ...prev, preavis_mois_defaut: Number(e.target.value) || 0 }))}
                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
              <span className="text-sm text-gray-500">mois</span>
            </div>
            <p className="text-xs text-gray-500">
              Utilisé quand la SA ne contient pas de préavis explicite.
            </p>
          </div>

          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={config.utiliser_montant_source_si_disponible ?? true}
              onChange={(e) => setConfig((prev) => ({ ...prev, utiliser_montant_source_si_disponible: e.target.checked }))}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Prioriser le montant source de la SA</p>
              <p className="text-xs text-gray-500">
                Si un montant global est déjà présent dans la SA, il reste la référence par défaut.
              </p>
            </div>
          </label>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-800">Rappel produit</p>
            <p className="text-xs text-blue-700 mt-1">
              La question SP d&apos;indemnité reste manuelle. Cette configuration sert uniquement à calculer l&apos;estimation affichable depuis la SA.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Sauvegarde...' : 'Enregistrer la configuration'}
        </Button>
      </div>
    </div>
  );
}
