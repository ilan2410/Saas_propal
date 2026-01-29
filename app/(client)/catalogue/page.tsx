import { createClient } from '@/lib/supabase/server';
import { CatalogueView } from '@/components/catalogue/CatalogueView';

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
    .eq('organization_id', user?.id) // Filtrer uniquement les produits de l'utilisateur
    .order('nom', { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <CatalogueView initialProducts={produits || []} />
      </div>
    </div>
  );
}

