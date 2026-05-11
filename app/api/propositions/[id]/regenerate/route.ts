import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestionReponse } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { sp_reponses: SpQuestionReponse[] };
    const { sp_reponses } = body;

    if (!sp_reponses) {
      return NextResponse.json({ error: 'sp_reponses requis' }, { status: 400 });
    }

    // Verify proposition belongs to org and is a clone
    const { data: proposition } = await supabase
      .from('propositions')
      .select('id, organization_id, template_id, parent_proposition_id, extracted_data')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (!proposition) {
      return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
    }

    if (!proposition.parent_proposition_id) {
      return NextResponse.json(
        { error: 'Cette proposition n\'est pas un clone multisite' },
        { status: 400 }
      );
    }

    // Load org for tarif_clone_site + credits
    const { data: org } = await supabase
      .from('organizations')
      .select('credits, tarif_clone_site')
      .eq('id', user.id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    const tarif = (org.tarif_clone_site as number | null) ?? 1;

    if (org.credits < tarif) {
      return NextResponse.json(
        { error: `Crédits insuffisants. Solde : ${org.credits} €, requis : ${tarif} €` },
        { status: 402 }
      );
    }

    // Debit credits
    await supabase.rpc('debit_credits', { org_id: user.id, amount: tarif });

    // Update sp_reponses on the proposition
    await supabase
      .from('propositions')
      .update({ sp_reponses })
      .eq('id', id);

    // Call generer-suggestions API to regenerate SP
    const baseUrl = new URL(request.url).origin;

    const suggestionsRes = await fetch(`${baseUrl}/api/propositions/generer-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('Cookie') ?? '',
      },
      body: JSON.stringify({
        situation_actuelle: proposition.extracted_data,
        proposition_id: id,
        force_regenerate: true,
        sp_questions_reponses: sp_reponses,
        preferences: {},
      }),
    });

    if (!suggestionsRes.ok) {
      const err = await suggestionsRes.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Erreur génération SP');
    }

    // Call generate to rebuild the file
    const generateRes = await fetch(`${baseUrl}/api/propositions/${id}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('Cookie') ?? '',
      },
    });

    if (!generateRes.ok) {
      const err = await generateRes.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Erreur génération fichier');
    }

    const generateData = await generateRes.json() as { file_url: string };

    return NextResponse.json({
      success: true,
      credits_debited: tarif,
      file_url: generateData.file_url,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
