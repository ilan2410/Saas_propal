import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient();

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    // Utiliser le client admin avec service_role_key
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

    const body = await request.json();
    const {
      nom,
      secteur,
      credits,
      tarif_par_proposition,
      claude_model,
      prompt_template,
      champs_defaut,
    } = body;

    // Validation
    if (!nom || !secteur) {
      return NextResponse.json(
        { error: 'Nom et secteur sont requis' },
        { status: 400 }
      );
    }

    // Mettre à jour l'organization
    const updates = {
      nom,
      secteur,
      ...(credits !== undefined ? { credits } : {}),
      ...(tarif_par_proposition !== undefined ? { tarif_par_proposition } : {}),
      ...(claude_model !== undefined ? { claude_model } : {}),
      ...(prompt_template !== undefined ? { prompt_template: ensureChampsActifsPlaceholder(String(prompt_template)) } : {}),
      ...(champs_defaut !== undefined ? { champs_defaut } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data: organization, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Erreur mise à jour organization:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error('Erreur mise à jour client:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de la mise à jour du client',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
