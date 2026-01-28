import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const categorie = searchParams.get('categorie');

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .order('est_produit_base', { ascending: false })
      .order('nom', { ascending: true });

    if (categorie && categorie !== 'all') {
      query = query.eq('categorie', categorie);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produits: data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch catalogue' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('catalogues_produits')
      .insert({
        organization_id: user.id,
        categorie: body?.categorie,
        nom: body?.nom,
        description: body?.description ?? null,
        fournisseur: body?.fournisseur ?? null,
        prix_mensuel: body?.prix_mensuel,
        prix_installation: body?.prix_installation ?? null,
        engagement_mois: body?.engagement_mois ?? null,
        caracteristiques: body?.caracteristiques ?? {},
        tags: body?.tags ?? [],
        est_produit_base: false,
        actif: body?.actif ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produit: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
