'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Upload, Library } from 'lucide-react';
import { ImportProductModal } from './ImportProductModal';
import { ProductLibraryModal } from './ProductLibraryModal';

interface CatalogueHeaderProps {
  showTitle?: boolean;
  isAdmin?: boolean;
  createUrl?: string;
}

export function CatalogueHeader({ showTitle = true, isAdmin = false, createUrl }: CatalogueHeaderProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const defaultCreateUrl = isAdmin ? "/admin/catalogue/new" : "/catalogue/new";
  const targetCreateUrl = createUrl || defaultCreateUrl;

  return (
    <div className={showTitle ? "flex flex-col md:flex-row md:items-center md:justify-between gap-4" : ""}>
      {showTitle && (
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            Catalogue
          </h1>
          <p className="text-gray-600 mt-2 text-lg">
            Gérez vos produits et services
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!isAdmin && (
          <button
            onClick={() => setIsLibraryOpen(true)}
            className="px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold shadow-sm flex items-center gap-2"
          >
            <Library className="w-5 h-5 text-blue-600" />
            <span className="hidden sm:inline">Bibliothèque</span>
          </button>
        )}

        <button
          onClick={() => setIsImportOpen(true)}
          className="px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold shadow-sm flex items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          <span className="hidden sm:inline">Importer</span>
        </button>

        <Link
          href={targetCreateUrl}
          className="group px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 w-fit"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Ajouter un produit</span>
          <span className="sm:hidden">Ajouter</span>
        </Link>
      </div>

      <ImportProductModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} isAdmin={isAdmin} />
      {!isAdmin && <ProductLibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />}
    </div>
  );
}
