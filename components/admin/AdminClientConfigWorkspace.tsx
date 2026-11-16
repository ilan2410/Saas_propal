'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Bot,
  Calculator,
  Percent,
  Users,
  Shield,
  Zap,
  EyeOff,
  Monitor,
  Package,
  ListOrdered,
  Type,
  Upload,
  Loader2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  CatalogueProduit,
  ClientConfigPermissions,
  Organization,
  PropositionTemplate,
  SpCustomization,
  SpQuestion,
} from '@/types';
import {
  CLIENT_CONFIG_PERMISSION_KEYS,
  resolveClientConfigPermissions,
} from '@/lib/security/client-data';
import { SpQuestionsManager } from '@/components/settings/SpQuestionsManager';
import { SpModeDirectManager } from '@/components/settings/SpModeDirectManager';
import { SpObjectifsManager } from '@/components/settings/SpObjectifsManager';
import { SpReferenceManager } from '@/components/settings/SpReferenceManager';
import { SpModeClientManager } from '@/components/settings/SpModeClientManager';
import { SpProduitPreferencesManager } from '@/components/settings/SpProduitPreferencesManager';
import { SpCategoriesOrderManager } from '@/components/settings/SpCategoriesOrderManager';
import { SpLibellesManager } from '@/components/settings/SpLibellesManager';
import { SpLoyerManager } from '@/components/settings/SpLoyerManager';
import { SpResiliationManager } from '@/components/settings/SpResiliationManager';
import { SpDiscountRulesManager } from '@/components/settings/SpDiscountRulesManager';
import { SpCodesPromoManager } from '@/components/settings/SpCodesPromoManager';
import { EquipeTab } from '@/components/client/settings/EquipeTab';

type AdminConfigTabId = 'sp-questions' | 'sp-calculs' | 'sp-remises' | 'equipe';
type CalculsSubTabId = 'loyer' | 'resiliation';
type RemisesSubTabId = 'regles_remise' | 'codes_promo';
type QuestionsSpSubTabId =
  | 'questions'
  | 'mode_direct'
  | 'objectifs'
  | 'reference'
  | 'mode_client'
  | 'apparence'
  | 'preferences_produits'
  | 'ordre_categories'
  | 'libelles';

const PERMISSION_GROUPS: Array<{
  id: string;
  title: string;
  description: string;
  items: Array<{ key: keyof ClientConfigPermissions; label: string; hint: string }>;
}> = [
  {
    id: 'templates',
    title: 'Menu principal — Templates',
    description: 'Accès aux modèles Word / Excel / PDF',
    items: [
      {
        key: 'templates',
        label: 'Onglet Templates',
        hint: 'Autorise le client à voir et modifier ses fichiers templates (en vue simplifiée).',
      },
    ],
  },
  {
    id: 'sp_situation',
    title: 'Paramètres — SP situation proposée',
    description: 'Choisissez quels sous-onglets de la Situation Proposée sont visibles par le client',
    items: [
      { key: 'sp_questions', label: 'Questions SP', hint: 'Arbre de questions, conditions et conséquences' },
      { key: 'sp_mode_direct', label: 'Mode direct', hint: 'Activation et configuration du mode direct sans questionnaire' },
      { key: 'sp_objectifs', label: 'Objectifs', hint: 'Règles et alertes d’objectifs commerciaux' },
      { key: 'sp_reference', label: 'Référence', hint: 'Format de la référence proposition (préfixe + loyer)' },
      { key: 'sp_mode_client', label: 'Mode Client', hint: 'Masquage des éléments sensibles (marge/loyer) devant le client final' },
      { key: 'sp_apparence', label: 'Apparence', hint: 'Design du questionnaire (Assistant/Chat) et fond d’écran' },
      { key: 'sp_preferences_produits', label: 'Préférences produits', hint: 'Produits favoris et réglages d’affichage produits' },
      { key: 'sp_ordre_categories', label: 'Ordre d’affichage', hint: 'Ordre des catégories et produits dans les tableaux' },
      { key: 'sp_libelles', label: 'Libellés', hint: 'Personnalisation des textes et intitulés du panier/widgets' },
    ],
  },
  {
    id: 'sp_calculs',
    title: 'Paramètres — Calculs SP',
    description: 'Formules financières et estimations de résiliation',
    items: [
      { key: 'sp_calcul_loyer', label: 'Calcul loyer & Marge', hint: 'Barèmes de leasing par durée, mois offerts et formule de marge' },
      { key: 'sp_calcul_resiliation', label: 'Calcul indemnité de résiliation', hint: 'Règles de calcul des frais de résiliation depuis la SA' },
    ],
  },
  {
    id: 'sp_remises',
    title: 'Paramètres — Remises SP',
    description: 'Règles de remises automatiques et codes promotionnels',
    items: [
      { key: 'sp_remises_operateurs', label: 'Remises opérateurs', hint: 'Règles conditionnelles de remise sur les forfaits' },
      { key: 'sp_codes_promo', label: 'Codes promo', hint: 'Création et gestion des codes promotionnels' },
    ],
  },
];

