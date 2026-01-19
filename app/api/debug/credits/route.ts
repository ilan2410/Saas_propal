import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Client normal (avec RLS)
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Non authentifié',
        userError: userError?.message 
      }, { status: 401 });
    }

    // Essayer de récupérer l'organisation avec le client normal (RLS)
    const { data: orgWithRLS, error: rlsError } = await supabase
      .from('organizations')
      .select('id, nom, email, credits, tarif_par_proposition')
      .eq('id', user.id)
      .single();

    // Client admin (sans RLS) pour comparaison
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

    const { data: orgWithoutRLS, error: adminError } = await supabaseAdmin
      .from('organizations')
      .select('id, nom, email, credits, tarif_par_proposition')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role,
      },
      withRLS: {
        data: orgWithRLS,
        error: rlsError?.message,
      },
      withoutRLS: {
        data: orgWithoutRLS,
        error: adminError?.message,
      },
      comparison: {
        idsMatch: user.id === orgWithoutRLS?.id,
        creditsMatch: orgWithRLS?.credits === orgWithoutRLS?.credits,
        rlsBlocking: !orgWithRLS && !!orgWithoutRLS,
      }
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
