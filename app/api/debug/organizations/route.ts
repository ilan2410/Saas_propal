import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Lister toutes les organisations
    const { data: organizations, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, nom, email, credits')
      .order('created_at', { ascending: false });

    // Lister tous les utilisateurs Auth
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    // Trouver les utilisateurs sans organisation
    const orgIds = new Set(organizations?.map(o => o.id) || []);
    const usersWithoutOrg = authUsers?.users?.filter(u => 
      u.user_metadata?.role === 'client' && !orgIds.has(u.id)
    ).map(u => ({
      id: u.id,
      email: u.email,
      role: u.user_metadata?.role,
      created_at: u.created_at,
    })) || [];

    return NextResponse.json({
      organizations: organizations || [],
      usersWithoutOrg,
      totalOrgs: organizations?.length || 0,
      totalUsersWithoutOrg: usersWithoutOrg.length,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
