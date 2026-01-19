'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2, Mail, Lock, Briefcase, CreditCard } from 'lucide-react';

// Schéma de validation simplifié pour le client
const clientSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  secteur: z.enum(['telephonie', 'bureautique', 'mixte'], {
    required_error: 'Veuillez sélectionner un secteur',
  }),
  tarif_par_proposition: z.number().min(0, 'Le tarif doit être positif'),
});

type ClientFormData = z.infer<typeof clientSchema>;

const SECTEURS = [
  { value: 'telephonie', label: 'Téléphonie d\'entreprise', icon: '📞' },
  { value: 'bureautique', label: 'Bureautique (copieurs/imprimantes)', icon: '🖨️' },
  { value: 'mixte', label: 'Mixte (Téléphonie + Bureautique)', icon: '📱' },
];

export function OrganizationFormSimple() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      tarif_par_proposition: 5.0,
    },
  });

  const onSubmit = async (data: ClientFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/organizations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // Valeurs par défaut pour la config IA (sera configurée par template)
          claude_model: 'claude-3-7-sonnet-20250219',
          prompt_template: '',
          champs_defaut: [],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || `Erreur ${response.status}`);
      }
      
      router.push(`/admin/clients/${result.organization.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      alert(`Erreur lors de la création du client:\n\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Informations de base */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Informations du client</h2>
            <p className="text-sm text-gray-600">Informations de base pour créer le compte client</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Nom de l'organisation *
              </span>
            </label>
            <input
              {...register('nom')}
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: TelecomPro Solutions"
            />
            {errors.nom && (
              <p className="text-red-500 text-sm mt-1">{errors.nom.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email *
              </span>
            </label>
            <input
              {...register('email')}
              type="email"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="contact@telecompro.fr"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Mot de passe *
              </span>
            </label>
            <input
              {...register('password')}
              type="password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Min. 8 caractères"
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Secteur d'activité *
              </span>
            </label>
            <select
              {...register('secteur')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Sélectionner un secteur...</option>
              {SECTEURS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.icon} {s.label}
                </option>
              ))}
            </select>
            {errors.secteur && (
              <p className="text-red-500 text-sm mt-1">{errors.secteur.message}</p>
            )}
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
            <p className="text-sm text-gray-600">Configuration de la tarification</p>
          </div>
        </div>

        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tarif par proposition (€) *
          </label>
          <div className="relative">
            <input
              {...register('tarif_par_proposition', { valueAsNumber: true })}
              type="number"
              step="0.01"
              min="0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="5.00"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">€</span>
          </div>
          {errors.tarif_par_proposition && (
            <p className="text-red-500 text-sm mt-1">{errors.tarif_par_proposition.message}</p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Ce montant sera déduit des crédits du client pour chaque proposition générée.
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-blue-600 text-xl">💡</div>
          <div>
            <h3 className="font-medium text-blue-900">Configuration IA par template</h3>
            <p className="text-sm text-blue-700 mt-1">
              La configuration de l'IA (modèle Claude, prompt, champs à extraire) se fait au niveau de chaque template.
              Créez d'abord le client, puis configurez ses templates avec les paramètres d'extraction spécifiques.
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
              Création en cours...
            </>
          ) : (
            <>
              <Building2 className="w-5 h-5" />
              Créer le client
            </>
          )}
        </button>
      </div>
    </form>
  );
}
