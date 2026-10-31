import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CatalogueView } from '@/components/catalogue/CatalogueView';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { createServiceClient } from '@/lib/supabase/server';
import { defaultSecteur, isAllowedSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export const revalidate = 0;

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ secteur?: string }> }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctx = user ? await resolveOrgContext(supabase, user) : null;

  if (ctx && ctx.role !== 'owner' && !ctx.permissions.manage_catalogue) {
    redirect('/dashboard');
  }
  const { data: organization } = await createServiceClient().from('organizations')
    .select('secteur').eq('id', ctx?.organizationId).single();
  const orgSecteur = organization?.secteur as Secteur;
  if (!orgSecteur) redirect('/dashboard');
  const requested = (await searchParams).secteur;
  const secteur = requested ?? defaultSecteur(orgSecteur);
  if (!isAllowedSecteur(orgSecteur, secteur)) redirect('/catalogue');

  const { data: produits } = await supabase
    .from('catalogues_produits')
    .select('*')
    .eq('actif', true)
    .eq('organization_id', ctx?.organizationId) // Filtrer uniquement les produits de l'organisation
    .eq('secteur_catalogue', secteur)
    .order('nom', { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <CatalogueView key={secteur} initialProducts={produits || []} secteur={secteur} />
      </div>
    </div>
  );
}
