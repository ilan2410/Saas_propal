import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CatalogueProduitForm } from '@/components/catalogue/CatalogueProduitForm';
import { redirect } from 'next/navigation';
import type { CatalogueCategorie } from '@/types';

export default async function NewAdminProductPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Vérifier le rôle admin
  const role = user.user_metadata?.role;
  if (role !== 'admin') {
    redirect('/dashboard');
  }

  const resolvedSearchParams = await searchParams;
  const categorieParam = typeof resolvedSearchParams.categorie === 'string' ? resolvedSearchParams.categorie : undefined;

  const isCatalogueCategorie = (value: string): value is CatalogueCategorie =>
    value === 'mobile' ||
    value === 'internet' ||
    value === 'fixe' ||
    value === 'cloud' ||
    value === 'equipement' ||
    value === 'autre';

  const categorie = categorieParam && isCatalogueCategorie(categorieParam) ? categorieParam : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/catalogue/tous"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au catalogue global
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nouveau produit global</h1>
          <p className="text-gray-600 mt-2">Ce produit sera visible par tous les clients et importable dans leur catalogue.</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <CatalogueProduitForm 
          mode="create" 
          initialProduit={categorie ? { categorie } : {}} 
          isAdmin={true}
        />
      </div>
    </div>
  );
}
