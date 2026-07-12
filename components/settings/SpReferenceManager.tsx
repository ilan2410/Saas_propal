'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PropositionTemplate, SpConfigResumeRef, WordConfig } from '@/types';
import { supportsSp } from '@/lib/templates/supportsSp';

interface Props {
  templates: PropositionTemplate[];
}

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => supportsSp(t.file_type));
}

function getResumeRefConfig(template: PropositionTemplate | undefined): SpConfigResumeRef {
  if (!template) return { partie_fixe: '', partie_variable: null };
  const cfg = template.file_config as WordConfig | undefined;
  return cfg?.sp_config_resume_ref ?? { partie_fixe: '', partie_variable: null };
}

const PARTIE_VARIABLE_OPTIONS: { value: SpConfigResumeRef['partie_variable']; label: string }[] = [
  { value: null, label: 'Aucune' },
  { value: 'loyer_sans_marge', label: 'Loyer mensuel sans marge' },
  { value: 'loyer_avec_marge', label: 'Loyer mensuel avec marge' },
];

export function SpReferenceManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [config, setConfig] = useState<SpConfigResumeRef>(() =>
    getResumeRefConfig(wordTemplates[0]),
  );
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);

  useEffect(() => {
    setConfig(getResumeRefConfig(selectedTemplate));
  }, [templateId]);

  const handleSave = async () => {
    if (!templateId || isSaving) return;
    setIsSaving(true);
    try {
      const currentCfg = (selectedTemplate?.file_config ?? {}) as WordConfig;
      const newFileConfig: WordConfig = { ...currentCfg, sp_config_resume_ref: config };

      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Configuration de référence enregistrée');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aucun template Word trouvé. Créez un template Word SP pour configurer la référence.
      </p>
    );
  }

  const hasFixe = config.partie_fixe.trim().length > 0;
  const exempleRef =
    hasFixe
      ? config.partie_variable
        ? `${config.partie_fixe}1235`
        : config.partie_fixe
      : null;

  return (
    <div className="space-y-6">
      {/* Sélecteur de template */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Template :</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {wordTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.nom}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-4 bg-gray-50/50">
        <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
            Référence de la proposition
          </h4>
          <p className="text-sm text-gray-500">
            Configurez la référence affichée dans le popup récapitulatif (question SP de type &quot;Résumé + Référence&quot;).
            Elle n&apos;apparaît que si cette question est placée dans votre questionnaire SP.
          </p>
        </div>

        {/* Partie fixe */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Partie fixe</label>
          <p className="text-xs text-gray-400">
            Texte statique affiché en début de référence (ex : &quot;REF-2026-&quot;, &quot;PROP/&quot;…)
          </p>
          <input
            type="text"
            value={config.partie_fixe}
            onChange={(e) => setConfig({ ...config, partie_fixe: e.target.value })}
            placeholder="Ex : REF-2026-"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Partie variable */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Partie variable</label>
          <p className="text-xs text-gray-400">
            Valeur calculée dynamiquement au moment où le popup s&apos;affiche (montant du panier SP).
          </p>
          <select
            value={config.partie_variable ?? ''}
            onChange={(e) => setConfig({
              ...config,
              partie_variable: (e.target.value as SpConfigResumeRef['partie_variable']) || null,
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PARTIE_VARIABLE_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Aperçu */}
        {exempleRef && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
            <p className="text-xs text-blue-600 font-medium mb-0.5">Aperçu</p>
            <p className="text-sm text-blue-900 font-semibold">{exempleRef}</p>
            {config.partie_variable && (
              <p className="text-xs text-blue-500 mt-0.5">
                Le montant sera remplacé par la valeur réelle au moment de l&apos;affichage.
              </p>
            )}
          </div>
        )}

        {!hasFixe && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            La référence ne s&apos;affichera pas dans le popup si la partie fixe est vide.
          </p>
        )}
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Sauvegarde...' : 'Enregistrer la configuration'}
        </Button>
      </div>
    </div>
  );
}
