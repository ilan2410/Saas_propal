'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PropositionTemplate, SpLibelleKey, SpLibellesConfig, SpWidgetLibelleKey, WordConfig } from '@/types';
import { supportsSp } from '@/lib/templates/supportsSp';
import {
  SP_LIBELLES_DEFAUT,
  SP_LIBELLES_GROUPES,
  SP_WIDGET_LIBELLES_DEFAUT,
  compacterLibelles,
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

export function SpLibellesManager({ templates }: Props) {
  const wordTemplates = templates.filter((t) => supportsSp(t.file_type));
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<Record<string, SpLibellesConfig>>({});
  const editVersion = useRef(0);
  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const [config, setConfig] = useState<SpLibellesConfig>(() => getLibelles(selectedTemplate));

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    const version = editVersion.current;
    fetch(`/api/templates/${templateId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Erreur serveur');
        return r.json();
      })
      .then((data) => {
        if (!cancelled && editVersion.current === version) {
          const cfg = data.template?.file_config as WordConfig | undefined;
          setConfig({ ...(cfg?.sp_libelles ?? {}) });
        }
      })
      .catch(() => { /* Les données initiales du template restent disponibles. */ });
    return () => { cancelled = true; };
  }, [templateId]);

  const handleTemplateChange = (id: string) => {
    editVersion.current++;
    setTemplateId(id);
    setConfig(savedConfigs[id] ?? getLibelles(wordTemplates.find((t) => t.id === id)));
  };

  const setLabel = (key: SpLibelleKey, label: string) => {
    editVersion.current++;
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], label } }));
  };

  const setVisible = (key: SpLibelleKey, visible: boolean) => {
    editVersion.current++;
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], visible } }));
  };

  const setWidgetLabel = (key: SpWidgetLibelleKey, label: string) => {
    editVersion.current++;
    setConfig((prev) => ({ ...prev, widgets: { ...prev.widgets, [key]: label } }));
  };

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const latest = await fetch(`/api/templates/${templateId}`).then((r) => {
        if (!r.ok) throw new Error('Erreur serveur');
        return r.json();
      });
      const currentCfg = (latest.template?.file_config ?? {}) as WordConfig;
      const compact = compacterLibelles(config);
      const newFileConfig: WordConfig = { ...currentCfg, sp_libelles: compact };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      editVersion.current++;
      setConfig(compact);
      setSavedConfigs((prev) => ({ ...prev, [templateId]: compact }));
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
        <p className="text-sm text-amber-800">Aucun template SP trouvé. Les libellés s&apos;appliquent au panier et aux widgets de la Situation Proposée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-medium">Libellés de la Situation Proposée</p>
          <p className="text-blue-700">
            Renommez les lignes du panier et les titres des widgets. Un champ vide conserve le libellé par défaut.
            Masquer une ligne du panier ne change aucun calcul.
          </p>
        </div>
      </div>

      {wordTemplates.length > 1 && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Template</label>
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={isSaving}
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

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Titres des widgets</h3>
        <p className="text-xs text-gray-600 mb-4">Nommez les widgets flottants du questionnaire, sans modifier les libellés du panier.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['marge', 'Widget Marge & Loyer'],
            ['indemnite', 'Widget Indemnité de résiliation'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              {label}
              <input
                type="text"
                value={config.widgets?.[key] ?? ''}
                onChange={(e) => setWidgetLabel(key, e.target.value)}
                placeholder={SP_WIDGET_LIBELLES_DEFAUT[key]}
                className="h-9 w-full rounded border border-gray-300 px-2 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              />
            </label>
          ))}
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
