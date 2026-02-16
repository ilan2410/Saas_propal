import { createClient } from '@/lib/supabase/server';
import { CatalogueView } from '@/components/catalogue/CatalogueView';
import { CatalogueHeader } from '@/components/catalogue/CatalogueHeader';

export const revalidate = 0;

export default async function AdminTelephoniePage() {
  const supabase = await createClient();
  
  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .is('organization_id', null)
    // .eq('categorie', 'mobile') // Temporairement désactivé pour afficher tous les produits
    .eq('actif', true)
    .order('nom', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Téléphonie (Global)</h1>
          <p className="text-gray-500">Produits mobiles et fixes globaux</p>
        </div>
        <CatalogueHeader 
          showTitle={false} 
          isAdmin={true} 
          createUrl="/admin/catalogue/new?categorie=mobile" 
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CatalogueView initialProducts={produits || []} showHeader={false} isAdmin={true} />
      </div>
    </div>
  );
}
