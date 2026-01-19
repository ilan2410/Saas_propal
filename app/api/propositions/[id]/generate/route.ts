import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePropositionFile } from '@/lib/generators';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer la proposition
    const { data: proposition, error: propError } = await supabase
      .from('propositions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (propError || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    // Récupérer le template
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', proposition.template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Utiliser filled_data si disponible, sinon extracted_data
    const donnees = proposition.filled_data || proposition.extracted_data || {};

    // Générer le fichier
    const fileUrl = await generatePropositionFile({
      template,
      donnees,
      organization_id: user.id,
      proposition_id: id,
    });

    // Mettre à jour la proposition avec les bons noms de colonnes
    const { error: updateError } = await supabase
      .from('propositions')
      .update({
        duplicated_template_url: fileUrl,
        statut: 'exported',
        exported_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Déduire les crédits
    const { data: organization } = await supabase
      .from('organizations')
      .select('credits, tarif_par_proposition')
      .eq('id', user.id)
      .single();

    if (organization) {
      await supabase
        .from('organizations')
        .update({
          credits: Math.max(0, organization.credits - organization.tarif_par_proposition),
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ success: true, file_url: fileUrl });
  } catch (error) {
    console.error('Error generating proposition:', error);
    
    // Marquer la proposition en erreur
    const { id } = await params;
    const supabase = await createClient();
    await supabase
      .from('propositions')
      .update({ statut: 'error' })
      .eq('id', id);

    return NextResponse.json(
      {
        error: 'Failed to generate proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
