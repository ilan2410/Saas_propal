import Link from 'next/link';
import { ArrowLeft, Copy } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CatalogueProduitForm } from '@/components/catalogue/CatalogueProduitForm';
import type { CatalogueProduit } from '@/types';

export const revalidate = 0;

export default async function NewCatalogueProductPage({
  searchParams,
}: {
  searchParams: { duplicate?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { duplicate } = searchParams;

  let produitDuplique: Record<string, unknown> | null = null;
  if (duplicate) {
    const { data } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('id', duplicate)
      .single();

    if (data) {
      produitDuplique = data as Record<string, unknown>;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/catalogue"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au catalogue
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ajouter un produit</h1>
            <p className="text-gray-600 mt-2">
              Créez un produit personnalisé pour vos propositions
            </p>
          </div>

          {produitDuplique && (
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
              <Copy className="w-4 h-4" />
              Dupliqué depuis un produit existant
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <CatalogueProduitForm
          mode="create"
          initialProduit={
            produitDuplique
              ? ({
                  categorie: produitDuplique.categorie,
                  nom: produitDuplique.nom,
                  description: produitDuplique.description,
                  fournisseur: produitDuplique.fournisseur,
                  prix_mensuel: produitDuplique.prix_mensuel,
                  prix_installation: produitDuplique.prix_installation,
                  engagement_mois: produitDuplique.engagement_mois,
                  caracteristiques: produitDuplique.caracteristiques,
                  tags: produitDuplique.tags,
                  actif: true,
                } as Partial<CatalogueProduit>)
              : undefined
          }
        />
      </div>
    </div>
  );
}
