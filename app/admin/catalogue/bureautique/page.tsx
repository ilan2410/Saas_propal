import { createClient } from '@/lib/supabase/server';
import { CatalogueView } from '@/components/catalogue/CatalogueView';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0;

export default async function AdminBureautiquePage() {
  const supabase = await createClient();
  
  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .is('organization_id', null)
    .in('categorie', ['internet', 'cloud', 'equipement', 'autre'])
    .eq('actif', true)
    .order('nom', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bureautique & Internet (Global)</h1>
          <p className="text-gray-500">Connexions, équipements et services cloud globaux</p>
        </div>
        <Link
          href="/admin/catalogue/new?categorie=internet"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          Ajouter un produit
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CatalogueView initialProducts={produits || []} showHeader={false} isAdmin={true} />
      </div>
    </div>
  );
}
