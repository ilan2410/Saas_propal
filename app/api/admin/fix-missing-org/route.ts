import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// POST /api/admin/fix-missing-org
// Body: { userId: string, nom?: string, secteur?: string, credits?: number }
export async function POST(request: NextRequest) {
  try {
    // Vérifier que l'appelant est admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, nom, secteur, credits } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

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

    // Récupérer les infos de l'utilisateur Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (authError || !authUser?.user) {
      return NextResponse.json({ 
        error: 'Utilisateur non trouvé',
        details: authError?.message 
      }, { status: 404 });
    }

    // Vérifier si l'organisation existe déjà
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingOrg) {
      return NextResponse.json({ 
        error: 'Organisation existe déjà',
        organization: existingOrg 
      }, { status: 400 });
    }

    // Créer l'organisation manquante
    const { data: newOrg, error: createError } = await supabaseAdmin
      .from('organizations')
      .insert({
        id: userId,
        nom: nom || authUser.user.user_metadata?.organization_name || authUser.user.email?.split('@')[0] || 'Client',
        email: authUser.user.email,
        secteur: secteur || 'telephonie',
        claude_model: 'claude-3-7-sonnet-20250219',
        prompt_template: '',
        champs_defaut: [],
        tarif_par_proposition: 5,
        credits: credits || 0,
        quotas: {
          tailleMaxDocumentMB: 50,
          nombreMaxDocumentsParProposition: 10,
          tokensMaxParProposition: 200000,
        },
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ 
        error: 'Erreur création organisation',
        details: createError.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Organisation créée avec succès',
      organization: newOrg,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Erreur serveur',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
