import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Supprimer l'organization (cascade : templates, propositions, etc.)
    const { error: orgError } = await supabaseAdmin
      .from('organizations')
      .delete()
      .eq('id', id);

    if (orgError) {
      console.error('Erreur suppression organization:', orgError);
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // 2. Supprimer le compte Auth (même ID que l'organization)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      console.error('Erreur suppression auth user:', authError);
      // On continue même si l'auth delete échoue (l'org est déjà supprimée)
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression client:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
