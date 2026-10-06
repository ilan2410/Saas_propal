import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

// GET /api/settings/team/templates — templates actifs de l'organisation (pour la modale de permissions, propriétaire uniquement)
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx || ctx.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('proposition_templates')
      .select('id, nom')
      .eq('organization_id', ctx.organizationId)
      .eq('statut', 'actif')
      .order('nom');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error('Erreur GET /api/settings/team/templates:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
