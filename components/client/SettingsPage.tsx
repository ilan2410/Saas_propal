'use client';

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Organization, Proposition, PropositionTemplate, StripeTransaction } from '@/types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  Building, 
  Shield, 
  Bell, 
  CreditCard, 
  Database, 
  Monitor, 
  Upload, 
  Download, 
  Table,
  Trash2, 
  Moon, 
  Sun, 
  FileText, 
  ExternalLink,
  AlertTriangle,
  Loader2,
  CheckCircle,
  CreditCard as CreditCardIcon
} from 'lucide-react';

interface SettingsPageProps {
  organization: Organization;
  userEmail: string;
  transactions: StripeTransaction[];
  propositions: Proposition[];
  templates: PropositionTemplate[];
  propositionsCount: number;
  storageUsage: number | null;
  oldestProposition: string | null;
  billingStats: {
    totalSpent: number;
    transactionCount: number;
    lastRecharge?: {
      date: string;
      amount: number;
    };
  };
}

type TabId = 'profil' | 'securite' | 'notifications' | 'facturation' | 'donnees' | 'apparence';
type NotificationKey =
  | 'email_proposition_generee'
  | 'email_recharge'
  | 'resume_hebdomadaire'
  | 'rappel_engagement';

type NotificationsPreferences = {
  alerte_credits_faibles: boolean;
  seuil_credits: number;
} & Record<NotificationKey, boolean>;

type ThemePreference = 'light' | 'dark' | 'system';
type DensityPreference = 'compact' | 'confortable';
type HomePagePreference = '/dashboard' | '/templates' | '/propositions';
type HistoryReportPeriod =
  | 'current_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'current_year'
  | 'last_year'
  | 'custom';

