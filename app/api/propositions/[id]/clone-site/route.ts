import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type SiteActuelle = { nom: string; adresse?: string; code_postal?: string; ville?: string };
type LigneActuelle = { site?: string; [key: string]: unknown };

function filterExtractedDataForSite(
  extractedData: Record<string, unknown>,
  siteNom: string,
): Record<string, unknown> {
  const sa = extractedData.situation_actuelle as Record<string, unknown> | undefined;
  if (!sa) return extractedData;

  const sites = (sa.sites as SiteActuelle[] | undefined) ?? [];
  const filteredSite = sites.filter((s) => s.nom === siteNom);

  const filterBySite = (arr: unknown[]): unknown[] =>
    arr.filter((item) => {
      const line = item as LigneActuelle;
      return !line.site || line.site === siteNom;
    });

  const lignes = filterBySite((sa.lignes as unknown[]) ?? []);
  const abonnements = filterBySite((sa.abonnements as unknown[]) ?? []);
  const locations = filterBySite((sa.locations as unknown[]) ?? []);
  const engagements = filterBySite((sa.engagements as unknown[]) ?? []);

  return {
    ...extractedData,
    situation_actuelle: {
      ...sa,
      sites: filteredSite,
      lignes,
      abonnements,
      locations,
      engagements,
    },
  };
}

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

    const body = await request.json() as { site_nom: string };
    const { site_nom } = body;

    if (!site_nom) {
      return NextResponse.json({ error: 'site_nom requis' }, { status: 400 });
    }

    // Load parent proposition
    const { data: parent } = await supabase
      .from('propositions')
      .select('id, organization_id, template_id, nom_client, extracted_data')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (!parent) {
      return NextResponse.json({ error: 'Proposition parente introuvable' }, { status: 404 });
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

    // Filter extracted_data for this site
    const extractedDataFull = (parent.extracted_data ?? {}) as Record<string, unknown>;
    const extractedDataFiltered = filterExtractedDataForSite(extractedDataFull, site_nom);

    // Debit credits
    await supabase.rpc('debit_credits', { org_id: user.id, amount: tarif });

    // Create clone proposition
    const { data: clone, error: insertError } = await supabase
      .from('propositions')
      .insert({
        organization_id: user.id,
        template_id: parent.template_id,
        nom_client: parent.nom_client,
        extracted_data: extractedDataFiltered,
        parent_proposition_id: parent.id,
        is_multisite: true,
        site_nom,
        statut: 'ready',
      })
      .select('id')
      .single();

    if (insertError || !clone) {
      return NextResponse.json({ error: 'Erreur création proposition clone' }, { status: 500 });
    }

    return NextResponse.json({
      proposition_id: clone.id,
      extracted_data_filtered: extractedDataFiltered,
      credits_debited: tarif,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
