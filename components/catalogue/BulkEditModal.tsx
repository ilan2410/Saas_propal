'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { CatalogueCategorie, CatalogueProduitTranche, ProduitDestinations } from '@/types';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  isAdmin?: boolean;
  onSuccess: () => void;
  fournisseurOptions: string[];
}

type BulkUpdateData = {
  categorie?: CatalogueCategorie;
  fournisseur?: string | null;
  description?: string | null;
  type_frequence?: 'mensuel' | 'unique';
  prix_mensuel?: number | null;
  prix_vente?: number | null;
  prix_installation?: number | null;
  engagement_mois?: number | null;
  actif?: boolean;
  destinations?: ProduitDestinations;
  mode_fas?: 'fixe_par_selection' | 'multiplie_par_quantite';
  remise_type?: 'fixe' | 'pourcentage' | null;
  remise_valeur?: number | null;
  prix_par_tranche?: CatalogueProduitTranche[] | null;
};

type BulkUpdateField =
  | 'categorie'
  | 'fournisseur'
  | 'description'
  | 'type_frequence'
  | 'prix_mensuel'
  | 'prix_vente'
  | 'prix_installation'
  | 'engagement_mois'
  | 'actif'
  | 'destinations'
  | 'mode_fas'
  | 'remise'
  | 'prix_par_tranche';

const DEFAULT_DESTINATIONS: ProduitDestinations = {
  proposition: true,
  bdc_operateur: true,
  bdc_materiel: true,
};

function createEmptyTranche(qteMin = 1): CatalogueProduitTranche {
  return {
    id: crypto.randomUUID(),
    qte_min: qteMin,
    qte_max: null,
    prix_vente: undefined,
    prix_mensuel: undefined,
    prix_installation: undefined,
  };
}

function getCardClasses(enabled: boolean): string {
  return `p-4 rounded-lg border transition-all ${enabled ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`;
}

