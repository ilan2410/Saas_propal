'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, ImageIcon, Trash2 } from 'lucide-react';
import type { CatalogueCategorie, CatalogueProduit } from '@/types';

type FormState = {
  categorie: CatalogueCategorie;
  nom: string;
  description: string;
  fournisseur: string;
  type_frequence: 'mensuel' | 'unique';
  prix_mensuel: string;
  prix_vente: string;
  prix_installation: string;
  engagement_mois: string;
  image_url: string;
  actif: boolean;
};

export function CatalogueProduitForm({
  mode,
  initialProduit,
  isAdmin = false,
}: {
  mode: 'create' | 'edit';
  initialProduit?: Partial<CatalogueProduit>;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialState: FormState = useMemo(() => {
    const categorie = (initialProduit?.categorie || 'mobile') as CatalogueCategorie;
    const type_frequence = initialProduit?.type_frequence || 'mensuel';

    return {
      categorie,
      nom: initialProduit?.nom || '',
      description: initialProduit?.description || '',
      fournisseur: initialProduit?.fournisseur || '',
      type_frequence,
      prix_mensuel:
        initialProduit?.prix_mensuel !== undefined && initialProduit?.prix_mensuel !== null
          ? String(initialProduit.prix_mensuel)
          : '',
      prix_vente:
        initialProduit?.prix_vente !== undefined && initialProduit?.prix_vente !== null
          ? String(initialProduit.prix_vente)
          : '',
      prix_installation:
        initialProduit?.prix_installation !== undefined && initialProduit?.prix_installation !== null
          ? String(initialProduit.prix_installation)
          : '',
      engagement_mois:
        initialProduit?.engagement_mois !== undefined && initialProduit?.engagement_mois !== null
          ? String(initialProduit.engagement_mois)
          : '',
      image_url: initialProduit?.image_url || '',
      actif: initialProduit?.actif ?? true,
    };
  }, [initialProduit]);

  const [form, setForm] = useState<FormState>(initialState);

  const categorieOptions: Array<{ value: CatalogueCategorie; label: string }> = [
    { value: 'mobile', label: 'Mobile' },
    { value: 'internet', label: 'Internet' },
    { value: 'fixe', label: 'Fixe' },
    { value: 'cloud', label: 'Cloud' },
    { value: 'equipement', label: 'Équipement' },
    { value: 'autre', label: 'Autre' },
  ];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 5 Mo");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('catalogue-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('catalogue-images')
        .getPublicUrl(filePath);

      setForm(p => ({ ...p, image_url: publicUrl }));
    } catch (err) {
      console.error('Upload error:', err);
      alert("Erreur lors de l'upload de l'image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialProduit?.id) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/catalogue/${initialProduit.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_global: isAdmin }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Erreur lors de la suppression');
      }

      router.push(isAdmin ? '/admin/catalogue/tous' : '/catalogue');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        categorie: form.categorie,
        nom: form.nom.trim(),
        description: form.description.trim() || null,
        fournisseur: form.fournisseur.trim() || null,
        type_frequence: form.type_frequence,
        prix_mensuel: form.type_frequence === 'mensuel' ? Number(form.prix_mensuel) : null,
        prix_vente: form.type_frequence === 'unique' ? Number(form.prix_vente) : null,
        prix_installation: form.prix_installation ? Number(form.prix_installation) : null,
        engagement_mois:
          form.type_frequence === 'mensuel' && form.engagement_mois
            ? Number(form.engagement_mois)
            : null,
        image_url: form.image_url || null,
        actif: form.actif,
        is_global: isAdmin, // Indiquer qu'il s'agit d'un produit global si l'utilisateur est admin
      };

      if (!payload.nom) {
        alert('Le nom est requis');
        return;
      }
      if (
        payload.type_frequence === 'mensuel' &&
        (payload.prix_mensuel === null || !Number.isFinite(payload.prix_mensuel))
      ) {
        alert('Le prix mensuel est requis et doit être valide');
        return;
      }
      if (
        payload.type_frequence === 'unique' &&
        (payload.prix_vente === null || !Number.isFinite(payload.prix_vente))
      ) {
        alert('Le prix de vente est requis et doit être valide');
        return;
      }

      const isBaseProduct = initialProduit?.est_produit_base;
      const url =
        mode === 'edit' && initialProduit?.id && !isBaseProduct
          ? `/api/catalogue/${initialProduit.id}`
          : '/api/catalogue';
      const method = mode === 'edit' && !isBaseProduct ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Erreur serveur');
      }

      router.push(isAdmin ? '/admin/catalogue/tous' : '/catalogue');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
          <select
            value={form.categorie}
            onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value as CatalogueCategorie }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
          >
            {categorieOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
          <input
            value={form.nom}
            onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="Ex: Fibre Pro 1Gb"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Photo du produit</label>
        <div className="flex items-center gap-4">
          <div 
            className="w-24 h-24 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {form.image_url ? (
              <img src={form.image_url} alt="Aperçu" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Upload en cours...' : 'Changer la photo'}
            </button>
            <p className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP (Max 5Mo)</p>
          </div>
          {form.image_url && (
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, image_url: '' }))}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
              title="Supprimer la photo"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-24"
          placeholder="Décrivez brièvement le produit"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
          <input
            value={form.fournisseur}
            onChange={(e) => setForm((p) => ({ ...p, fournisseur: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="Ex: Orange Business"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            id="actif"
            type="checkbox"
            checked={form.actif}
            onChange={(e) => setForm((p) => ({ ...p, actif: e.target.checked }))}
            className="h-4 w-4"
          />
          <label htmlFor="actif" className="text-sm text-gray-700">
            Produit actif
          </label>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Type de facturation</label>
        <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, type_frequence: 'mensuel' }))}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              form.type_frequence === 'mensuel'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Mensuel (Abonnement)
          </button>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, type_frequence: 'unique' }))}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              form.type_frequence === 'unique'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Unique (Achat)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {form.type_frequence === 'mensuel' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix mensuel (€)</label>
              <input
                value={form.prix_mensuel}
                onChange={(e) => setForm((p) => ({ ...p, prix_mensuel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                inputMode="decimal"
                placeholder="Ex: 49.99"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engagement (mois)</label>
              <input
                value={form.engagement_mois}
                onChange={(e) => setForm((p) => ({ ...p, engagement_mois: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                inputMode="numeric"
                placeholder="Ex: 12"
              />
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prix de vente HT (€)
            </label>
            <input
              value={form.prix_vente}
              onChange={(e) => setForm((p) => ({ ...p, prix_vente: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              inputMode="decimal"
              placeholder="Ex: 299.00"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frais d&apos;installation / mise en service (€)
          </label>
          <input
            value={form.prix_installation}
            onChange={(e) => setForm((p) => ({ ...p, prix_installation: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            inputMode="decimal"
            placeholder="Ex: 99.00"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(isAdmin ? '/admin/catalogue/tous' : '/catalogue')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            disabled={isSaving || isDeleting}
          >
            Annuler
          </button>
          {mode === 'edit' && initialProduit?.id && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2"
              disabled={isSaving || isDeleting}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          disabled={isSaving || isDeleting}
        >
          {isSaving ? 'Sauvegarde...' : mode === 'edit' ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
