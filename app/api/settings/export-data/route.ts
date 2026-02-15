import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Récupérer toutes les données en parallèle
    const [
      { data: organization },
      { data: templates },
      { data: propositions },
      { data: transactions }
    ] = await Promise.all([
      supabase
        .from('organizations')
        .select('nom, email, secteur, created_at, logo_url, siret, adresse, code_postal, ville, numero_tva, nom_facturation, adresse_facturation, preferences')
        .eq('id', user.id)
        .single(),
      supabase
        .from('proposition_templates')
        .select('*')
        .eq('organization_id', user.id),
      supabase
        .from('propositions')
        .select('*')
        .eq('organization_id', user.id),
      supabase
        .from('stripe_transactions')
        .select('*')
        .eq('organization_id', user.id)
    ]);

    const exportData = {
      export_date: new Date().toISOString(),
      organization,
      templates: templates || [],
      propositions: propositions || [],
      transactions: transactions || []
    };

    const fileName = `export-propoboost-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Erreur export data:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue lors de l\'export' },
      { status: 500 }
    );
  }
}
