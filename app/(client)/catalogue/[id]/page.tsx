import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CatalogueProduitForm } from '@/components/catalogue/CatalogueProduitForm';
import { resolveOrgContext } from '@/lib/auth/org-context';

export const revalidate = 0;

export default async function EditCatalogueProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) redirect('/login');

  const { data: produit, error } = await supabase
    .from('catalogues_produits')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .single();

  if (error || !produit) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/catalogue?secteur=${produit.secteur_catalogue ?? 'telephonie'}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au catalogue
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Modifier le produit</h1>
          <p className="text-gray-600 mt-2">Mettez à jour votre produit personnalisé</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <CatalogueProduitForm mode="edit" initialProduit={produit} />
      </div>
    </div>
  );
}
