import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

const PERMISSION_KEYS = [
  'view_all_propositions',
  'manage_catalogue',
  'manage_templates',
  'view_credits_billing',
] as const;

// PATCH /api/settings/team/members/[id] — édition des infos + permissions d'un commercial (propriétaire uniquement)
export async function PATCH(
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

    // Vérifier que le membre appartient bien à l'organisation courante
    const { data: existingMember, error: existingError } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existingMember) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    const body = await request.json();
    const { prenom, nom, telephone_fixe, telephone_mobile, permissions_override } = body ?? {};

    const updates: Record<string, unknown> = {};
    if (prenom !== undefined) updates.prenom = prenom;
    if (nom !== undefined) updates.nom = nom;
    if (telephone_fixe !== undefined) updates.telephone_fixe = telephone_fixe;
    if (telephone_mobile !== undefined) updates.telephone_mobile = telephone_mobile;

    if (permissions_override !== undefined) {
      if (permissions_override === null) {
        updates.permissions_override = null;
      } else if (typeof permissions_override === 'object') {
        const sanitized: Record<string, boolean> = {};
        for (const key of PERMISSION_KEYS) {
          const value = (permissions_override as Record<string, unknown>)[key];
          if (typeof value === 'boolean') {
            sanitized[key] = value;
          }
          // clé absente ou non-booléenne => on ne la fixe pas (= hérite du défaut)
        }
        updates.permissions_override = sanitized;
      } else {
        return NextResponse.json({ error: 'permissions_override invalide' }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('organization_members')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error('Erreur PATCH /api/settings/team/members/[id]:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/settings/team/members/[id] — suppression définitive d'un commercial (propriétaire uniquement)
export async function DELETE(
  _request: NextRequest,
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
    // Supprime l'auth user ; la ligne organization_members est supprimée en cascade via FK ON DELETE CASCADE.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(member.user_id);

    if (deleteError) {
      console.error('Erreur suppression auth user commercial:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE /api/settings/team/members/[id]:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
