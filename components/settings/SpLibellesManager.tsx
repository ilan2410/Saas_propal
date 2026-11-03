'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PropositionTemplate, SpLibelleKey, SpLibellesConfig, WordConfig } from '@/types';
import { supportsSp } from '@/lib/templates/supportsSp';
import {
  SP_LIBELLES_DEFAUT,
  SP_LIBELLES_GROUPES,
  isLibelleVisible,
  resolveLibelle,
} from '@/lib/sp/libelles';

interface Props {
  templates: PropositionTemplate[];
}

function getLibelles(template: PropositionTemplate | undefined): SpLibellesConfig {
  const cfg = template?.file_config as WordConfig | undefined;
  return { ...(cfg?.sp_libelles ?? {}) };
}

/** Ne conserve que ce qui diffère des valeurs par défaut. */
function compacter(config: SpLibellesConfig): SpLibellesConfig {
  const out: SpLibellesConfig = {};
  for (const key of Object.keys(SP_LIBELLES_DEFAUT) as SpLibelleKey[]) {
    const label = config[key]?.label?.trim();
    const customLabel = label && label !== SP_LIBELLES_DEFAUT[key] ? label : undefined;
    const visible = isLibelleVisible(config, key);
    const defaultVisible = isLibelleVisible(undefined, key);
    if (!customLabel && visible === defaultVisible) continue;
    out[key] = {
      ...(customLabel ? { label: customLabel } : {}),
      ...(visible !== defaultVisible ? { visible } : {}),
    };
  }
  return out;
}

export function SpLibellesManager({ templates }: Props) {
  const wordTemplates = templates.filter((t) => supportsSp(t.file_type));
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const [config, setConfig] = useState<SpLibellesConfig>(() => getLibelles(selectedTemplate));

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    setConfig(getLibelles(wordTemplates.find((t) => t.id === id)));
  };

  const setLabel = (key: SpLibelleKey, label: string) =>
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], label } }));

  const setVisible = (key: SpLibelleKey, visible: boolean) =>
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], visible } }));

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const currentCfg = (selectedTemplate?.file_config ?? {}) as WordConfig;
      const compact = compacter(config);
      const newFileConfig: WordConfig = { ...currentCfg, sp_libelles: compact };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      setConfig(compact);
      toast.success('Libellés enregistrés');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">Aucun template SP trouvé. Les libellés s&apos;appliquent au panier de la Situation Proposée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-medium">Libellés du panier Situation Proposée</p>
          <p className="text-blue-700">
            Renommez chaque ligne du widget panier et choisissez si elle s&apos;affiche. Laisser le champ vide
            conserve le libellé par défaut. Masquer une ligne ne change aucun calcul. Seul l&apos;affichage dans le panier est concerné.
          </p>
        </div>
      </div>

      {wordTemplates.length > 1 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Template</label>
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="h-9 text-sm border border-gray-300 rounded-md px-3 bg-white w-full max-w-xs"
          >
            {wordTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
        </div>
      )}

      {SP_LIBELLES_GROUPES.map((groupe) => (
        <div key={groupe.titre} className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{groupe.titre}</h3>
          <div className="space-y-2">
            {groupe.cles.map((key) => {
              const visible = isLibelleVisible(config, key);
              return (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={config[key]?.label ?? ''}
                    onChange={(e) => setLabel(key, e.target.value)}
                    placeholder={SP_LIBELLES_DEFAUT[key]}
                    aria-label={`Libellé de ${SP_LIBELLES_DEFAUT[key]}`}
                    className={`h-8 flex-1 max-w-xs text-sm border border-gray-300 rounded px-2 ${visible ? '' : 'opacity-50'}`}
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visible}
                    aria-label={`Afficher ${resolveLibelle(config, key)}`}
                    onClick={() => setVisible(key, !visible)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      visible ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                        visible ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs text-gray-500 w-14">{visible ? 'Affiché' : 'Masqué'}</span>
                  {key === 'montant_finance' && (
                    <span className="text-[11px] text-gray-400">
                      Loyer × diviseur ÷ taux du barème
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
