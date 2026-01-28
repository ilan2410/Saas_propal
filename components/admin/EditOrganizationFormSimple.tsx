'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Building2, Mail, Briefcase, CreditCard, Wallet } from 'lucide-react';

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