export function BulkEditModal({
  isOpen,
  onClose,
  selectedIds,
  isAdmin = false,
  onSuccess,
  fournisseurOptions,
}: BulkEditModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  const [updateFields, setUpdateFields] = useState<Record<BulkUpdateField, boolean>>({
    categorie: false,
    fournisseur: false,
    description: false,
    type_frequence: false,
    prix_mensuel: false,
    prix_vente: false,
    prix_installation: false,
    engagement_mois: false,
    actif: false,
    destinations: false,
    mode_fas: false,
    remise: false,
    prix_par_tranche: false,
  });

  const [formData, setFormData] = useState<{
    categorie: CatalogueCategorie;
    fournisseur: string;
    description: string;
    type_frequence: 'mensuel' | 'unique';
    prix_mensuel: string;
    prix_vente: string;
    prix_installation: string;
    engagement_mois: string;
    actif: boolean;
    destinations: ProduitDestinations;
    mode_fas: 'fixe_par_selection' | 'multiplie_par_quantite';
    remise_type: 'fixe' | 'pourcentage' | '';
    remise_valeur: string;
    tranches_actives: boolean;
    tranches: CatalogueProduitTranche[];
  }>({
    categorie: 'mobile',
    fournisseur: '',
    description: '',
    type_frequence: 'mensuel',
    prix_mensuel: '',
    prix_vente: '',
    prix_installation: '',
    engagement_mois: '',
    actif: true,
    destinations: DEFAULT_DESTINATIONS,
    mode_fas: 'fixe_par_selection',
    remise_type: '',
    remise_valeur: '',
    tranches_actives: false,
    tranches: [],
  });

  if (!isOpen) return null;

  const categorieOptions: Array<{ value: CatalogueCategorie; label: string }> = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'internet', label: 'Internet' },
    { value: 'fixe', label: 'Fixe' },
    { value: 'cloud', label: 'Cloud' },
    { value: 'equipement', label: 'Équipement' },
    { value: 'cadeau', label: 'Cadeau' },
    { value: 'installation', label: 'Installation' },
    { value: 'autre', label: 'Autre' },
  ];

  const handleToggle = (field: BulkUpdateField) => {
    setUpdateFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const addTranche = () => {
    const last = formData.tranches[formData.tranches.length - 1];
    const qteMin = last ? (last.qte_max !== null ? last.qte_max + 1 : last.qte_min + 1) : 1;
    setFormData((prev) => ({
      ...prev,
      tranches: [...prev.tranches, createEmptyTranche(qteMin)],
    }));
  };

  const updateTranche = (idx: number, patch: Partial<CatalogueProduitTranche>) => {
    setFormData((prev) => ({
      ...prev,
      tranches: prev.tranches.map((tranche, index) => (
        index === idx ? { ...tranche, ...patch } : tranche
      )),
    }));
  };

  const removeTranche = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      tranches: prev.tranches.filter((_, index) => index !== idx),
    }));
  };

  const parseNullableNumber = (value: string, label: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} doit être un nombre valide`);
    }
    return parsed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updates: BulkUpdateData = {};

      if (updateFields.categorie) updates.categorie = formData.categorie;
      if (updateFields.fournisseur) updates.fournisseur = formData.fournisseur.trim() || null;
      if (updateFields.description) updates.description = formData.description.trim() || null;
      if (updateFields.type_frequence) updates.type_frequence = formData.type_frequence;
      if (updateFields.prix_mensuel) updates.prix_mensuel = parseNullableNumber(formData.prix_mensuel, 'Le prix mensuel');
      if (updateFields.prix_vente) updates.prix_vente = parseNullableNumber(formData.prix_vente, 'Le prix de vente');
      if (updateFields.prix_installation) {
        updates.prix_installation = parseNullableNumber(formData.prix_installation, 'Les frais d’installation');
      }
      if (updateFields.engagement_mois) {
        const engagement = parseNullableNumber(formData.engagement_mois, 'L’engagement');
        if (engagement !== null && (!Number.isInteger(engagement) || engagement < 0)) {
          throw new Error('L’engagement doit être un nombre entier positif');
        }
        updates.engagement_mois = engagement;
      }
      if (updateFields.actif) updates.actif = formData.actif;
      if (updateFields.destinations) updates.destinations = formData.destinations;
      if (updateFields.mode_fas) updates.mode_fas = formData.mode_fas;
      if (updateFields.remise) {
        if (!formData.remise_type) {
          updates.remise_type = null;
          updates.remise_valeur = null;
        } else {
          updates.remise_type = formData.remise_type;
          updates.remise_valeur = parseNullableNumber(formData.remise_valeur, 'La valeur de remise');
        }
      }
      if (updateFields.prix_par_tranche) {
        if (!formData.tranches_actives) {
          updates.prix_par_tranche = null;
        } else {
          if (formData.tranches.length === 0) {
            throw new Error('Ajoutez au moins une tranche ou désactivez les tarifs par tranche');
          }

          const normalizedTranches = formData.tranches.map((tranche, index) => {
            if (!Number.isInteger(tranche.qte_min) || tranche.qte_min < 1) {
              throw new Error(`Tranche ${index + 1} : la quantité min doit être un entier supérieur ou égal à 1`);
            }
            if (tranche.qte_max !== null) {
              if (!Number.isInteger(tranche.qte_max) || tranche.qte_max < tranche.qte_min) {
                throw new Error(`Tranche ${index + 1} : la quantité max doit être supérieure ou égale à la quantité min`);
              }
            } else if (index !== formData.tranches.length - 1) {
              throw new Error('Seule la dernière tranche peut avoir une quantité max illimitée');
            }

            const prixFrequence = formData.type_frequence === 'mensuel'
              ? tranche.prix_mensuel
              : tranche.prix_vente;
            if (prixFrequence !== undefined && (!Number.isFinite(prixFrequence) || prixFrequence < 0)) {
              throw new Error(`Tranche ${index + 1} : le prix doit être un nombre valide`);
            }
            if (tranche.prix_installation !== undefined && (!Number.isFinite(tranche.prix_installation) || tranche.prix_installation < 0)) {
              throw new Error(`Tranche ${index + 1} : le FAS doit être un nombre valide`);
            }

            return {
              id: tranche.id,
              qte_min: tranche.qte_min,
              qte_max: tranche.qte_max,
              prix_mensuel: formData.type_frequence === 'mensuel' ? tranche.prix_mensuel : undefined,
              prix_vente: formData.type_frequence === 'unique' ? tranche.prix_vente : undefined,
              prix_installation: tranche.prix_installation,
            };
          });

          updates.prix_par_tranche = normalizedTranches;
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new Error('Aucun champ sélectionné pour la modification');
      }

      const res = await fetch('/api/catalogue/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          updates,
          is_global: isAdmin,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Erreur lors de la mise à jour');
      }

      onSuccess();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Modification en masse</h2>
            <p className="text-sm text-gray-500 mt-1">
              Modification de {selectedIds.length} produit{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6">
            Cochez les champs que vous souhaitez modifier pour l&apos;ensemble de la sélection.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Categorie */}
            <div className={getCardClasses(updateFields.categorie)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_categorie"
                  checked={updateFields.categorie}
                  onChange={() => handleToggle('categorie')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_categorie" className="font-medium text-gray-900 cursor-pointer">Catégorie</label>
              </div>
              <select
                disabled={!updateFields.categorie}
                value={formData.categorie}
                onChange={(e) => setFormData(p => ({ ...p, categorie: e.target.value as CatalogueCategorie }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400"
              >
                {categorieOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Fournisseur */}
            <div className={getCardClasses(updateFields.fournisseur)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_fournisseur"
                  checked={updateFields.fournisseur}
                  onChange={() => handleToggle('fournisseur')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_fournisseur" className="font-medium text-gray-900 cursor-pointer">Fournisseur</label>
              </div>
              <select
                disabled={!updateFields.fournisseur || fournisseurOptions.length === 0}
                value={formData.fournisseur}
                onChange={(e) => setFormData(p => ({ ...p, fournisseur: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Retirer le fournisseur</option>
                {fournisseurOptions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Type de facturation */}
            <div className={getCardClasses(updateFields.type_frequence)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_type_frequence"
                  checked={updateFields.type_frequence}
                  onChange={() => handleToggle('type_frequence')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_type_frequence" className="font-medium text-gray-900 cursor-pointer">Type de facturation</label>
              </div>
              <select
                disabled={!updateFields.type_frequence}
                value={formData.type_frequence}
                onChange={(e) => setFormData(p => ({ ...p, type_frequence: e.target.value as 'mensuel' | 'unique' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="mensuel">Mensuel (Abonnement)</option>
                <option value="unique">Unique (Achat)</option>
              </select>
            </div>

            {/* Engagement */}
            <div className={getCardClasses(updateFields.engagement_mois)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_engagement_mois"
                  checked={updateFields.engagement_mois}
                  onChange={() => handleToggle('engagement_mois')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_engagement_mois" className="font-medium text-gray-900 cursor-pointer">Engagement (mois)</label>
              </div>
              <input
                disabled={!updateFields.engagement_mois}
                value={formData.engagement_mois}
                onChange={(e) => setFormData(p => ({ ...p, engagement_mois: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Ex: 12"
                inputMode="numeric"
              />
            </div>

            {/* Prix Mensuel */}
            <div className={getCardClasses(updateFields.prix_mensuel)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_prix_mensuel"
                  checked={updateFields.prix_mensuel}
                  onChange={() => handleToggle('prix_mensuel')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_prix_mensuel" className="font-medium text-gray-900 cursor-pointer">Prix Mensuel (€)</label>
              </div>
              <input
                disabled={!updateFields.prix_mensuel}
                value={formData.prix_mensuel}
                onChange={(e) => setFormData(p => ({ ...p, prix_mensuel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Ex: 49.99"
                inputMode="decimal"
              />
            </div>

            {/* Prix Vente */}
            <div className={getCardClasses(updateFields.prix_vente)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_prix_vente"
                  checked={updateFields.prix_vente}
                  onChange={() => handleToggle('prix_vente')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_prix_vente" className="font-medium text-gray-900 cursor-pointer">Prix de Vente (€)</label>
              </div>
              <input
                disabled={!updateFields.prix_vente}
                value={formData.prix_vente}
                onChange={(e) => setFormData(p => ({ ...p, prix_vente: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Ex: 299.00"
                inputMode="decimal"
              />
            </div>

            {/* Prix Installation */}
            <div className={getCardClasses(updateFields.prix_installation)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_prix_installation"
                  checked={updateFields.prix_installation}
                  onChange={() => handleToggle('prix_installation')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_prix_installation" className="font-medium text-gray-900 cursor-pointer">Frais d&apos;installation (€)</label>
              </div>
              <input
                disabled={!updateFields.prix_installation}
                value={formData.prix_installation}
                onChange={(e) => setFormData(p => ({ ...p, prix_installation: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="Ex: 99.00"
                inputMode="decimal"
              />
            </div>

            {/* Actif */}
            <div className={getCardClasses(updateFields.actif)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_actif"
                  checked={updateFields.actif}
                  onChange={() => handleToggle('actif')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_actif" className="font-medium text-gray-900 cursor-pointer">Statut du produit</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!updateFields.actif}
                  onClick={() => setFormData((prev) => ({ ...prev, actif: true }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    formData.actif
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-300 bg-white text-gray-700'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  Actif
                </button>
                <button
                  type="button"
                  disabled={!updateFields.actif}
                  onClick={() => setFormData((prev) => ({ ...prev, actif: false }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !formData.actif
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-300 bg-white text-gray-700'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  Inactif
                </button>
              </div>
            </div>

            {/* Mode FAS */}
            <div className={getCardClasses(updateFields.mode_fas)}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="check_mode_fas"
                  checked={updateFields.mode_fas}
                  onChange={() => handleToggle('mode_fas')}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="check_mode_fas" className="font-medium text-gray-900 cursor-pointer">Mode FAS</label>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={!updateFields.mode_fas}
                  onClick={() => setFormData((prev) => ({ ...prev, mode_fas: 'fixe_par_selection' }))}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                    formData.mode_fas === 'fixe_par_selection'
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-300 bg-white text-gray-700'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  FAS appliqué une seule fois
                </button>
                <button
                  type="button"
                  disabled={!updateFields.mode_fas}
                  onClick={() => setFormData((prev) => ({ ...prev, mode_fas: 'multiplie_par_quantite' }))}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                    formData.mode_fas === 'multiplie_par_quantite'
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-300 bg-white text-gray-700'
                  } disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  FAS multiplié par quantité
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className={getCardClasses(updateFields.description)}>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="check_description"
                checked={updateFields.description}
                onChange={() => handleToggle('description')}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="check_description" className="font-medium text-gray-900 cursor-pointer">Description</label>
            </div>
            <textarea
              disabled={!updateFields.description}
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400 min-h-24"
              placeholder="Description du produit..."
            />
          </div>

          {/* Destinations */}
          <div className={getCardClasses(updateFields.destinations)}>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="check_destinations"
                checked={updateFields.destinations}
                onChange={() => handleToggle('destinations')}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="check_destinations" className="font-medium text-gray-900 cursor-pointer">Destinations du produit</label>
            </div>
            <div className="flex flex-wrap gap-6">
              {([
                { key: 'proposition', label: 'Proposition commerciale' },
                { key: 'bdc_operateur', label: 'BDC Opérateur' },
                { key: 'bdc_materiel', label: 'BDC Matériel' },
              ] as const).map(({ key, label }) => (
                <label key={key} className={`flex items-center gap-2 ${updateFields.destinations ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                  <input
                    type="checkbox"
                    checked={formData.destinations[key]}
                    disabled={!updateFields.destinations}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        destinations: { ...prev.destinations, [key]: e.target.checked },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Remise */}
          <div className={getCardClasses(updateFields.remise)}>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="check_remise"
                checked={updateFields.remise}
                onChange={() => handleToggle('remise')}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="check_remise" className="font-medium text-gray-900 cursor-pointer">Remise</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de remise</label>
                <select
                  disabled={!updateFields.remise}
                  value={formData.remise_type}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    remise_type: e.target.value as 'fixe' | 'pourcentage' | '',
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">Aucune remise</option>
                  <option value="fixe">Montant fixe</option>
                  <option value="pourcentage">Pourcentage</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valeur {formData.remise_type === 'pourcentage' ? '(%)' : '(€ / mois)'}
                </label>
                <input
                  disabled={!updateFields.remise || !formData.remise_type}
                  value={formData.remise_valeur}
                  onChange={(e) => setFormData((prev) => ({ ...prev, remise_valeur: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder={formData.remise_type === 'pourcentage' ? 'Ex: 20' : 'Ex: 10'}
                  inputMode="decimal"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Si vous laissez &quot;Aucune remise&quot;, la remise actuelle sera supprimée sur tous les produits sélectionnés.
            </p>
          </div>

          {/* Tarifs par tranche */}
          <div className={getCardClasses(updateFields.prix_par_tranche)}>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="check_prix_par_tranche"
                checked={updateFields.prix_par_tranche}
                onChange={() => handleToggle('prix_par_tranche')}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="check_prix_par_tranche" className="font-medium text-gray-900 cursor-pointer">Tarifs par tranche</label>
            </div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="text-sm text-gray-600">Activer les tarifs par quantité</span>
              <label className={`flex items-center gap-2 ${updateFields.prix_par_tranche ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  disabled={!updateFields.prix_par_tranche}
                  checked={formData.tranches_actives}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      tranches_actives: e.target.checked,
                      tranches: e.target.checked
                        ? (prev.tranches.length > 0 ? prev.tranches : [createEmptyTranche()])
                        : [],
                    }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700">Oui</span>
              </label>
            </div>

            {formData.tranches_actives && (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="pb-2 pr-3 font-medium">Qté min</th>
                        <th className="pb-2 pr-3 font-medium">Qté max</th>
                        <th className="pb-2 pr-3 font-medium">
                          {formData.type_frequence === 'mensuel' ? 'Prix mensuel (€)' : 'Prix vente (€)'}
                        </th>
                        <th className="pb-2 pr-3 font-medium">FAS (€)</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.tranches.map((tranche, idx) => (
                        <tr key={tranche.id} className="border-b border-gray-100">
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              disabled={!updateFields.prix_par_tranche}
                              value={tranche.qte_min}
                              onChange={(e) => updateTranche(idx, { qte_min: Number(e.target.value) })}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min={tranche.qte_min}
                              step="1"
                              disabled={!updateFields.prix_par_tranche}
                              value={tranche.qte_max ?? ''}
                              placeholder="∞"
                              onChange={(e) =>
                                updateTranche(idx, { qte_max: e.target.value === '' ? null : Number(e.target.value) })
                              }
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={!updateFields.prix_par_tranche}
                              value={formData.type_frequence === 'mensuel' ? (tranche.prix_mensuel ?? '') : (tranche.prix_vente ?? '')}
                              placeholder="Par défaut"
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : Number(e.target.value);
                                updateTranche(
                                  idx,
                                  formData.type_frequence === 'mensuel'
                                    ? { prix_mensuel: value, prix_vente: undefined }
                                    : { prix_vente: value, prix_mensuel: undefined },
                                );
                              }}
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={!updateFields.prix_par_tranche}
                              value={tranche.prix_installation ?? ''}
                              placeholder="Par défaut"
                              onChange={(e) =>
                                updateTranche(idx, {
                                  prix_installation: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                              }
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              disabled={!updateFields.prix_par_tranche}
                              onClick={() => removeTranche(idx)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded disabled:text-gray-300 disabled:hover:bg-transparent"
                              title="Supprimer la tranche"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  disabled={!updateFields.prix_par_tranche}
                  onClick={addTranche}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une tranche
                </button>
                <p className="text-xs text-gray-500">
                  La dernière tranche peut rester sans quantité max pour couvrir les quantités illimitées.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-300"
              disabled={isSaving}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? 'Modification...' : 'Appliquer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
