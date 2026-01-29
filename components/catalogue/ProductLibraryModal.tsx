'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Library, Search, Download, Check, Loader2 } from 'lucide-react';
import type { CatalogueCategorie, CatalogueProduit, Secteur } from '@/types';
import { useRouter } from 'next/navigation';

interface ProductLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProductKeyInput = {
  categorie: CatalogueProduit['categorie'];
  nom: string;
  fournisseur?: string | null;
};

export function ProductLibraryModal({ isOpen, onClose }: ProductLibraryModalProps) {
  const router = useRouter();
  const [products, setProducts] = useState<CatalogueProduit[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());
  const [clientSecteur, setClientSecteur] = useState<Secteur | null>(null);
  const [selectedCategorie, setSelectedCategorie] = useState<'all' | CatalogueCategorie>('all');
  const [selectedFournisseur, setSelectedFournisseur] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategorie('all');
      setSelectedFournisseur('all');
      setSelectedIds(new Set());
      setImportedIds(new Set());
      fetchLibraryProducts();
    }
  }, [isOpen]);

  const normalizeText = (value: string) => value.trim().toLowerCase();

  const buildProductKey = (p: ProductKeyInput) =>
    `${p.categorie}|${normalizeText(p.nom)}|${normalizeText(p.fournisseur ?? '')}`;

  const fetchLibraryProducts = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProducts([]);
        setClientSecteur(null);
        setImportedKeys(new Set());
        return;
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('secteur')
        .eq('id', user.id)
        .single();

      const secteur = (org?.secteur as Secteur) ?? 'telephonie';
      setClientSecteur(secteur);

      const allowedCatalogSectors = secteur === 'mixte' ? ['telephonie', 'bureautique'] : [secteur];

      const { data: userProducts, error: userProductsError } = await supabase
        .from('catalogues_produits')
        .select('categorie, nom, fournisseur')
        .eq('organization_id', user.id)
        .eq('actif', true);

      if (userProductsError) throw userProductsError;

      const userKeySet = new Set<string>(
        (userProducts || []).map((p) =>
          buildProductKey({
            categorie: (p as ProductKeyInput).categorie,
            nom: (p as ProductKeyInput).nom,
            fournisseur: (p as ProductKeyInput).fournisseur ?? null,
          })
        )
      );

      // Récupérer les produits globaux (organization_id est NULL)
      const { data, error } = await supabase
        .from('catalogues_produits')
        .select('*')
        .is('organization_id', null)
        .eq('actif', true)
        .order('nom', { ascending: true });

      if (error) throw error;
      const filtered = (data || []).filter((p) => {
        const secteurCatalogue = ((p as { secteur_catalogue?: unknown })?.secteur_catalogue ?? 'telephonie') as string;
        return allowedCatalogSectors.includes(secteurCatalogue);
      });

      const notAlreadyImported = filtered.filter((p) => {
        const key = buildProductKey({
          categorie: (p as ProductKeyInput).categorie,
          nom: (p as ProductKeyInput).nom,
          fournisseur: (p as ProductKeyInput).fournisseur ?? null,
        });
        return !userKeySet.has(key);
      });

      setImportedKeys(userKeySet);
      setProducts(notAlreadyImported || []);
    } catch (error) {
      console.error('Erreur chargement bibliothèque:', error);
    } finally {
      setLoading(false);
    }
  };

  const insertProductForUser = async (userId: string, product: CatalogueProduit) => {
    const { error } = await supabase.from('catalogues_produits').insert({
      organization_id: userId,
      categorie: product.categorie,
      nom: product.nom,
      description: product.description,
      fournisseur: product.fournisseur,
      type_frequence: product.type_frequence,
      prix_mensuel: product.prix_mensuel,
      prix_vente: product.prix_vente,
      prix_installation: product.prix_installation,
      engagement_mois: product.engagement_mois,
      image_url: product.image_url,
      caracteristiques: product.caracteristiques,
      tags: product.tags,
      est_produit_base: false,
      actif: true,
    });

    if (error) throw error;
  };

  const handleImport = async (product: CatalogueProduit) => {
    try {
      setImporting(product.id);
      
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      await insertProductForUser(user.id, product);

      setImportedIds(prev => new Set(prev).add(product.id));
      setProducts(prev => prev.filter((x) => x.id !== product.id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
      setImportedKeys(prev => {
        const next = new Set(prev);
        next.add(buildProductKey(product));
        return next;
      });
      router.refresh(); // Rafraîchir la liste principale
    } catch (error) {
      console.error('Erreur import:', error);
      alert("Erreur lors de l'import du produit");
    } finally {
      setImporting(null);
    }
  };

  const handleBulkImport = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const toImport = products.filter((p) => selectedIds.has(p.id));
    if (toImport.length === 0) return;

    try {
      setImporting('bulk');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      for (const product of toImport) {
        setImporting(product.id);
        await insertProductForUser(user.id, product);

        setImportedIds(prev => new Set(prev).add(product.id));
        setImportedKeys(prev => {
          const next = new Set(prev);
          next.add(buildProductKey(product));
          return next;
        });
        setProducts(prev => prev.filter((x) => x.id !== product.id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }

      router.refresh();
    } catch (error) {
      console.error('Erreur import multiple:', error);
      alert("Erreur lors de l'import multiple");
    } finally {
      setImporting(null);
    }
  };

  const isBusy = importing !== null;

  const availableCategories = Array.from(new Set(products.map((p) => p.categorie))).sort();
  const availableFournisseurs = Array.from(
    new Set(products.map((p) => p.fournisseur).filter((v): v is string => Boolean(v && v.trim())))
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const filteredProducts = products.filter((p) => {
    if (selectedCategorie !== 'all' && p.categorie !== selectedCategorie) return false;
    if (selectedFournisseur !== 'all' && (p.fournisseur || '') !== selectedFournisseur) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return p.nom.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Library className="w-6 h-6 text-blue-600" />
              Bibliothèque de produits
            </h2>
            <p className="text-sm text-gray-500 mt-1">Importez des produits pré-configurés dans votre catalogue</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher dans la bibliothèque..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={selectedCategorie}
              onChange={(e) => setSelectedCategorie(e.target.value as 'all' | CatalogueCategorie)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Toutes catégories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedFournisseur}
              onChange={(e) => setSelectedFournisseur(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous fournisseurs</option>
              {availableFournisseurs.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              {selectedIds.size > 0 ? `${selectedIds.size} sélectionné(s)` : null}
            </div>
            <button
              onClick={handleBulkImport}
              disabled={selectedIds.size === 0 || isBusy}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedIds.size === 0 || isBusy
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isBusy && importing !== null ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Importer la sélection
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <div key={p.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{p.nom}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {p.categorie}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      disabled={isBusy || importedIds.has(p.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        });
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {p.image_url && (
                      <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover bg-gray-100" />
                    )}
                  </div>
                  
                  {p.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3 h-10">{p.description}</p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                    <div className="text-sm font-medium text-gray-900">
                      {p.type_frequence === 'mensuel' 
                        ? `${p.prix_mensuel}€/mois`
                        : `${p.prix_vente}€`}
                    </div>
                    <button
                      onClick={() => handleImport(p)}
                      disabled={isBusy || importedIds.has(p.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        importedIds.has(p.id)
                          ? 'bg-green-50 text-green-700'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {importing === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : importedIds.has(p.id) ? (
                        <>
                          <Check className="w-4 h-4" />
                          Importé
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Importer
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              {clientSecteur === 'bureautique'
                ? "La bibliothèque Bureautique n'est pas encore disponible."
                : importedKeys.size > 0
                ? "Aucun nouveau produit à importer dans la bibliothèque"
                : 'Aucun produit trouvé dans la bibliothèque'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
