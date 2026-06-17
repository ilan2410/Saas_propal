'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EyeOff, Eye, Info } from 'lucide-react';
import type { PropositionTemplate, SpConfigModeClient, WordConfig } from '@/types';

export const DEFAULT_CONFIG_MODE_CLIENT: SpConfigModeClient = {
  actif: false,
  masquer_prix_produits: true,
  masquer_prix_confirmation: true,
  masquer_prix_remises: true,
  masquer_bouton_modifier_prix: true,
  masquer_prix_saisie_libre: true,
  texte_substitution_prix: '',
  masquer_details_marge: true,
  passer_question_marge: false,
  passer_question_code_promo: false,
  masquer_estimation_resiliation: true,
  masquer_widgets_par_defaut: true,
  afficher_indicateur_mode_client: true,
  permettre_toggle_depuis_questionnaire: true,
  permettre_edition_panier_client: false,
};

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => t.file_type === 'word');
}

function getModeClientConfig(template: PropositionTemplate | undefined): SpConfigModeClient {
  if (!template) return DEFAULT_CONFIG_MODE_CLIENT;
  const cfg = template.file_config as WordConfig | undefined;
  return cfg?.sp_config_mode_client ?? DEFAULT_CONFIG_MODE_CLIENT;
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

interface Props {
  templates: PropositionTemplate[];
}

export function SpModeClientManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate = wordTemplates.find((t) => t.id === templateId);
  const [config, setConfig] = useState<SpConfigModeClient>(() =>
    getModeClientConfig(selectedTemplate),
  );

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = wordTemplates.find((t) => t.id === id);
    setConfig(getModeClientConfig(tmpl));
  };

  const set = <K extends keyof SpConfigModeClient>(key: K, value: SpConfigModeClient[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const currentCfg = (selectedTemplate?.file_config ?? {}) as WordConfig;
      const newFileConfig: WordConfig = { ...currentCfg, sp_config_mode_client: config };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Mode client enregistré');
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
        <p className="text-sm text-amber-800">Aucun template Word trouvé. Le mode client s'applique aux templates Word SP.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bandeau explicatif */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <EyeOff className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-medium">Mode client — présentation en visio</p>
          <p className="text-blue-700">Lorsqu'il est activé, ce mode masque les informations tarifaires à l'écran partagé avec le client. Le commercial peut déplacer les widgets financiers sur son second écran (non partagé).</p>
        </div>
      </div>

      {/* Sélecteur de template */}
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

      {/* Activation globale */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Activer le mode client par défaut</p>
            <p className="text-xs text-gray-500 mt-0.5">Le mode client s'activera automatiquement à l'ouverture du questionnaire SP pour ce template.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.actif}
            onClick={() => set('actif', !config.actif)}
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
        {config.actif && (
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200">
            <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">Le mode client sera actif dès l'ouverture du questionnaire. Le commercial peut le désactiver depuis l'interface si le toggle est autorisé.</p>
          </div>
        )}
      </div>

      {/* Groupe 1 : Prix produits */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Groupe 1 — Prix des produits</h3>
        <p className="text-xs text-gray-500 mb-4">Contrôle la visibilité des tarifs dans les sélections de produits du catalogue.</p>
        <ToggleRow
          label="Masquer les prix sur les boutons produit"
          description="Cache le prix et le FAS sur les cartes/boutons du catalogue."
          checked={config.masquer_prix_produits}
          onChange={(v) => set('masquer_prix_produits', v)}
        />
        <ToggleRow
          label="Masquer les prix dans la confirmation de sélection"
          description="Cache le prix unitaire, le total et le FAS dans la zone de validation d'un produit."
          checked={config.masquer_prix_confirmation}
          onChange={(v) => set('masquer_prix_confirmation', v)}
        />
        <ToggleRow
          label="Masquer les prix des remises"
          description="Dans la question de type 'Remise produits', masque le prix remisé."
          checked={config.masquer_prix_remises}
          onChange={(v) => set('masquer_prix_remises', v)}
        />
        <ToggleRow
          label="Masquer le bouton de modification de prix (crayon)"
          description="Empêche d'afficher qu'un prix peut être modifié manuellement."
          checked={config.masquer_bouton_modifier_prix}
          onChange={(v) => set('masquer_bouton_modifier_prix', v)}
        />
        <ToggleRow
          label="Masquer le champ prix dans la saisie libre"
          description="Dans le formulaire 'Autre valeur', cache le champ de saisie du prix."
          checked={config.masquer_prix_saisie_libre}
          onChange={(v) => set('masquer_prix_saisie_libre', v)}
        />
        <div className="pt-3 flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600 shrink-0">Texte affiché à la place du prix :</label>
          <input
            type="text"
            value={config.texte_substitution_prix ?? ''}
            onChange={(e) => set('texte_substitution_prix', e.target.value)}
            placeholder="Vide = invisible"
            className="h-7 flex-1 max-w-xs text-sm border border-gray-300 rounded px-2"
          />
        </div>
      </div>

      {/* Groupe 2 : Étapes sensibles */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Groupe 2 — Étapes sensibles</h3>
        <p className="text-xs text-gray-500 mb-4">Masque ou ignore les étapes contenant des informations financières confidentielles.</p>
        <ToggleRow
          label="Masquer les détails dans la question marge"
          description="Cache la base de calcul, le loyer mensuel HT et les détails financiers. La saisie de la marge reste visible pour le commercial."
          checked={config.masquer_details_marge}
          onChange={(v) => set('masquer_details_marge', v)}
        />
        <ToggleRow
          label="Passer automatiquement la question marge"
          description="La question marge est ignorée silencieusement (marge = 0 enregistrée). Utile si la marge est définie en amont."
          checked={config.passer_question_marge}
          onChange={(v) => set('passer_question_marge', v)}
        />
        <ToggleRow
          label="Passer automatiquement la question code promo"
          description="La question code promo est ignorée silencieusement."
          checked={config.passer_question_code_promo}
          onChange={(v) => set('passer_question_code_promo', v)}
        />
        <ToggleRow
          label="Masquer l'estimation d'indemnité de résiliation"
          description="Dans la question d'indemnité, cache le bloc d'estimation du montant et de la fiabilité."
          checked={config.masquer_estimation_resiliation}
          onChange={(v) => set('masquer_estimation_resiliation', v)}
        />
      </div>

      {/* Groupe 3 : Widgets */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Groupe 3 — Widgets financiers</h3>
        <p className="text-xs text-gray-500 mb-4">Les widgets (Marge, Indemnités, Situation Actuelle, Situation Proposée) peuvent être déplacés sur le second écran du commercial (non partagé).</p>
        <ToggleRow
          label="Cacher les widgets au démarrage"
          description="Les widgets sont masqués à l'ouverture du questionnaire. Le commercial peut les afficher depuis le bouton de contrôle."
          checked={config.masquer_widgets_par_defaut}
          onChange={(v) => set('masquer_widgets_par_defaut', v)}
        />
      </div>

      {/* Groupe 4 : UX */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Groupe 4 — Interface commerciale</h3>
        <p className="text-xs text-gray-500 mb-4">Options d'affichage et de contrôle pour le commercial pendant le questionnaire.</p>
        <ToggleRow
          label="Afficher un bandeau 'Mode client actif'"
          description="Affiche un bandeau discret en haut du questionnaire lorsque le mode client est activé."
          checked={config.afficher_indicateur_mode_client}
          onChange={(v) => set('afficher_indicateur_mode_client', v)}
        />
        <ToggleRow
          label="Permettre le toggle rapide depuis le questionnaire"
          description="Affiche des boutons discrets permettant au commercial d'activer/désactiver le mode et de contrôler la visibilité des widgets en cours de session."
          checked={config.permettre_toggle_depuis_questionnaire}
          onChange={(v) => set('permettre_toggle_depuis_questionnaire', v)}
        />
        <ToggleRow
          label="Permettre l'édition des tarifs dans le panier"
          description="En mode client, le commercial peut modifier les prix, quantités et FAS directement dans le widget panier (non partagé avec le client). Le calcul se met à jour en temps réel."
          checked={config.permettre_edition_panier_client}
          onChange={(v) => set('permettre_edition_panier_client', v)}
        />
      </div>

      {/* Bouton enregistrer */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
