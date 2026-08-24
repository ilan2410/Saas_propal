import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CatalogueView } from '@/components/catalogue/CatalogueView';
import { resolveOrgContext } from '@/lib/auth/org-context';

export const revalidate = 0;

export default async function CataloguePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctx = user ? await resolveOrgContext(supabase, user) : null;

  if (ctx && ctx.role !== 'owner' && !ctx.permissions.manage_catalogue) {
    redirect('/dashboard');
  }

  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .eq('actif', true)
    .eq('organization_id', ctx?.organizationId) // Filtrer uniquement les produits de l'organisation
    .order('nom', { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <CatalogueView initialProducts={produits || []} />
      </div>
    </div>
  );
}

