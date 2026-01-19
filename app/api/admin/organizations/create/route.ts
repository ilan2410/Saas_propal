import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Vérifier que l'utilisateur est admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    
    console.log('Création client avec données:', {
      email: body.email,
      nom: body.nom,
      secteur: body.secteur,
      champs_count: body.champs_defaut?.length || 0,
    });

    // Créer un client Supabase avec la service role key pour l'admin API
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
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

    // 1. Créer le compte Auth Supabase pour le client
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          role: 'client',
          organization_name: body.nom,
        },
      });

    if (authError) {
      console.error('Erreur création auth:', authError);
      return NextResponse.json(
        { error: 'Erreur création utilisateur', details: authError.message },
        { status: 500 }
      );
    }

    // 2. Créer l'organization dans la BDD
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        id: authData.user.id, // Même ID que le user Auth
        nom: body.nom,
        email: body.email,
        secteur: body.secteur,
        claude_model: body.claude_model || 'claude-3-7-sonnet-20250219',
        prompt_template: ensureChampsActifsPlaceholder(String(body.prompt_template || '')),
        champs_defaut: body.champs_defaut,
        tarif_par_proposition: body.tarif_par_proposition,
        credits: 0,
        quotas: {
          tailleMaxDocumentMB: 50,
          nombreMaxDocumentsParProposition: 10,
          tokensMaxParProposition: 200000,
        },
      })
      .select()
      .single();

    if (orgError) {
      console.error('Erreur création organization:', orgError);
      return NextResponse.json(
        { error: 'Erreur création organization', details: orgError.message },
        { status: 500 }
      );
    }

    console.log('Client créé avec succès:', org.id);
    return NextResponse.json({ success: true, organization: org });
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json(
      {
        error: 'Failed to create organization',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
