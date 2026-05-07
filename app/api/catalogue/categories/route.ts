import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('catalogues_produits')
      .select('categorie')
      .eq('actif', true)
      .eq('organization_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const categories = [...new Set((data ?? []).map((r) => r.categorie))].sort();
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
