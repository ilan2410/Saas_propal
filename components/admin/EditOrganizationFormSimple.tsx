'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Building2, Mail, Briefcase, CreditCard, Wallet, Shield } from 'lucide-react';
import type { ClientConfigPermissions } from '@/types';
import { CLIENT_CONFIG_PERMISSION_KEYS, resolveClientConfigPermissions } from '@/lib/security/client-data';

const CLIENT_PERMISSION_LABELS: Array<{ key: keyof ClientConfigPermissions; label: string; group: string }> = [
  { key: 'templates', label: 'Onglet Templates (création / modification de templates)', group: 'Templates' },
  { key: 'sp_questions', label: 'Questions SP', group: 'SP situation proposée' },
  { key: 'sp_mode_direct', label: 'Mode direct', group: 'SP situation proposée' },
  { key: 'sp_objectifs', label: 'Objectifs', group: 'SP situation proposée' },
  { key: 'sp_reference', label: 'Référence', group: 'SP situation proposée' },
  { key: 'sp_mode_client', label: 'Mode Client', group: 'SP situation proposée' },
  { key: 'sp_apparence', label: 'Apparence du questionnaire', group: 'SP situation proposée' },
  { key: 'sp_preferences_produits', label: 'Préférences produits', group: 'SP situation proposée' },
  { key: 'sp_ordre_categories', label: 'Ordre d’affichage', group: 'SP situation proposée' },
  { key: 'sp_libelles', label: 'Libellés', group: 'SP situation proposée' },
  { key: 'sp_calcul_loyer', label: 'Calcul loyer & Marge', group: 'Calculs SP' },
  { key: 'sp_calcul_resiliation', label: 'Calcul indemnité de résiliation', group: 'Calculs SP' },
  { key: 'sp_remises_operateurs', label: 'Remises opérateurs', group: 'Remises SP' },
  { key: 'sp_codes_promo', label: 'Codes promo', group: 'Remises SP' },
];

const SECTEURS = [
  { value: 'telephonie', label: 'Téléphonie d\'entreprise', icon: '📞' },
  { value: 'bureautique', label: 'Bureautique (copieurs/imprimantes)', icon: '🖨️' },
  { value: 'mixte', label: 'Mixte (Téléphonie + Bureautique)', icon: '📱' },
];

type Organization = {
  id: string;
  nom?: string;
  email?: string;
  secteur?: string;
  credits?: number;
  tarif_par_proposition?: number;
  tarif_clone_site?: number;
  preferences?: {
    client_config_enabled?: boolean;
  } | null;
};
interface Props {
  organization: Organization;
}

export function EditOrganizationFormSimple({ organization }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    nom: organization.nom || '',
    email: organization.email || '',
    secteur: organization.secteur || 'telephonie',
    credits: organization.credits || 0,
    tarif_par_proposition: organization.tarif_par_proposition || 5,
    tarif_clone_site: organization.tarif_clone_site ?? 1,
    client_config_permissions: resolveClientConfigPermissions(organization.preferences),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour');
      }

      router.push(`/admin/clients/${organization.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Informations de base */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Informations du client</h2>
            <p className="text-sm text-gray-600">Informations de base du compte client</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Nom de l&apos;organisation *
              </span>
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </span>
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">L&apos;email ne peut pas être modifié</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Secteur d&apos;activité *
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {SECTEURS.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.secteur === s.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="secteur"
                    value={s.value}
                    checked={formData.secteur === s.value}
                    onChange={(e) => setFormData({ ...formData, secteur: e.target.value })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-2xl">{s.icon}</span>
                  <span className="font-medium text-gray-900">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Facturation */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-100 rounded-lg">
            <CreditCard className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Facturation</h2>
            <p className="text-sm text-gray-600">Gestion des crédits et tarification</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Crédits actuels (€)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.credits}
                onChange={(e) => setFormData({ ...formData, credits: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">€</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Solde disponible pour générer des propositions
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Tarif par proposition (€)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.tarif_par_proposition}
                onChange={(e) => setFormData({ ...formData, tarif_par_proposition: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">€</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Montant déduit pour chaque proposition générée
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Tarif clone site (€)
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.tarif_clone_site}
                onChange={(e) => setFormData({ ...formData, tarif_clone_site: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">€</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Coût débité pour chaque proposition site supplémentaire (multisite, sans re-extraction)
            </p>
          </div>
        </div>
      </div>

      {/* Accès à la configuration avancée (Permissions granulaires) */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Permissions de configuration côté client</h2>
              <p className="text-sm text-gray-600">Choisissez précisément ce que ce client est autorisé à voir et configurer</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  client_config_permissions: CLIENT_CONFIG_PERMISSION_KEYS.reduce((acc, k) => {
                    acc[k] = true;
                    return acc;
                  }, {} as ClientConfigPermissions),
                }))
              }
              className="text-blue-600 hover:text-blue-800"
            >
              Tout autoriser
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  client_config_permissions: CLIENT_CONFIG_PERMISSION_KEYS.reduce((acc, k) => {
                    acc[k] = false;
                    return acc;
                  }, {} as ClientConfigPermissions),
                }))
              }
              className="text-gray-600 hover:text-gray-900"
            >
              Tout masquer (Clé en main)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {CLIENT_PERMISSION_LABELS.map((item) => {
            const checked = formData.client_config_permissions[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-center justify-between gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  checked ? 'border-purple-300 bg-purple-50/40' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                  <span className="text-xs text-gray-500">{item.group}</span>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_config_permissions: {
                        ...prev.client_config_permissions,
                        [item.key]: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-blue-600 text-xl">💡</div>
          <div>
            <h3 className="font-medium text-blue-900">Configuration IA par template</h3>
            <p className="text-sm text-blue-700 mt-1">
              La configuration de l&apos;IA (modèle Claude, prompt, champs à extraire) se fait au niveau de chaque template.
              Accédez aux templates du client pour modifier ces paramètres.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          disabled={isLoading}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Enregistrer les modifications
            </>
          )}
        </button>
      </div>
    </form>
  );
}
