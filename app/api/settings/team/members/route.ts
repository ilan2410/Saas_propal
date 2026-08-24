import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

// GET /api/settings/team/members — liste des commerciaux de l'organisation (propriétaire uniquement)
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
      .from('organization_members')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .order('created_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // organization_members ne stocke pas l'email (il vit dans auth.users) : on l'enrichit
    // via l'API admin pour l'affichage dans le tableau des membres.
    const supabaseAdmin = createServiceClient();
    const members = await Promise.all(
      (data ?? []).map(async (member) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        return { ...member, email: authUser?.user?.email ?? null };
      })
    );

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Erreur GET /api/settings/team/members:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/settings/team/members — création d'un sous-compte commercial (propriétaire uniquement)
export async function POST(request: NextRequest) {
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
    const { email, password, prenom, nom, telephone_fixe, telephone_mobile } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceClient();

    // 1. Créer le compte Auth Supabase pour le commercial
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'commercial' },
      app_metadata: { role: 'commercial' },
    });

    if (authError || !authData?.user) {
      console.error('Erreur création auth commercial:', authError);
      return NextResponse.json(
        { error: 'Erreur création utilisateur', details: authError?.message },
        { status: 500 }
      );
    }

    // 2. Insérer la ligne organization_members liée
    const { data: member, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: ctx.organizationId,
        user_id: authData.user.id,
        prenom: prenom ?? null,
        nom: nom ?? null,
        telephone_fixe: telephone_fixe ?? null,
        telephone_mobile: telephone_mobile ?? null,
        actif: true,
        permissions_override: null,
      })
      .select()
      .single();

    if (memberError) {
      // Rollback : supprimer l'auth user orphelin
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('Erreur création organization_members, rollback auth user:', memberError);
      return NextResponse.json(
        { error: 'Erreur création du membre', details: memberError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: { ...member, email } });
  } catch (error) {
    console.error('Erreur POST /api/settings/team/members:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
