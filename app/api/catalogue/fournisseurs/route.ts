import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categories = searchParams.get('categories')?.split(',').filter(Boolean) ?? [];

    let query = supabase
      .from('catalogues_produits')
      .select('fournisseur')
      .eq('actif', true)
      .eq('organization_id', user.id)
      .not('fournisseur', 'is', null);

    if (categories.length > 0) {
      query = query.in('categorie', categories);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const fournisseurs = [...new Set((data ?? []).map((r) => r.fournisseur).filter(Boolean))].sort();
    return NextResponse.json({ fournisseurs });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
