import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

const PERMISSION_KEYS = [
  'view_all_propositions',
  'manage_catalogue',
  'manage_templates',
  'view_credits_billing',
  'download_proposition',
  'download_comparatif_sa_sp',
] as const;

// PATCH /api/settings/team/defaults — permissions par défaut appliquées à tous les commerciaux de l'organisation
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();

    const sanitized: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) {
      const value = (body ?? {})[key];
      if (typeof value !== 'boolean') {
        return NextResponse.json(
          { error: `Champ ${key} manquant ou invalide (boolean requis)` },
          { status: 400 }
        );
      }
      sanitized[key] = value;
    }

    // On utilise le client service-role pour l'écriture (comme /api/settings/update-profile),
    // les politiques RLS UPDATE sur `organizations` n'étant pas garanties pour ce champ.
    const supabaseAdmin = createServiceClient();
    const { data: updated, error } = await supabaseAdmin
      .from('organizations')
      .update({ commercial_default_permissions: sanitized })
      .eq('id', ctx.organizationId)
      .select('commercial_default_permissions')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ commercial_default_permissions: updated.commercial_default_permissions });
  } catch (error) {
    console.error('Erreur PATCH /api/settings/team/defaults:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
