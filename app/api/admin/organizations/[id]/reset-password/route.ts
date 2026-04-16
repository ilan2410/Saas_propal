import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
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
    const body = await request.json();
    const { action, password } = body;

    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (action === 'send_reset_email') {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('email')
        .eq('id', id)
        .single();

      if (!org?.email) {
        return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });
      }

      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '';
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(org.email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });

      if (error) throw error;

      return NextResponse.json({ success: true, message: 'Email de réinitialisation envoyé' });
    }

    if (action === 'set_password') {
      if (!password || password.length < 6) {
        return NextResponse.json(
          { error: 'Le mot de passe doit contenir au moins 6 caractères' },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (error) throw error;

      return NextResponse.json({ success: true, message: 'Mot de passe mis à jour' });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error) {
    console.error('Erreur reset-password admin:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
