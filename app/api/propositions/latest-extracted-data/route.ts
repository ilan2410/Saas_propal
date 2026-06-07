import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templateId = request.nextUrl.searchParams.get('template_id');
    if (!templateId) {
      return NextResponse.json({ error: 'template_id requis' }, { status: 400 });
    }

    const { data: proposition } = await supabase
      .from('propositions')
      .select('id, extracted_data')
      .eq('organization_id', user.id)
      .eq('template_id', templateId)
      .not('extracted_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const extractedData = isRecord(proposition?.extracted_data) ? { ...proposition.extracted_data } : null;
    if (extractedData && isRecord(extractedData.situation_actuelle)) {
      const situationActuelle = { ...extractedData.situation_actuelle };
      const saCart = calculateSaCartSummary({ situation_actuelle: situationActuelle });
      situationActuelle.total_abonnements = Math.round((saCart.lignesFixes + saCart.lignesMobiles + saCart.lignesInternet + saCart.abonnements) * 100) / 100;
      situationActuelle.total_loyer_mensuel = saCart.totalMensuel;
      situationActuelle.total_materiel = saCart.locations;
      extractedData.situation_actuelle = situationActuelle;
    }

    return NextResponse.json({
      extracted_data: extractedData,
      proposition_id: proposition?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
