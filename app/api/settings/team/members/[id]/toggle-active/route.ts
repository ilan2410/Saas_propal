import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

// POST /api/settings/team/members/[id]/toggle-active — active/désactive un commercial (bloque réellement la connexion)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const { actif } = body ?? {};

    if (typeof actif !== 'boolean') {
      return NextResponse.json({ error: 'Champ actif (boolean) requis' }, { status: 400 });
    }

    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('id, user_id, organization_id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    const supabaseAdmin = createServiceClient();

    // Bloque réellement la connexion côté Supabase Auth (pas seulement un flag DB masqué côté UI)
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(member.user_id, {
      ban_duration: actif ? 'none' : '876000h',
    });

    if (banError) {
      console.error('Erreur mise à jour ban_duration:', banError);
      return NextResponse.json({ error: banError.message }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('organization_members')
      .update({ actif })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error('Erreur POST /api/settings/team/members/[id]/toggle-active:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
