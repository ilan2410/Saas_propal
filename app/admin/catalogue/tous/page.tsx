import { createClient } from '@/lib/supabase/server';
import { CatalogueView } from '@/components/catalogue/CatalogueView';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CatalogueHeader } from '@/components/catalogue/CatalogueHeader';

export const revalidate = 0;

export default async function AdminCataloguePage() {
  const supabase = await createClient();
  
  // Récupérer uniquement les produits globaux (organization_id est NULL)
  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .is('organization_id', null)
    .eq('actif', true)
    .order('nom', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue Global</h1>
          <p className="text-gray-500">Gérez les produits disponibles pour tous les clients</p>
        </div>
        <div className="flex items-center gap-3">
          <CatalogueHeader showTitle={false} isAdmin={true} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CatalogueView initialProducts={produits || []} showHeader={false} isAdmin={true} />
      </div>
    </div>
  );
}
