'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, ImageIcon, Trash2, Plus, Search } from 'lucide-react';
import type { CatalogueCategorie, CatalogueProduit, CatalogueProduitTranche, ProduitDestinations } from '@/types';

type FormState = {
  categorie: CatalogueCategorie;
  nom: string;
  description: string;
  fournisseur: string;
  type_frequence: 'mensuel' | 'unique';
  mode_fas: 'fixe_par_selection' | 'multiplie_par_quantite';
  prix_mensuel: string;
  remise_type: 'fixe' | 'pourcentage' | '';
  remise_valeur: string;
  prix_vente: string;
  prix_installation: string;
  engagement_mois: string;
  image_url: string;
  actif: boolean;
  destinations: ProduitDestinations;
  tranches_actives: boolean;
  tranches: CatalogueProduitTranche[];
  options_produits_ids: string[];
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
    const tranches = initialProduit?.prix_par_tranche ?? [];

    return {
      categorie,
      nom: initialProduit?.nom || '',
      description: initialProduit?.description || '',
      fournisseur: initialProduit?.fournisseur || '',
      type_frequence,
      mode_fas: initialProduit?.mode_fas || 'fixe_par_selection',
      prix_mensuel:
        initialProduit?.prix_mensuel !== undefined && initialProduit?.prix_mensuel !== null
          ? String(initialProduit.prix_mensuel)
          : '',
      remise_type: (initialProduit?.remise_type as 'fixe' | 'pourcentage' | '') || '',
      remise_valeur:
        initialProduit?.remise_valeur !== undefined && initialProduit?.remise_valeur !== null
          ? String(initialProduit.remise_valeur)
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
      destinations: initialProduit?.destinations ?? { proposition: true, bdc_operateur: true, bdc_materiel: true },
      tranches_actives: tranches.length > 0,
      tranches,
      options_produits_ids: initialProduit?.options_produits_ids ?? [],
    };
  }, [initialProduit]);

  const [form, setForm] = useState<FormState>(initialState);
  const [catalogueProduits, setCatalogueProduits] = useState<CatalogueProduit[]>([]);
  const [optionsSearch, setOptionsSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/catalogue');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.produits)) {
          setCatalogueProduits(json.produits as CatalogueProduit[]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const optionCandidates = useMemo(
    () => catalogueProduits.filter((p) => p.id !== initialProduit?.id),
    [catalogueProduits, initialProduit?.id],
  );
  const filteredOptionCandidates = useMemo(() => {
    const term = optionsSearch.trim().toLowerCase();
    if (!term) return optionCandidates;
    return optionCandidates.filter((p) =>
      [p.nom, p.fournisseur, p.categorie].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [optionCandidates, optionsSearch]);

  const toggleOption = (id: string) =>
    setForm((p) => ({
      ...p,
      options_produits_ids: p.options_produits_ids.includes(id)
        ? p.options_produits_ids.filter((x) => x !== id)
        : [...p.options_produits_ids, id],
    }));
  const hasInstallationFee = form.prix_installation.trim() !== '' && Number.isFinite(Number(form.prix_installation));

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

  const addTranche = () => {
    const last = form.tranches[form.tranches.length - 1];
    const qte_min = last ? (last.qte_max !== null ? last.qte_max + 1 : last.qte_min + 1) : 1;
    setForm((p) => ({
      ...p,
      tranches: [
        ...p.tranches,
        { id: crypto.randomUUID(), qte_min, qte_max: null, prix_vente: undefined, prix_mensuel: undefined, prix_installation: undefined },
      ],
    }));
  };

  const updateTranche = (idx: number, patch: Partial<CatalogueProduitTranche>) => {
    setForm((p) => ({
      ...p,
      tranches: p.tranches.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const removeTranche = (idx: number) => {
    setForm((p) => ({ ...p, tranches: p.tranches.filter((_, i) => i !== idx) }));
  };

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
      // Validate tranches: no overlapping ranges
      if (form.tranches_actives && form.tranches.length > 0) {
        for (let i = 0; i < form.tranches.length - 1; i++) {
          const curr = form.tranches[i];
          if (curr.qte_max === null) {
            alert('Seule la dernière tranche peut avoir une quantité max illimitée (∞)');
            return;
          }
          if (curr.qte_max < curr.qte_min) {
            alert(`Tranche ${i + 1} : la quantité max doit être supérieure à la quantité min`);
            return;
          }
        }
      }

      const payload = {
        categorie: form.categorie,
        nom: form.nom.trim(),
        description: form.description.trim() || null,
        fournisseur: form.fournisseur.trim() || null,
        type_frequence: form.type_frequence,
        mode_fas: form.mode_fas,
        prix_mensuel: form.type_frequence === 'mensuel' ? Number(form.prix_mensuel) : null,
        remise_type: form.type_frequence === 'mensuel' && form.remise_type ? form.remise_type : null,
        remise_valeur: form.type_frequence === 'mensuel' && form.remise_valeur.trim() ? Number(form.remise_valeur) : null,
        prix_vente: form.type_frequence === 'unique' ? Number(form.prix_vente) : null,
        prix_installation: form.prix_installation ? Number(form.prix_installation) : null,
        engagement_mois:
          form.type_frequence === 'mensuel' && form.engagement_mois
            ? Number(form.engagement_mois)
            : null,
        image_url: form.image_url || null,
        actif: form.actif,
        destinations: form.destinations,
        prix_par_tranche: form.tranches_actives && form.tranches.length > 0 ? form.tranches : null,
        options_produits_ids: form.options_produits_ids.length > 0 ? form.options_produits_ids : null,
        is_global: isAdmin,
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
      if (payload.remise_valeur !== null && !Number.isFinite(payload.remise_valeur)) {
        alert('La valeur de remise doit être valide');
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

      {/* Destinations dans les documents */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Destinations dans les documents</h3>
        <div className="flex flex-wrap gap-6">
          {([
            { key: 'proposition', label: 'Proposition commerciale' },
            { key: 'bdc_operateur', label: 'BDC Opérateur' },
            { key: 'bdc_materiel', label: 'BDC Matériel' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.destinations[key]}
                onChange={(e) =>
                  setForm((p) => ({ ...p, destinations: { ...p.destinations, [key]: e.target.checked } }))
                }
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de remise</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="remise_type"
                    value="fixe"
                    checked={form.remise_type === 'fixe'}
                    onChange={(e) => setForm((p) => ({ ...p, remise_type: e.target.value as 'fixe' | 'pourcentage' }))}
                  />
                  <span className="text-sm text-gray-700">Montant fixe</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="remise_type"
                    value="pourcentage"
                    checked={form.remise_type === 'pourcentage'}
                    onChange={(e) => setForm((p) => ({ ...p, remise_type: e.target.value as 'fixe' | 'pourcentage' }))}
                  />
                  <span className="text-sm text-gray-700">Pourcentage</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valeur de remise {form.remise_type === 'pourcentage' ? '(%)' : '(€ / mois)'}
              </label>
              <input
                value={form.remise_valeur}
                onChange={(e) => setForm((p) => ({ ...p, remise_valeur: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                inputMode="decimal"
                placeholder={form.remise_type === 'pourcentage' ? 'Ex: 20' : 'Ex: 10'}
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

      {hasInstallationFee && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Application du FAS
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, mode_fas: 'fixe_par_selection' }))}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                form.mode_fas === 'fixe_par_selection'
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="text-sm font-medium">FAS appliqué une seule fois</div>
              <div className="mt-1 text-xs text-gray-500">
                Le FAS reste fixe, même si la quantité augmente.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, mode_fas: 'multiplie_par_quantite' }))}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                form.mode_fas === 'multiplie_par_quantite'
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="text-sm font-medium">FAS multiplié par quantité</div>
              <div className="mt-1 text-xs text-gray-500">
                Le FAS est recalculé pour chaque unité sélectionnée.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Tarifs par quantité */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Tarifs par quantité (tranches)</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.tranches_actives}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  tranches_actives: e.target.checked,
                  tranches: e.target.checked && p.tranches.length === 0
                    ? [{ id: crypto.randomUUID(), qte_min: 1, qte_max: null }]
                    : p.tranches,
                }))
              }
              className="h-4 w-4"
            />
            <span className="text-sm text-gray-600">Activer les tarifs par tranche</span>
          </label>
        </div>

        {form.tranches_actives && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="pb-2 pr-3 font-medium">Qté min</th>
                    <th className="pb-2 pr-3 font-medium">Qté max (vide = ∞)</th>
                    {form.type_frequence === 'mensuel' && <th className="pb-2 pr-3 font-medium">Prix mensuel (€)</th>}
                    {form.type_frequence === 'unique' && <th className="pb-2 pr-3 font-medium">Prix vente (€)</th>}
                    <th className="pb-2 pr-3 font-medium">FAS (€)</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="space-y-2">
                  {form.tranches.map((t, idx) => (
                    <tr key={t.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={t.qte_min}
                          onChange={(e) => updateTranche(idx, { qte_min: Number(e.target.value) })}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min={t.qte_min}
                          step="1"
                          value={t.qte_max ?? ''}
                          placeholder="∞"
                          onChange={(e) =>
                            updateTranche(idx, { qte_max: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.type_frequence === 'mensuel' ? (t.prix_mensuel ?? '') : (t.prix_vente ?? '')}
                          placeholder="Par défaut"
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                            updateTranche(idx, form.type_frequence === 'mensuel' ? { prix_mensuel: val } : { prix_vente: val });
                          }}
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={t.prix_installation ?? ''}
                          placeholder="Par défaut"
                          onChange={(e) =>
                            updateTranche(idx, { prix_installation: e.target.value === '' ? undefined : Number(e.target.value) })
                          }
                          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeTranche(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Supprimer la tranche"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addTranche}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" />
              Ajouter une règle de prix
            </button>
            <p className="text-xs text-gray-500">
              Les tranches sont évaluées dans l&apos;ordre. La première dont la quantité correspond est appliquée.
              Seule la dernière tranche peut avoir une quantité max illimitée (∞).
            </p>
          </div>
        )}
      </div>

      {/* Options liées */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-1">Options liées</h3>
        <p className="text-xs text-gray-500 mb-3">
          Sélectionnez d&apos;autres produits du catalogue à proposer en option lorsque ce produit
          est choisi dans le questionnaire SP.
        </p>

        {form.options_produits_ids.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {form.options_produits_ids.map((id) => {
              const p = catalogueProduits.find((c) => c.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs text-blue-800"
                >
                  {p?.nom ?? id}
                  <button
                    type="button"
                    onClick={() => toggleOption(id)}
                    className="text-blue-400 hover:text-red-600"
                    title="Retirer l'option"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={optionsSearch}
            onChange={(e) => setOptionsSearch(e.target.value)}
            placeholder="Rechercher un produit à ajouter en option..."
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {filteredOptionCandidates.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">Aucun produit disponible</p>
          ) : (
            filteredOptionCandidates.map((p) => {
              const checked = form.options_produits_ids.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(p.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-800 truncate">{p.nom}</span>
                    <span className="block text-xs text-gray-400 truncate">
                      {[p.categorie, p.fournisseur].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })
          )}
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
