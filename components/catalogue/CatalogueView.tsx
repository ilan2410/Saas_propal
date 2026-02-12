'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, Pencil, Search, LayoutGrid, List, Filter, ChevronLeft, ChevronRight, ImageIcon, Trash2, X } from 'lucide-react';
import { CatalogueProduit, CatalogueCategorie } from '@/types';
import { CatalogueHeader } from './CatalogueHeader';
import { BulkEditModal } from './BulkEditModal';

interface CatalogueViewProps {
  initialProducts: CatalogueProduit[];
  showHeader?: boolean;
  isAdmin?: boolean;
}

function formatPrice(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)}€`;
}

const ITEMS_PER_PAGE = 9;

export function CatalogueView({ initialProducts, showHeader = true, isAdmin = false }: CatalogueViewProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CatalogueCategorie | 'all'>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Extract unique suppliers for filter
  const suppliers = useMemo(() => {
    const isNonEmptyString = (value: unknown): value is string =>
      typeof value === 'string' && value.trim().length > 0;

    const s = new Set(initialProducts.map((p) => p.fournisseur).filter(isNonEmptyString));
    return Array.from(s).sort();
  }, [initialProducts]);

  const categories: { value: CatalogueCategorie | 'all'; label: string }[] = [
    { value: 'all', label: 'Toutes catégories' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'internet', label: 'Internet' },
    { value: 'fixe', label: 'Fixe' },
    { value: 'cloud', label: 'Cloud' },
    { value: 'equipement', label: 'Équipement' },
    { value: 'autre', label: 'Autre' },
  ];

  // Filter and Search Logic
  const filteredProducts = useMemo(() => {
    return initialProducts.filter(product => {
      // Search Text
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        product.nom.toLowerCase().includes(searchLower) ||
        product.description?.toLowerCase().includes(searchLower);

      // Category Filter
      const matchesCategory = selectedCategory === 'all' || product.categorie === selectedCategory;

      // Supplier Filter
      const matchesSupplier = selectedSupplier === 'all' || product.fournisseur === selectedSupplier;

      return matchesSearch && matchesCategory && matchesSupplier;
    });
  }, [initialProducts, searchQuery, selectedCategory, selectedSupplier]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchQuery, selectedCategory, selectedSupplier]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedProducts.map(p => p.id)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/catalogue/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_global: isAdmin || !showHeader }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Erreur lors de la suppression');
      }

      router.refresh();
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedIds.size} produits ?`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/catalogue/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ids: Array.from(selectedIds),
          is_global: isAdmin || !showHeader
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Erreur lors de la suppression multiple');
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression multiple');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {showHeader && <CatalogueHeader />}

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un produit (nom, description)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CatalogueCategorie | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 max-w-[150px]"
            >
              <option value="all">Tous fournisseurs</option>
              {suppliers.map(s => (
                <option key={s} value={s as string}>{s}</option>
              ))}
            </select>
          </div>

          <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'grid' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Vue Grille"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'list' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Vue Liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-gray-500 px-1">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer hover:text-gray-700 transition-colors select-none">
            <input
              type="checkbox"
              checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.has(p.id))}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Tout sélectionner</span>
          </label>
          <div className="h-4 w-px bg-gray-300" />
          <p>
            {filteredProducts.length} résultat{filteredProducts.length > 1 ? 's' : ''}
            {searchQuery && ` pour "${searchQuery}"`}
          </p>
        </div>
        {totalPages > 1 && (
          <p>Page {currentPage} sur {totalPages}</p>
        )}
      </div>

      {/* Products Grid/List */}
      {paginatedProducts.length > 0 ? (
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            : "space-y-3"
        }>
          {paginatedProducts.map((p) => (
            <div
              key={p.id}
              className={`bg-white rounded-xl border border-gray-200 hover:shadow-xl hover:border-gray-300 transition-all duration-300 ${
                viewMode === 'list' ? 'p-4 flex items-center gap-6' : 'p-6'
              }`}
            >
              {/* Card Content - Adapted for Grid/List */}
              <div className={viewMode === 'list' ? 'flex-1 min-w-0 grid grid-cols-12 gap-4 items-center' : ''}>
                
                {viewMode === 'list' && (
                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shadow-sm cursor-pointer"
                    />
                  </div>
                )}

                {/* Header / Main Info */}
                <div className={viewMode === 'list' ? 'col-span-3 flex items-center gap-4' : 'flex items-start justify-between gap-4 mb-3'}>
                  {/* Image in Grid Mode */}
                  {viewMode === 'grid' && (
                    <div className="relative group">
                      <div className={`absolute -top-2 -left-2 z-10 transition-opacity ${selectedIds.has(p.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(p.id);
                          }}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shadow-sm cursor-pointer bg-white"
                        />
                      </div>
                      {p.image_url ? (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                          <img src={p.image_url} alt={p.nom} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Image in List Mode */}
                  {viewMode === 'list' && (
                    p.image_url ? (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                        <img src={p.image_url} alt={p.nom} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-8 h-8 text-gray-300" />
                      </div>
                    )
                  )}

                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg truncate">{p.nom}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {p.categorie}
                      </span>
                    </div>
                  </div>
                  {viewMode === 'grid' && (
                    <div className="flex items-center gap-2">
                      <Link
                        href={showHeader ? `/catalogue/${p.id}` : `/admin/catalogue/${p.id}`}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4 text-gray-700" />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={isDeleting}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className={viewMode === 'list' ? 'col-span-3' : ''}>
                  {p.fournisseur && <p className="text-sm text-gray-600 mb-1">{p.fournisseur}</p>}
                  {viewMode === 'grid' && p.description && (
                    <p className="text-sm text-gray-600 line-clamp-3 mb-3">{p.description}</p>
                  )}
                </div>

                {/* Price */}
                <div className={
                  viewMode === 'list' 
                    ? 'col-span-3 text-right' 
                    : 'flex items-center justify-between pt-3 border-t border-gray-100'
                }>
                  <div className="text-sm text-gray-600">
                    {p.type_frequence === 'unique' ? 'Prix de vente' : 'Mensuel'}
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {p.type_frequence === 'unique'
                      ? formatPrice(p.prix_vente)
                      : formatPrice(p.prix_mensuel)}
                  </div>
                </div>

                {/* Actions (List Mode) */}
                {viewMode === 'list' && (
                  <div className="col-span-2 flex justify-end gap-2">
                    <Link
                      href={showHeader ? `/catalogue/${p.id}` : `/admin/catalogue/${p.id}`}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4 text-gray-700" />
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={isDeleting}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun produit trouvé</h3>
          <p className="text-gray-600 mb-6">Essayez de modifier vos filtres ou votre recherche.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedSupplier('all');
            }}
            className="text-blue-600 hover:underline font-medium"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white shadow-2xl border border-gray-200 rounded-full px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
          <div className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{selectedIds.size}</span>
            <span>sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          <button
            onClick={() => setIsEditModalOpen(true)}
            disabled={isDeleting}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
          >
            <Pencil className="w-4 h-4" />
            Modifier
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <button
            onClick={handleBulkDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            title="Annuler la sélection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        selectedIds={Array.from(selectedIds)}
        isAdmin={isAdmin || !showHeader}
        fournisseurOptions={suppliers}
        onSuccess={() => {
          setSelectedIds(new Set());
          router.refresh();
        }}
      />
    </div>
  );
}