function buildLocalDate(yyyyMmDd: string): Date | null {
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export default function SettingsPage({ 
  organization, 
  userEmail, 
  transactions,
  propositions,
  templates,
  propositionsCount,
  oldestProposition,
  billingStats 
}: SettingsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get('tab') as TabId) || 'profil';

  const [isLoading, setIsLoading] = useState(false);
  const [isStripePortalLoading, setIsStripePortalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(currentTab);

  // Profile State
  const [profileData, setProfileData] = useState({
    nom: organization.nom || '',
    email: organization.email || userEmail,
    siret: organization.siret || '',
    adresse: organization.adresse || '',
    code_postal: organization.code_postal || '',
    ville: organization.ville || '',
    logo_url: organization.logo_url || '',
  });

  // Password State
  const [passwordData, setPasswordData] = useState({
    password: '',
    confirmPassword: '',
  });

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationsPreferences>({
    alerte_credits_faibles: organization.preferences?.notifications?.alerte_credits_faibles ?? true,
    seuil_credits: organization.preferences?.notifications?.seuil_credits ?? 10,
    email_proposition_generee: organization.preferences?.notifications?.email_proposition_generee ?? false,
    email_recharge: organization.preferences?.notifications?.email_recharge ?? true,
    resume_hebdomadaire: organization.preferences?.notifications?.resume_hebdomadaire ?? false,
    rappel_engagement: organization.preferences?.notifications?.rappel_engagement ?? false,
  });

  // Billing State
  const [billingData, setBillingData] = useState({
    nom_facturation: organization.nom_facturation || '',
    email_facturation: organization.email_facturation || '',
    adresse_ligne1_facturation: organization.adresse_ligne1_facturation || organization.adresse_facturation || '',
    adresse_ligne2_facturation: organization.adresse_ligne2_facturation || '',
    ville_facturation: organization.ville_facturation || '',
    code_postal_facturation: organization.code_postal_facturation || '',
    pays_facturation: organization.pays_facturation || 'FR',
    telephone_facturation: organization.telephone_facturation || '',
    recharge_auto: organization.preferences?.recharge_auto || {
      actif: false,
      seuil: 5,
      montant: 50
    }
  });

  // Appearance State
  const [appearance, setAppearance] = useState<{
    theme: ThemePreference;
    densite: DensityPreference;
    page_accueil: HomePagePreference;
  }>({
    theme: (organization.preferences?.theme as ThemePreference) || 'light',
    densite: (organization.preferences?.densite as DensityPreference) || 'confortable',
    page_accueil: (organization.preferences?.page_accueil as HomePagePreference) || '/dashboard',
  });

  // Modals state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showDeletePropositionsModal, setShowDeletePropositionsModal] = useState(false);
  const [isDeletingPropositions, setIsDeletingPropositions] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'all' | 'older_than_30_days' | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [isHistoryExportLoading, setIsHistoryExportLoading] = useState(false);
  const [historyReportPeriod, setHistoryReportPeriod] = useState<HistoryReportPeriod>('current_month');
  const [historyReportCustomStart, setHistoryReportCustomStart] = useState('');
  const [historyReportCustomEnd, setHistoryReportCustomEnd] = useState('');
  const [historyReportCounts, setHistoryReportCounts] = useState<{
    propositionsCount: number | null;
    transactionsCount: number | null;
    isLoading: boolean;
  }>({ propositionsCount: null, transactionsCount: null, isLoading: false });

  useEffect(() => {
    const tab = searchParams.get('tab') as TabId;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.density = appearance.densite;
  }, [appearance.theme, appearance.densite]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/settings?tab=${tab}`);
  };

  const notificationItems: Array<{ id: NotificationKey; label: string; desc: string }> = [
    {
      id: 'email_proposition_generee',
      label: 'Email à chaque proposition',
      desc: 'Recevez un email de confirmation à chaque proposition créée',
    },
    { id: 'email_recharge', label: 'Email à chaque recharge', desc: 'Confirmation de paiement par email' },
    {
      id: 'resume_hebdomadaire',
      label: 'Résumé hebdomadaire',
      desc: 'Récapitulatif de votre activité envoyé chaque lundi',
    },
    {
      id: 'rappel_engagement',
      label: "Rappel de fin d'engagement",
      desc: "Alerte quand les dates de fin d'engagement approchent",
    },
  ];

  const themeOptions: Array<{
    id: ThemePreference;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }> = [
    { id: 'light', label: 'Clair', icon: Sun },
    { id: 'dark', label: 'Sombre', icon: Moon },
    { id: 'system', label: 'Système', icon: Monitor },
  ];

  const densityOptions: Array<{ id: DensityPreference; label: string }> = [
    { id: 'compact', label: 'Compact' },
    { id: 'confortable', label: 'Confortable' },
  ];

  const setNotificationValue = (key: NotificationKey, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  // --- ACTIONS ---

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      });

      if (!res.ok) throw new Error('Erreur lors de la mise à jour');

      await res.json().catch(() => null);
      toast.success('Profil mis à jour avec succès');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du profil');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Le fichier est trop volumineux (max 2MB)');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const toastId = toast.loading('Téléchargement du logo...');

    try {
      const res = await fetch('/api/settings/upload-logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Erreur upload');

      const data = await res.json();
      setProfileData(prev => ({ ...prev, logo_url: data.logo_url }));
      toast.success('Logo mis à jour', { id: toastId });
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors du téléchargement du logo', { id: toastId });
    }
  };

  const handleUpdatePassword = async () => {
    if (passwordData.password !== passwordData.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (passwordData.password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordData.password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur inconnue');
      }
      
      toast.success('Mot de passe mis à jour');
      setPasswordData({ password: '', confirmPassword: '' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la mise à jour du mot de passe';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteAccountModal(false);
    toast.success('Demande de suppression envoyée à l\'administrateur');
  };

  const handleUpdateNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications }),
      });

      if (!res.ok) throw new Error('Erreur');
      
      toast.success('Préférences de notifications enregistrées');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateBilling = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/update-billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom_facturation: billingData.nom_facturation,
          email_facturation: billingData.email_facturation,
          telephone_facturation: billingData.telephone_facturation,
          adresse_ligne1_facturation: billingData.adresse_ligne1_facturation,
          adresse_ligne2_facturation: billingData.adresse_ligne2_facturation,
          ville_facturation: billingData.ville_facturation,
          code_postal_facturation: billingData.code_postal_facturation,
          pays_facturation: billingData.pays_facturation
        }),
      });

      // Update recharge auto preferences separately
      await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recharge_auto: billingData.recharge_auto }),
      });

      if (!res.ok) throw new Error('Erreur');
      
      toast.success('Informations de facturation enregistrées');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStripePortal = async () => {
    if (isStripePortalLoading) return;
    setIsStripePortalLoading(true);
    const toastId = toast.loading('Ouverture du portail Stripe...');

    // Ouvrir une fenêtre vide immédiatement pour éviter le blocage des pop-ups
    const newWindow = window.open('', '_blank');

    try {
      if (!newWindow) {
        throw new Error('Pop-up bloqué');
      }
      
      // Message d'attente dans la nouvelle fenêtre
      newWindow.document.write(`
        <html>
          <head>
            <title>Redirection Stripe...</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
              .container { text-align: center; }
              .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #3b82f6; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 16px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="spinner"></div>
              <p>Chargement de votre espace client Stripe...</p>
            </div>
          </body>
        </html>
      `);

      const res = await fetch('/api/stripe/customer-portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || data.error) {
        newWindow.close();
        toast.error(data?.error || 'Impossible d’ouvrir le portail Stripe', { id: toastId });
        return;
      }

      if (data.url) {
        newWindow.location.href = data.url;
        toast.success('Portail Stripe ouvert dans un nouvel onglet', { id: toastId });
        return;
      }
      
      newWindow.close();
      toast.error('URL Stripe manquante', { id: toastId });
    } catch (error) {
      if (newWindow) newWindow.close();
      toast.error('Veuillez autoriser les pop-ups pour accéder à Stripe', { id: toastId });
    } finally {
      setIsStripePortalLoading(false);
    }
  };

  const downloadResponseAsFile = async (res: Response, fallbackFileName: string) => {
    const contentDisposition = res.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)\"?/i.exec(contentDisposition);
    const headerFileName = match?.[1] ? decodeURIComponent(match[1]) : null;
    const fileName = headerFileName || fallbackFileName;

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const getHistoryReportRange = useCallback((): { start: Date; endExclusive: Date } | null => {
    const now = new Date();
    const tomorrowStart = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0), 1);

    if (historyReportPeriod === 'current_month') {
      return { start: startOfMonth(now), endExclusive: tomorrowStart };
    }
    if (historyReportPeriod === 'last_month') {
      const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0));
      const endExclusive = startOfMonth(now);
      return { start, endExclusive };
    }
    if (historyReportPeriod === 'last_3_months') {
      const start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 0, 0, 0, 0);
      return { start, endExclusive: tomorrowStart };
    }
    if (historyReportPeriod === 'last_6_months') {
      const start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0);
      return { start, endExclusive: tomorrowStart };
    }
    if (historyReportPeriod === 'current_year') {
      return { start: startOfYear(now), endExclusive: tomorrowStart };
    }
    if (historyReportPeriod === 'last_year') {
      const start = startOfYear(new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0));
      const endExclusive = startOfYear(now);
      return { start, endExclusive };
    }
    if (historyReportPeriod === 'custom') {
      const start = buildLocalDate(historyReportCustomStart);
      const end = buildLocalDate(historyReportCustomEnd);
      if (!start || !end) return null;
      const endExclusive = addDays(end, 1);
      if (start.getTime() >= endExclusive.getTime()) return null;
      return { start, endExclusive };
    }
    return null;
  }, [historyReportPeriod, historyReportCustomStart, historyReportCustomEnd]);

  useEffect(() => {
    const range = getHistoryReportRange();
    if (!range) {
      setHistoryReportCounts((prev) => ({ ...prev, propositionsCount: null, transactionsCount: null, isLoading: false }));
      return;
    }

    const controller = new AbortController();
    setHistoryReportCounts((prev) => ({ ...prev, isLoading: true }));

    const run = async () => {
      try {
        const params = new URLSearchParams({
          start: range.start.toISOString(),
          end: range.endExclusive.toISOString(),
        });
        const res = await fetch(`/api/settings/export-history-stats?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHistoryReportCounts((prev) => ({ ...prev, propositionsCount: null, transactionsCount: null, isLoading: false }));
          return;
        }
        setHistoryReportCounts({
          propositionsCount: typeof data?.propositionsCount === 'number' ? data.propositionsCount : null,
          transactionsCount: typeof data?.transactionsCount === 'number' ? data.transactionsCount : null,
          isLoading: false,
        });
      } catch {
        if (controller.signal.aborted) return;
        setHistoryReportCounts((prev) => ({ ...prev, propositionsCount: null, transactionsCount: null, isLoading: false }));
      }
    };

    run();
    return () => controller.abort();
  }, [getHistoryReportRange]);

  const handleExportHistoryXlsx = async () => {
    if (isHistoryExportLoading) return;
    const range = getHistoryReportRange();
    if (!range) {
      toast.error(
        historyReportPeriod === 'custom'
          ? 'Veuillez renseigner une période valide'
          : 'Période invalide'
      );
      return;
    }
    setIsHistoryExportLoading(true);
    const toastId = toast.loading('Génération du fichier Excel...');
    try {
      const params = new URLSearchParams({
        start: range.start.toISOString(),
        end: range.endExclusive.toISOString(),
      });
      const res = await fetch(`/api/settings/export-history-xlsx?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || 'Export Excel impossible', { id: toastId });
        return;
      }
      await downloadResponseAsFile(
        res,
        `historique-propoboost-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast.success('Excel téléchargé', { id: toastId });
    } catch {
      toast.error('Erreur lors de la génération Excel', { id: toastId });
    } finally {
      setIsHistoryExportLoading(false);
    }
  };

  const handleDeletePropositions = async (mode: 'all' | 'older_than_30_days') => {
    setIsDeletingPropositions(true);
    try {
      const res = await fetch('/api/settings/delete-propositions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success(`${data.deleted_count} propositions supprimées`);
      setShowDeletePropositionsModal(false);
      setDeleteConfirmText('');
      setDeleteMode(null);
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setIsDeletingPropositions(false);
    }
  };

  const handleUpdateAppearance = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appearance),
      });

      if (!res.ok) throw new Error('Erreur');
      
      toast.success('Préférences d\'apparence enregistrées');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER HELPERS ---

  const TabButton = ({
    id,
    label,
    icon: Icon,
  }: {
    id: TabId;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }) => (
    <button
      onClick={() => handleTabChange(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        activeTab === id 
          ? 'bg-blue-50 text-blue-700 border-blue-200 border' 
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const maxPropositions = 15;
  const clampedPropositionsCount = Math.min(Math.max(propositionsCount, 0), maxPropositions);
  const propositionsProgress = Math.round((clampedPropositionsCount / maxPropositions) * 100);
  const propositionsProgressColor =
    clampedPropositionsCount < 10 ? 'bg-blue-600' : clampedPropositionsCount < 14 ? 'bg-orange-500' : 'bg-red-600';

  const activeTemplatesCount = templates.filter((t) => t.statut === 'actif').length;
  const totalExportablesCount = propositions.length + transactions.length;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const olderThan30DaysCount = propositions.filter((p) => new Date(p.created_at).getTime() < cutoffDate.getTime()).length;

  const pendingDeleteCount =
    deleteMode === 'all' ? propositionsCount : deleteMode === 'older_than_30_days' ? olderThan30DaysCount : 0;

  const formatShortDate = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">Gérez vos préférences et les informations de votre entreprise.</p>
      </div>

      {/* Mobile Select */}
      <div className="md:hidden">
        <select 
          value={activeTab} 
          onChange={(e) => handleTabChange(e.target.value as TabId)}
          className="w-full p-2 border border-gray-300 rounded-md"
        >
          <option value="profil">Profil & Entreprise</option>
          <option value="securite">Sécurité</option>
          <option value="notifications">Notifications</option>
          <option value="facturation">Facturation</option>
          <option value="donnees">Données</option>
          <option value="apparence">Apparence</option>
        </select>
      </div>

      {/* Desktop Tabs */}
      <div className="hidden md:flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <TabButton id="profil" label="Profil & Entreprise" icon={Building} />
        <TabButton id="securite" label="Sécurité" icon={Shield} />
        <TabButton id="notifications" label="Notifications" icon={Bell} />
        <TabButton id="facturation" label="Facturation" icon={CreditCard} />
        <TabButton id="donnees" label="Données" icon={Database} />
        <TabButton id="apparence" label="Apparence" icon={Monitor} />
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm min-h-[400px]">
        
        {/* SECTION 1: PROFIL */}
        {activeTab === 'profil' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">Profil & Entreprise</h2>
              <p className="text-sm text-gray-500">Informations générales sur votre compte et votre société.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;entreprise</label>
                  <input
                    type="text"
                    value={profileData.nom}
                    onChange={(e) => setProfileData({...profileData, nom: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Modifier l&apos;email changera aussi vos identifiants de connexion.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secteur d&apos;activité</label>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {organization.secteur}
                    </span>
                    <span className="text-xs text-gray-400">Contactez l&apos;administrateur pour modifier</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                      {profileData.logo_url ? (
                        <img src={profileData.logo_url} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 font-bold text-xl">{profileData.nom.substring(0, 2).toUpperCase()}</span>
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <label htmlFor="logo-upload" className="cursor-pointer">
                          <Upload className="w-5 h-5 text-white" />
                        </label>
                      </div>
                    </div>
                    <div className="flex-1">
                      <input 
                        id="logo-upload" 
                        type="file" 
                        accept=".png,.jpg,.jpeg,.svg" 
                        className="hidden" 
                        onChange={handleUploadLogo}
                      />
                      <label 
                        htmlFor="logo-upload"
                        className="inline-block px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                      >
                        Changer le logo
                      </label>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG ou SVG. Max 2MB.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Informations légales (optionnel)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
                  <input
                    type="text"
                    value={profileData.siret}
                    onChange={(e) => setProfileData({...profileData, siret: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="123 456 789 00012"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={profileData.adresse}
                    onChange={(e) => setProfileData({...profileData, adresse: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code Postal</label>
                  <input
                    type="text"
                    value={profileData.code_postal}
                    onChange={(e) => setProfileData({...profileData, code_postal: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={profileData.ville}
                    onChange={(e) => setProfileData({...profileData, ville: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <Button onClick={handleUpdateProfile} disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enregistrer les modifications
              </Button>
            </div>
          </div>
        )}

        {/* SECTION 2: SECURITE */}
        {activeTab === 'securite' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">Sécurité</h2>
              <p className="text-sm text-gray-500">Gérez votre mot de passe et la sécurité de votre compte.</p>
            </div>

            <div className="max-w-md space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Changer le mot de passe</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={passwordData.password}
                  onChange={(e) => setPasswordData({...passwordData, password: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Minimum 8 caractères"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Confirmer le nouveau mot de passe"
                />
              </div>
              <Button onClick={handleUpdatePassword} disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Mettre à jour le mot de passe
              </Button>
            </div>

            <div className="border-t border-gray-100 pt-8">
              <div className="bg-red-50 border border-red-100 rounded-md p-4">
                <h3 className="text-sm font-medium text-red-800 mb-2">Zone de danger</h3>
                <p className="text-sm text-red-600 mb-4">
                  La suppression de votre compte est irréversible. Toutes vos données seront perdues.
                </p>
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteAccountModal(true)}>
                  Supprimer mon compte
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Notifications & Alertes</h2>
                <p className="text-sm text-gray-500">Choisissez quand et comment vous souhaitez être notifié.</p>
              </div>
              <div className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Les notifications par email seront bientôt disponibles
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Alerte crédits faibles</h3>
                  <p className="text-sm text-gray-500">Recevoir une alerte quand vos crédits sont bas</p>
                </div>
                <div className="flex items-center gap-4">
                  {notifications.alerte_credits_faibles && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Seuil (€)</span>
                      <input 
                        type="number" 
                        value={notifications.seuil_credits}
                        onChange={(e) => setNotifications({...notifications, seuil_credits: parseInt(e.target.value)})}
                        className="w-20 p-1 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  )}
                  <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={notifications.alerte_credits_faibles}
                      onChange={(e) => setNotifications({...notifications, alerte_credits_faibles: e.target.checked})}
                      id="toggle-credits"
                    />
                    <label
                      htmlFor="toggle-credits"
                      className={`absolute inset-0 cursor-pointer rounded-full transition-colors ${notifications.alerte_credits_faibles ? 'bg-blue-600' : 'bg-gray-200'}`}
                    />
                    <span className={`absolute left-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.alerte_credits_faibles ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {notificationItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">{item.label}</h3>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                  <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={notifications[item.id]}
                      onChange={(e) => setNotificationValue(item.id, e.target.checked)}
                      id={`toggle-${item.id}`}
                    />
                    <label
                      htmlFor={`toggle-${item.id}`}
                      className={`absolute inset-0 cursor-pointer rounded-full transition-colors ${notifications[item.id] ? 'bg-blue-600' : 'bg-gray-200'}`}
                    />
                    <span className={`absolute left-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications[item.id] ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <Button onClick={handleUpdateNotifications} disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enregistrer les préférences
              </Button>
            </div>
          </div>
        )}

        {/* SECTION 4: FACTURATION */}
        {activeTab === 'facturation' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">Facturation & Abonnement</h2>
              <p className="text-sm text-gray-500">Gérez vos informations de paiement et consultez vos factures.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500 mb-1">Total dépensé</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.totalSpent.toFixed(2)} €</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500 mb-1">Nombre de recharges</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.transactionCount}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500 mb-1">Dernière recharge</p>
                {billingStats.lastRecharge ? (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{billingStats.lastRecharge.amount.toFixed(2)} €</p>
                    <p className="text-xs text-gray-400">{new Date(billingStats.lastRecharge.date).toLocaleDateString()}</p>
                  </>
                ) : (
                  <p className="text-lg font-medium text-gray-400">Aucune</p>
                )}
              </div>
            </div>

            {/* Infos Facturation */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Informations de facturation</h3>
              
              <div className="grid grid-cols-1 gap-4">
                {/* Nom */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={billingData.nom_facturation}
                    onChange={(e) => setBillingData({...billingData, nom_facturation: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="Nom complet ou entreprise"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={billingData.email_facturation}
                    onChange={(e) => setBillingData({...billingData, email_facturation: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="email@exemple.com"
                  />
                </div>

                {/* Adresse */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                  <div className="space-y-2">
                    {/* Pays */}
                    <select
                      value={billingData.pays_facturation}
                      onChange={(e) => setBillingData({...billingData, pays_facturation: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md bg-white"
                    >
                      <option value="FR">France</option>
                      <option value="BE">Belgique</option>
                      <option value="CH">Suisse</option>
                      <option value="CA">Canada</option>
                      <option value="US">États-Unis</option>
                      <option value="GB">Royaume-Uni</option>
                      <option value="DE">Allemagne</option>
                      <option value="ES">Espagne</option>
                      <option value="IT">Italie</option>
                      <option value="LU">Luxembourg</option>
                    </select>

                    {/* Ligne 1 */}
                    <input
                      type="text"
                      value={billingData.adresse_ligne1_facturation}
                      onChange={(e) => setBillingData({...billingData, adresse_ligne1_facturation: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="Adresse - Ligne 1"
                    />

                    {/* Ligne 2 */}
                    <input
                      type="text"
                      value={billingData.adresse_ligne2_facturation}
                      onChange={(e) => setBillingData({...billingData, adresse_ligne2_facturation: e.target.value})}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="Adresse - Ligne 2"
                    />

                    {/* Ville & CP */}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={billingData.ville_facturation}
                        onChange={(e) => setBillingData({...billingData, ville_facturation: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Ville"
                      />
                      <input
                        type="text"
                        value={billingData.code_postal_facturation}
                        onChange={(e) => setBillingData({...billingData, code_postal_facturation: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Code Postal / ZIP"
                      />
                    </div>
                  </div>
                </div>

                {/* Numéro de téléphone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de téléphone</label>
                  <input
                    type="tel"
                    value={billingData.telephone_facturation}
                    onChange={(e) => setBillingData({...billingData, telephone_facturation: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="+33 1 23 45 67 89"
                  />
                </div>
              </div>

              {/* Recharge Auto */}
              <div className="border border-gray-200 rounded-lg p-4 mt-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                Recharge automatique
              </h4>
                    <p className="text-xs text-gray-500">Rechargez automatiquement quand vos crédits sont bas.</p>
                  </div>
                  <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={billingData.recharge_auto?.actif ?? false}
                      onChange={(e) => setBillingData({
                        ...billingData, 
                        recharge_auto: { 
                          seuil: 10,
                          montant: 20,
                          ...(billingData.recharge_auto || {}),
                          actif: e.target.checked 
                        }
                      })}
                      id="toggle-recharge"
                    />
                    <label
                      htmlFor="toggle-recharge"
                      className={`absolute inset-0 cursor-pointer rounded-full transition-colors ${billingData.recharge_auto?.actif ? 'bg-blue-600' : 'bg-gray-200'}`}
                    />
                    <span className={`absolute left-1 h-4 w-4 rounded-full bg-white transition-transform ${billingData.recharge_auto?.actif ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>

                {billingData.recharge_auto?.actif && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Seuil (€)</label>
                      <input 
                        type="number" 
                        value={billingData.recharge_auto?.seuil ?? ''}
                        onChange={(e) => setBillingData({
                          ...billingData, 
                          recharge_auto: { ...billingData.recharge_auto!, seuil: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Montant à recharger (€)</label>
                      <input 
                        type="number" 
                        value={billingData.recharge_auto?.montant ?? ''}
                        onChange={(e) => setBillingData({
                          ...billingData, 
                          recharge_auto: { ...billingData.recharge_auto!, montant: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleUpdateBilling} disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Gestion Stripe</h3>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="outline" onClick={handleStripePortal} disabled={isStripePortalLoading}>
                  {isStripePortalLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCardIcon className="w-4 h-4 mr-2" />
                  )}
                  Gérer mon moyen de paiement
                </Button>
                <Button variant="outline" onClick={handleStripePortal} disabled={isStripePortalLoading}>
                  {isStripePortalLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  Consulter mes factures
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Vous serez redirigé vers notre partenaire de paiement sécurisé Stripe</p>
            </div>
          </div>
        )}

        {/* SECTION 5: DONNEES */}
        {activeTab === 'donnees' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">Gestion des données</h2>
              <p className="text-sm text-gray-500">Consultez, exportez et gérez vos données.</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Tableau de bord de mes données</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Propositions</p>
                  <p className="text-2xl font-bold text-gray-900">{clampedPropositionsCount} / {maxPropositions}</p>
                  <div className="mt-3 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full ${propositionsProgressColor}`} style={{ width: `${propositionsProgress}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">propositions utilisées</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Templates actifs</p>
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{activeTemplatesCount}</p>
                  <p className="text-xs text-gray-500 mt-2">templates configurés</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Plus ancienne proposition</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {oldestProposition ? formatShortDate(oldestProposition) : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {oldestProposition ? 'sera supprimée en premier' : 'aucune proposition'}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Données exportables</p>
                  <p className="text-2xl font-bold text-gray-900">{totalExportablesCount}</p>
                  <p className="text-xs text-gray-500 mt-2">éléments au total</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Exporter mes données</h3>
                <p className="text-sm text-gray-500">Téléchargez vos données dans le format de votre choix</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <Table className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Historique d&apos;activité (Excel)</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Tableau récapitulatif de vos propositions et transactions, idéal pour votre comptabilité
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {historyReportCounts.isLoading
                          ? 'Chargement...'
                          : `${historyReportCounts.propositionsCount ?? '—'} propositions · ${historyReportCounts.transactionsCount ?? '—'} transactions`}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-700">Période du rapport</label>
                      <select
                        value={historyReportPeriod}
                        onChange={(e) => setHistoryReportPeriod(e.target.value as HistoryReportPeriod)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        <option value="current_month">Mois en cours</option>
                        <option value="last_month">Mois dernier</option>
                        <option value="last_3_months">3 derniers mois</option>
                        <option value="last_6_months">6 derniers mois</option>
                        <option value="current_year">Année en cours</option>
                        <option value="last_year">Année dernière</option>
                        <option value="custom">Personnaliser</option>
                      </select>
                    </div>

                    {historyReportPeriod === 'custom' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-gray-600">Du</label>
                          <input
                            type="date"
                            value={historyReportCustomStart}
                            onChange={(e) => setHistoryReportCustomStart(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-gray-600">Au</label>
                          <input
                            type="date"
                            value={historyReportCustomEnd}
                            onChange={(e) => setHistoryReportCustomEnd(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                      </div>
                    )}

                    <Button onClick={handleExportHistoryXlsx} disabled={isHistoryExportLoading} className="w-full">
                      {isHistoryExportLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Télécharger le Excel
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Gestion des propositions</h3>

              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-900">
                    Vos propositions sont limitées à 15. Quand cette limite est atteinte, la plus ancienne proposition
                    est automatiquement supprimée pour faire place à la nouvelle.
                  </p>
                  {propositionsCount >= 12 && (
                    <p className="text-sm text-amber-900 font-semibold mt-1">
                      Vous approchez de la limite ({clampedPropositionsCount}/{maxPropositions})
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-red-200 rounded-lg p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-red-900">Supprimer des propositions</p>
                    <p className="text-sm text-red-700 mt-1">
                      Cette action est irréversible. Les fichiers associés seront également supprimés.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteMode('all')}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      deleteMode === 'all'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">Supprimer toutes mes propositions</p>
                    <p className="text-xs text-gray-500 mt-1">{propositionsCount} propositions</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteMode('older_than_30_days')}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      deleteMode === 'older_than_30_days'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">Supprimer les propositions de plus de 30 jours</p>
                    <p className="text-xs text-gray-500 mt-1">{olderThan30DaysCount} propositions concernées</p>
                  </button>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeletePropositionsModal(true)}
                    disabled={!deleteMode || pendingDeleteCount === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </Button>
                </div>
              </div>

              <div className="pt-2">
                <a href="#" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  Politique de confidentialité <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 6: APPARENCE */}
        {activeTab === 'apparence' && (
          <div className="p-6 space-y-8">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">Apparence & Interface</h2>
              <p className="text-sm text-gray-500">Personnalisez votre expérience PropoBoost.</p>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Thème</h3>
                <div className="grid grid-cols-3 gap-4">
                  {themeOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setAppearance({ ...appearance, theme: item.id })}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                        appearance.theme === item.id 
                          ? 'border-blue-500 bg-blue-50 text-blue-700' 
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      <item.icon className="w-6 h-6 mb-2" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Densité</h3>
                <div className="grid grid-cols-2 gap-4">
                  {densityOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setAppearance({ ...appearance, densite: item.id })}
                      className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        appearance.densite === item.id 
                          ? 'border-blue-500 bg-blue-50 text-blue-700' 
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      {/* Visual preview placeholder */}
                      <div className={`space-y-1 w-12 ${item.id === 'compact' ? 'gap-0.5' : 'gap-1.5'}`}>
                        <div className="h-1 bg-current rounded opacity-40"></div>
                        <div className="h-1 bg-current rounded opacity-40"></div>
                        <div className="h-1 bg-current rounded opacity-40"></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Page d&apos;accueil</h3>
                <select
                  value={appearance.page_accueil}
                  onChange={(e) =>
                    setAppearance({ ...appearance, page_accueil: e.target.value as HomePagePreference })
                  }
                  className="w-full max-w-xs p-2 border border-gray-300 rounded-md"
                >
                  <option value="/dashboard">Dashboard</option>
                  <option value="/templates">Templates</option>
                  <option value="/propositions">Propositions</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">La page affichée après connexion.</p>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <Button onClick={handleUpdateAppearance} disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      
      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Supprimer votre compte ?</h3>
            <p className="text-gray-600">
              Cette action est irréversible. Toutes vos données, templates et propositions seront supprimés définitivement.
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowDeleteAccountModal(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteAccount}>Confirmer la suppression</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Propositions Modal */}
      {showDeletePropositionsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Supprimer des propositions ?</h3>
            <p className="text-gray-600">
              Vous êtes sur le point de supprimer {pendingDeleteCount} proposition{pendingDeleteCount > 1 ? 's' : ''}. Cette action est irréversible. Les fichiers associés seront également supprimés.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                Tapez <span className="font-semibold">SUPPRIMER</span> pour confirmer.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="SUPPRIMER"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeletePropositionsModal(false);
                  setDeleteConfirmText('');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!deleteMode) return;
                  handleDeletePropositions(deleteMode);
                }}
                disabled={isDeletingPropositions || deleteConfirmText !== 'SUPPRIMER'}
              >
                {isDeletingPropositions ? 'Suppression...' : 'Confirmer la suppression'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
