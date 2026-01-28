import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Package, Pencil, Copy } from 'lucide-react';

function formatPrice(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)}€`;
}

export const revalidate = 0;

export default async function CataloguePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .eq('actif', true)
    .order('nom', { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Catalogue
            </h1>
            <p className="text-gray-600 mt-2 text-lg">
              Gérez vos produits et services
            </p>
          </div>

          <Link
            href="/catalogue/new"
            className="group px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 w-fit"
          >
            <Plus className="w-5 h-5" />
            Ajouter un produit
          </Link>
        </div>

        {user && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-gray-600">Total Produits</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{(produits || []).length}</p>
            </div>
          </div>
        )}

        {produits && produits.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {produits.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg truncate">{p.nom}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {p.categorie}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/catalogue/${p.id}`}
                      className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4 text-gray-700" />
                    </Link>
                  </div>
                </div>

                {p.fournisseur && <p className="text-sm text-gray-600 mb-2">{p.fournisseur}</p>}
                {p.description && <p className="text-sm text-gray-600 line-clamp-3 mb-3">{p.description}</p>}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-600">Mensuel</div>
                  <div className="text-lg font-bold text-gray-900">{formatPrice(p.prix_mensuel)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun produit</h3>
            <p className="text-gray-600 mb-6">Ajoutez votre premier produit dans le catalogue.</p>
            <Link
              href="/catalogue/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter un produit
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

