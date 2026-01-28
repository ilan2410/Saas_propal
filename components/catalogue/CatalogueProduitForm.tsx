'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogueCategorie, CatalogueProduit } from '@/types';

type FormState = {
  categorie: CatalogueCategorie;
  nom: string;
  description: string;
  fournisseur: string;
  prix_mensuel: string;
  prix_installation: string;
  engagement_mois: string;
  tags: string;
  caracteristiques: string;
  actif: boolean;
};

export function CatalogueProduitForm({
  mode,
  initialProduit,
}: {
  mode: 'create' | 'edit';
  initialProduit?: Partial<CatalogueProduit>;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const initialState: FormState = useMemo(() => {
    const categorie = (initialProduit?.categorie || 'mobile') as CatalogueCategorie;
    const tags =
      Array.isArray(initialProduit?.tags) && initialProduit?.tags.length > 0
        ? initialProduit.tags.join(', ')
        : '';
    const caracteristiques =
      initialProduit?.caracteristiques && typeof initialProduit.caracteristiques === 'object'
        ? JSON.stringify(initialProduit.caracteristiques, null, 2)
        : '';

    return {
      categorie,
      nom: initialProduit?.nom || '',
      description: initialProduit?.description || '',
      fournisseur: initialProduit?.fournisseur || '',
      prix_mensuel:
        initialProduit?.prix_mensuel !== undefined && initialProduit?.prix_mensuel !== null
          ? String(initialProduit.prix_mensuel)
          : '',
      prix_installation:
        initialProduit?.prix_installation !== undefined && initialProduit?.prix_installation !== null
          ? String(initialProduit.prix_installation)
          : '',
      engagement_mois:
        initialProduit?.engagement_mois !== undefined && initialProduit?.engagement_mois !== null
          ? String(initialProduit.engagement_mois)
          : '',
      tags,
      caracteristiques,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      let caracteristiques: Record<string, unknown> = {};
      if (form.caracteristiques.trim()) {
        const parsed: unknown = JSON.parse(form.caracteristiques);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Les caractéristiques doivent être un objet JSON');
        }
        caracteristiques = parsed as Record<string, unknown>;
      }

      const payload = {
        categorie: form.categorie,
        nom: form.nom.trim(),
        description: form.description.trim() || null,
        fournisseur: form.fournisseur.trim() || null,
        prix_mensuel: Number(form.prix_mensuel),
        prix_installation: form.prix_installation ? Number(form.prix_installation) : null,
        engagement_mois: form.engagement_mois ? Number(form.engagement_mois) : null,
        tags,
        caracteristiques,
        actif: form.actif,
      };

      if (!payload.nom) {
        alert('Le nom est requis');
        return;
      }
      if (!Number.isFinite(payload.prix_mensuel)) {
        alert('Le prix mensuel est invalide');
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

      router.push('/catalogue');
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Prix installation (€)</label>
          <input
            value={form.prix_installation}
            onChange={(e) => setForm((p) => ({ ...p, prix_installation: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            inputMode="decimal"
            placeholder="Ex: 99.00"
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
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags (séparés par des virgules)</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="Ex: professionnel, pme, premium"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Caractéristiques (JSON)</label>
        <textarea
          value={form.caracteristiques}
          onChange={(e) => setForm((p) => ({ ...p, caracteristiques: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm min-h-40"
          placeholder='Ex: {"debit_down_mb": 500, "ip_fixe": true}'
        />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => router.push('/catalogue')}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          disabled={isSaving}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? 'Sauvegarde...' : mode === 'edit' ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
