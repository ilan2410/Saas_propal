'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { CatalogueCategorie } from '@/types';

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
  fournisseur?: string;
  description?: string;
  type_frequence?: 'mensuel' | 'unique';
  prix_mensuel?: number;
  prix_vente?: number;
  prix_installation?: number;
  engagement_mois?: number;
};

export function BulkEditModal({
  isOpen,
  onClose,
  selectedIds,
  isAdmin = false,
  onSuccess,
  fournisseurOptions,
}: BulkEditModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  // States for each field's value and whether it is being updated
  const [updateFields, setUpdateFields] = useState<Record<keyof BulkUpdateData, boolean>>({
    categorie: false,
    fournisseur: false,
    description: false,
    type_frequence: false,
    prix_mensuel: false,
    prix_vente: false,
    prix_installation: false,
    engagement_mois: false,
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
  }>({
    categorie: 'mobile',
    fournisseur: '',
    description: '',
    type_frequence: 'mensuel',
    prix_mensuel: '',
    prix_vente: '',
    prix_installation: '',
    engagement_mois: '',
  });

  if (!isOpen) return null;

  const categorieOptions: Array<{ value: CatalogueCategorie; label: string }> = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'internet', label: 'Internet' },
    { value: 'fixe', label: 'Fixe' },
    { value: 'cloud', label: 'Cloud' },
    { value: 'equipement', label: 'Équipement' },
    { value: 'autre', label: 'Autre' },
  ];

  const handleToggle = (field: keyof BulkUpdateData) => {
    setUpdateFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct updates object with only selected fields
    const updates: BulkUpdateData = {};
    
    if (updateFields.categorie) updates.categorie = formData.categorie;
    if (updateFields.fournisseur) {
      const fournisseur = formData.fournisseur.trim();
      if (!fournisseur) {
        alert('Veuillez sélectionner un fournisseur');
        return;
      }
      updates.fournisseur = fournisseur;
    }
    if (updateFields.description) updates.description = formData.description.trim() || undefined;
    
    if (updateFields.type_frequence) {
      updates.type_frequence = formData.type_frequence;
      // If changing type, we might want to reset the other price type or set defaults?
      // For now, we just update the type. The user should probably update the corresponding price too.
    }
    
    if (updateFields.prix_mensuel && formData.prix_mensuel) updates.prix_mensuel = Number(formData.prix_mensuel);
    if (updateFields.prix_vente && formData.prix_vente) updates.prix_vente = Number(formData.prix_vente);
    if (updateFields.prix_installation && formData.prix_installation) updates.prix_installation = Number(formData.prix_installation);
    if (updateFields.engagement_mois && formData.engagement_mois) updates.engagement_mois = Number(formData.engagement_mois);

    if (Object.keys(updates).length === 0) {
      alert('Aucun champ sélectionné pour la modification');
      return;
    }

    setIsSaving(true);
    try {
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.categorie ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.fournisseur ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
                <option value="">
                  {fournisseurOptions.length === 0 ? 'Aucun fournisseur existant' : 'Sélectionner un fournisseur'}
                </option>
                {fournisseurOptions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Type de facturation */}
            <div className={`p-4 rounded-lg border transition-all ${updateFields.type_frequence ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.engagement_mois ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.prix_mensuel ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.prix_vente ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
            <div className={`p-4 rounded-lg border transition-all ${updateFields.prix_installation ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
          </div>

          {/* Description */}
          <div className={`p-4 rounded-lg border transition-all ${updateFields.description ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 opacity-75'}`}>
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
