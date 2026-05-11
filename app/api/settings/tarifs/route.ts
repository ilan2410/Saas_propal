import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('tarif_par_proposition, tarif_clone_site, credits')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      tarif_par_proposition: org?.tarif_par_proposition ?? 5,
      tarif_clone_site: org?.tarif_clone_site ?? 1,
      credits: org?.credits ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
