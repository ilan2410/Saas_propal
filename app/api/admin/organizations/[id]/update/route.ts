import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Utiliser le client admin avec service_role_key
    const supabaseAdmin = createClient(
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
    const { data: organization, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({
        nom,
        secteur,
        credits: credits || 0,
        tarif_par_proposition: tarif_par_proposition || 5,
        claude_model: claude_model || 'claude-3-7-sonnet-20250219',
        prompt_template: ensureChampsActifsPlaceholder(String(prompt_template || '')),
        champs_defaut: champs_defaut || [],
        updated_at: new Date().toISOString(),
      })
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