interface AdminClientConfigWorkspaceProps {
  organization: Organization;
  templates: PropositionTemplate[];
}

export function AdminClientConfigWorkspace({
  organization,
  templates,
}: AdminClientConfigWorkspaceProps) {
  const router = useRouter();
  const [configPerms, setConfigPerms] = useState<ClientConfigPermissions>(() =>
    resolveClientConfigPermissions(organization.preferences),
  );
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [showPermissionsGrid, setShowPermissionsGrid] = useState(false);

  const enabledCount = CLIENT_CONFIG_PERMISSION_KEYS.filter((k) => configPerms[k]).length;
  const totalPermsCount = CLIENT_CONFIG_PERMISSION_KEYS.length;
  const anyConfigEnabled = enabledCount > 0;

  const [activeTab, setActiveTab] = useState<AdminConfigTabId>('sp-questions');
  const [questionsSpSubTab, setQuestionsSpSubTab] = useState<QuestionsSpSubTabId>('questions');
  const [calculsSubTab, setCalculsSubTab] = useState<CalculsSubTabId>('loyer');
  const [remisesSubTab, setRemisesSubTab] = useState<RemisesSubTabId>('regles_remise');

  const initialSp: SpCustomization = organization.preferences?.sp_customization || {};
  const [spDesign, setSpDesign] = useState<'wizard' | 'chat'>(
    initialSp.questionnaire_design ?? 'wizard',
  );
  const [spBg, setSpBg] = useState<{
    type: 'none' | 'color' | 'gradient' | 'image';
    url: string;
    color: string;
    gradientFrom: string;
    gradientTo: string;
    gradientDirection: string;
    opacity: number;
    blur: number;
    overlay: number;
    position: string;
    size: 'cover' | 'contain' | 'auto' | '100% 100%';
    repeat: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  }>({
    type: initialSp.questionnaire_bg_type ?? 'none',
    url: initialSp.questionnaire_bg_url ?? '',
    color: initialSp.questionnaire_bg_color ?? '#1e3a5f',
    gradientFrom: initialSp.questionnaire_bg_gradient?.from ?? '#1e3a5f',
    gradientTo: initialSp.questionnaire_bg_gradient?.to ?? '#0d4073',
    gradientDirection: initialSp.questionnaire_bg_gradient?.direction ?? '135deg',
    opacity: initialSp.questionnaire_bg_opacity ?? 100,
    blur: initialSp.questionnaire_bg_blur ?? 0,
    overlay: initialSp.questionnaire_bg_overlay ?? 0,
    position: initialSp.questionnaire_bg_position ?? 'center',
    size: initialSp.questionnaire_bg_size ?? 'cover',
    repeat: initialSp.questionnaire_bg_repeat ?? 'no-repeat',
  });
  const [isSpBgSaving, setIsSpBgSaving] = useState(false);
  const [isSpBgUploading, setIsSpBgUploading] = useState(false);

  const [discountProducts, setDiscountProducts] = useState<CatalogueProduit[]>([]);
  const [discountQuestions, setDiscountQuestions] = useState<SpQuestion[]>([]);

  useEffect(() => {
    if (activeTab !== 'sp-remises') return;
    let cancelled = false;
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/catalogue');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data?.produits)) {
          setDiscountProducts(data.produits as CatalogueProduit[]);
        }
        const questionResults = await Promise.all(
          templates.map((template) =>
            fetch(`/api/templates/${template.id}/sp-questions`)
              .then((r) => r.json())
              .catch(() => ({ questions: [] })),
          ),
        );
        if (!cancelled) {
          setDiscountQuestions(
            questionResults.flatMap((result) => result.questions ?? []) as SpQuestion[],
          );
        }
      } catch {
        if (!cancelled) setDiscountProducts([]);
      }
    };
    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [activeTab, templates]);

  const saveClientConfigPermissions = async (nextPerms: ClientConfigPermissions, successMessage?: string) => {
    setConfigPerms(nextPerms);
    setIsSavingPerms(true);
    try {
      const res = await fetch(`/api/admin/organizations/${organization.id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_config_permissions: nextPerms }),
      });
      if (!res.ok) throw new Error('Erreur lors de la mise à jour');
      toast.success(successMessage || 'Permissions de configuration mises à jour');
      router.refresh();
    } catch {
      toast.error('Impossible de modifier ces permissions');
    } finally {
      setIsSavingPerms(false);
    }
  };

  const handleToggleSinglePermission = (key: keyof ClientConfigPermissions) => {
    const nextPerms = { ...configPerms, [key]: !configPerms[key] };
    void saveClientConfigPermissions(nextPerms);
  };

  const handleSetAllPermissions = (enabled: boolean) => {
    const nextPerms = CLIENT_CONFIG_PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = enabled;
      return acc;
    }, {} as ClientConfigPermissions);
    void saveClientConfigPermissions(
      nextPerms,
      enabled
        ? 'Toutes les permissions de configuration ont été ouvertes au client'
        : 'Mode Clé en main activé (toute la configuration est masquée au client)',
    );
  };

  const handleToggleGroupPermissions = (keys: (keyof ClientConfigPermissions)[]) => {
    const allEnabled = keys.every((k) => configPerms[k]);
    const nextPerms = { ...configPerms };
    for (const k of keys) {
      nextPerms[k] = !allEnabled;
    }
    void saveClientConfigPermissions(nextPerms);
  };

  const handleUploadSpBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Le fichier est trop volumineux (max 5MB)');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    const toastId = toast.loading("Téléchargement du fond d'écran...");
    setIsSpBgUploading(true);
    try {
      const res = await fetch('/api/settings/upload-sp-background', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Erreur upload');
      }
      const data = await res.json();
      setSpBg((prev) => ({ ...prev, url: data.bg_url, type: 'image' }));
      toast.success("Fond d'écran mis à jour", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur upload fond SP', { id: toastId });
    } finally {
      setIsSpBgUploading(false);
    }
  };

  const handleSaveSpBackground = async () => {
    if (isSpBgSaving) return;
    setIsSpBgSaving(true);
    try {
      const currentSp = organization.preferences?.sp_customization || {};
      const payload: SpCustomization = {
        ...currentSp,
        questionnaire_design: spDesign,
        questionnaire_bg_type: spBg.type,
        questionnaire_bg_url: spBg.url || undefined,
        questionnaire_bg_color: spBg.type === 'color' ? spBg.color : undefined,
        questionnaire_bg_gradient:
          spBg.type === 'gradient'
            ? {
                from: spBg.gradientFrom,
                to: spBg.gradientTo,
                direction: spBg.gradientDirection,
              }
            : undefined,
        questionnaire_bg_opacity: spBg.opacity,
        questionnaire_bg_blur: spBg.blur,
        questionnaire_bg_overlay: spBg.overlay,
        questionnaire_bg_position: spBg.position,
        questionnaire_bg_size: spBg.size,
        questionnaire_bg_repeat: spBg.repeat,
      };
      const res = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp_customization: payload }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Apparence du questionnaire enregistrée');
      router.refresh();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSpBgSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Permissions granulaires de visibilité côté client */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                anyConfigEnabled ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {anyConfigEnabled ? <Shield className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold text-gray-900">
                  Visibilité de la configuration côté client
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    anyConfigEnabled
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {anyConfigEnabled ? (
                    `${enabledCount}/${totalPermsCount} accès ouvert(s) au client`
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mode Clé en main actif (Tout masqué)
                    </>
                  )}
                </span>
                {isSavingPerms && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Choisissez précisément quels onglets et sous-onglets de configuration ce client est autorisé à voir et modifier.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPermissionsGrid((prev) => !prev)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {showPermissionsGrid ? 'Masquer le détail des permissions' : 'Gérer les permissions par onglet'}
            </button>
            {anyConfigEnabled ? (
              <button
                type="button"
                disabled={isSavingPerms}
                onClick={() => handleSetAllPermissions(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                Tout verrouiller (Mode Clé en main)
              </button>
            ) : (
              <button
                type="button"
                disabled={isSavingPerms}
                onClick={() => setShowPermissionsGrid(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Personnaliser les accès
              </button>
            )}
          </div>
        </div>

        {showPermissionsGrid && (
          <div className="pt-4 border-t border-gray-100 space-y-5">
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200">
              <span className="text-xs font-medium text-gray-600">
                Activez ou désactivez chaque élément individuellement (sauvegarde instantanée).
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isSavingPerms}
                  onClick={() => handleSetAllPermissions(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Tout cocher
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  disabled={isSavingPerms}
                  onClick={() => handleSetAllPermissions(false)}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Tout décocher
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {PERMISSION_GROUPS.map((group) => {
                const groupKeys = group.items.map((item) => item.key);
                const groupEnabledCount = groupKeys.filter((k) => configPerms[k]).length;
                const allGroupEnabled = groupEnabledCount === groupKeys.length;

                return (
                  <div
                    key={group.id}
                    className="border border-gray-200 rounded-xl p-4 bg-white space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{group.title}</h3>
                        <p className="text-xs text-gray-500">{group.description}</p>
                      </div>
                      {group.items.length > 1 && (
                        <button
                          type="button"
                          disabled={isSavingPerms}
                          onClick={() => handleToggleGroupPermissions(groupKeys)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
                        >
                          {allGroupEnabled ? 'Tout retirer' : 'Tout activer'}
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const checked = configPerms[item.key];
                        return (
                          <label
                            key={item.key}
                            className={`flex items-start justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              checked
                                ? 'bg-blue-50/60 border-blue-200'
                                : 'bg-gray-50/50 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-gray-900 block">
                                {item.label}
                              </span>
                              <span className="text-xs text-gray-500 block">{item.hint}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isSavingPerms}
                              onChange={() => handleToggleSinglePermission(item.key)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Panneau complet de configuration SP / Calculs / Remises / Équipe pour l'Admin */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50/60">
          <h2 className="text-xl font-bold text-gray-900">
            Configuration complète du client (SP, Calculs, Remises &amp; Équipe)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Paramétrez l&apos;intégralité du moteur SP et de l&apos;équipe pour{' '}
            <span className="font-semibold text-gray-900">{organization.nom}</span> directement depuis l&apos;Admin.
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('sp-questions')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sp-questions'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Bot className="w-4 h-4" />
              SP situation proposée
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sp-calculs')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sp-calculs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Calculator className="w-4 h-4" />
              Calculs SP (Loyer, Marge, Résiliation)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sp-remises')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sp-remises'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Percent className="w-4 h-4" />
              Remises &amp; Codes promo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('equipe')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'equipe'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Users className="w-4 h-4" />
              Équipe commerciale &amp; Télépros
            </button>
          </div>
        </div>

        {/* Contenu de l'onglet actif */}
        <div>
          {activeTab === 'sp-questions' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('questions')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'questions'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Questions
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('mode_direct')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'mode_direct'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Mode direct
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('objectifs')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'objectifs'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Objectifs
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('reference')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'reference'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Référence
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('mode_client')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'mode_client'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Mode Client
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('apparence')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'apparence'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Apparence
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('preferences_produits')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'preferences_produits'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  Préférences produits
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('ordre_categories')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'ordre_categories'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  Ordre d&apos;affichage
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsSpSubTab('libelles')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    questionsSpSubTab === 'libelles'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  Libellés
                </button>
              </div>

              {questionsSpSubTab === 'questions' && <SpQuestionsManager templates={templates} />}
              {questionsSpSubTab === 'mode_direct' && <SpModeDirectManager templates={templates} />}
              {questionsSpSubTab === 'objectifs' && <SpObjectifsManager templates={templates} />}
              {questionsSpSubTab === 'reference' && <SpReferenceManager templates={templates} />}
              {questionsSpSubTab === 'mode_client' && <SpModeClientManager templates={templates} />}
              {questionsSpSubTab === 'preferences_produits' && (
                <SpProduitPreferencesManager templates={templates} />
              )}
              {questionsSpSubTab === 'ordre_categories' && (
                <SpCategoriesOrderManager templates={templates} />
              )}
              {questionsSpSubTab === 'libelles' && <SpLibellesManager templates={templates} />}
              {questionsSpSubTab === 'apparence' && (
                <div className="space-y-6">
                  <div className="border border-gray-100 rounded-xl p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Design du questionnaire</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Choisissez l&apos;apparence du questionnaire SP lors de la création d&apos;une proposition.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          {
                            value: 'wizard' as const,
                            title: 'Assistant guidé',
                            desc: 'Une question à la fois, barre de progression et récapitulatif.',
                          },
                          {
                            value: 'chat' as const,
                            title: 'Conversation',
                            desc: 'Fil de discussion type messagerie, avec questions et réponses en bulles.',
                          },
                        ]
                      ).map(({ value, title, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSpDesign(value)}
                          className={`text-left rounded-lg border p-3 transition-colors ${
                            spDesign === value
                              ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-200'
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                                spDesign === value ? 'border-purple-500' : 'border-gray-300'
                              }`}
                            >
                              {spDesign === value && (
                                <span className="h-2 w-2 rounded-full bg-purple-500" />
                              )}
                            </span>
                            <span className="text-sm font-medium text-gray-800">{title}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5 ml-6">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-xl p-5 space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">
                        Fond d&apos;écran du questionnaire
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        S&apos;affiche en plein écran derrière la fenêtre du questionnaire.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">Type de fond</label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { value: 'none', label: 'Aucun' },
                            { value: 'color', label: 'Couleur unie' },
                            { value: 'gradient', label: 'Dégradé' },
                            { value: 'image', label: 'Image' },
                          ] as const
                        ).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSpBg((p) => ({ ...p, type: value }))}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                              spBg.type === value
                                ? 'bg-purple-50 text-purple-700 border-purple-300'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {spBg.type === 'color' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={spBg.color}
                          onChange={(e) => setSpBg((p) => ({ ...p, color: e.target.value }))}
                          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={spBg.color}
                          onChange={(e) => setSpBg((p) => ({ ...p, color: e.target.value }))}
                          className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono"
                        />
                      </div>
                    )}

                    {spBg.type === 'image' && (
                      <div className="flex items-center gap-3">
                        <input
                          id="admin-sp-bg-upload"
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={handleUploadSpBackground}
                        />
                        <label
                          htmlFor="admin-sp-bg-upload"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                        >
                          {isSpBgUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          {isSpBgUploading ? 'Envoi...' : 'Choisir une image'}
                        </label>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button onClick={handleSaveSpBackground} disabled={isSpBgSaving}>
                        {isSpBgSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Enregistrer l&apos;apparence
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sp-calculs' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCalculsSubTab('loyer')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    calculsSubTab === 'loyer'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Calcul loyer &amp; Marge
                </button>
                <button
                  type="button"
                  onClick={() => setCalculsSubTab('resiliation')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    calculsSubTab === 'resiliation'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Calcul indemnité de résiliation
                </button>
              </div>

              {calculsSubTab === 'loyer' ? (
                <SpLoyerManager templates={templates} />
              ) : (
                <SpResiliationManager templates={templates} />
              )}
            </div>
          )}

          {activeTab === 'sp-remises' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRemisesSubTab('regles_remise')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    remisesSubTab === 'regles_remise'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Remises opérateurs
                </button>
                <button
                  type="button"
                  onClick={() => setRemisesSubTab('codes_promo')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    remisesSubTab === 'codes_promo'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Codes promo
                </button>
              </div>

              {remisesSubTab === 'regles_remise' && (
                <SpDiscountRulesManager
                  templates={templates}
                  fallbackRules={organization.preferences?.sp_regles_remise ?? []}
                  products={discountProducts}
                  questions={discountQuestions}
                />
              )}
              {remisesSubTab === 'codes_promo' && (
                <SpCodesPromoManager
                  templates={templates}
                  fallbackConfig={{
                    codes: organization.preferences?.sp_codes_promo ?? [],
                    mode: organization.preferences?.sp_codes_promo_mode ?? 'addition',
                    masquer_saisie:
                      organization.preferences?.sp_codes_promo_masquer_saisie ?? false,
                  }}
                />
              )}
            </div>
          )}

          {activeTab === 'equipe' && (
            <EquipeTab
              isMixte={organization.secteur === 'mixte'}
              initialDefaultPermissions={{
                view_all_propositions:
                  organization.commercial_default_permissions?.view_all_propositions ?? false,
                manage_catalogue:
                  organization.commercial_default_permissions?.manage_catalogue ?? false,
                manage_templates:
                  organization.commercial_default_permissions?.manage_templates ?? false,
                view_credits_billing:
                  organization.commercial_default_permissions?.view_credits_billing ?? false,
                download_proposition:
                  organization.commercial_default_permissions?.download_proposition ?? true,
                download_comparatif_sa_sp:
                  organization.commercial_default_permissions?.download_comparatif_sa_sp ?? true,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
