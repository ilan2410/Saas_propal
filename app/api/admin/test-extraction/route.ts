import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeInvoicesForSa, extractDataFromDocuments, structureSaAnalysis } from '@/lib/ai/claude';
import { calculateCanonicalSaAnalysis } from '@/lib/sa/invoice-analysis';
import { buildLegacySaData } from '@/lib/sa/structure-sa';
import { logAiUsage } from '@/lib/ai/usage-log';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { documents_urls, champs_actifs, claude_model, claude_effort, prompt_template, secteur } = body;
    const effort = typeof claude_effort === 'string' ? claude_effort : undefined;

    // Validation
    if (!documents_urls || documents_urls.length === 0) {
      return NextResponse.json(
        { error: 'Aucun document fourni' },
        { status: 400 }
      );
    }

    if (!champs_actifs || champs_actifs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun champ actif fourni' },
        { status: 400 }
      );
    }

    console.log('Test extraction IA:', {
      documents: documents_urls.length,
      champs: champs_actifs.length,
      model: claude_model,
      secteur,
    });

    // Extraire les données avec Claude
    const activeFields = (champs_actifs as unknown[]).filter((field): field is string => typeof field === 'string');
    const model = claude_model || process.env.CLAUDE_MODEL_EXTRACTION || 'claude-sonnet-4-6';
    const hasSituationActuelle = activeFields.some((field) => field === 'situation_actuelle' || field.startsWith('situation_actuelle.'));
    const hasNonTelecomFields = activeFields.some((field) => !(
      field === 'fournisseur' || field.startsWith('fournisseur.') ||
      field === 'client' || field.startsWith('client.') ||
      field === 'situation_actuelle' || field.startsWith('situation_actuelle.')
    ));
    const useSaPipeline =
      (secteur === 'telephonie' && hasSituationActuelle) ||
      (secteur === 'mixte' && hasSituationActuelle && !hasNonTelecomFields);

    // L'identifiant vient du client : on ne l'accepte qu'apres avoir verifie
    // qu'il designe une organisation existante, pour ne jamais imputer une
    // depense a une organisation arbitraire. Le formulaire de creation
    // d'organisation n'en fournit aucun : la depense est alors non rattachee.
    const requestedOrgId = typeof body.organization_id === 'string' ? body.organization_id : null;
    let testOrganizationId: string | null = null;
    if (requestedOrgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', requestedOrgId)
        .maybeSingle();
      testOrganizationId = org?.id ?? null;
    }

    const logTest = (usage: Parameters<typeof logAiUsage>[0]['usage']) =>
      logAiUsage({
        organizationId: testOrganizationId,
        propositionId: null,
        userId: user.id,
        operation: 'admin_test',
        usage,
      });

    let donneesExtraites: Record<string, unknown>;
    if (useSaPipeline) {
      const analysis = await analyzeInvoicesForSa({ documents_urls, active_fields: activeFields, claude_model: model, claude_effort: effort });
      await logTest(analysis.usage);
      const report = analysis.data;
      const coveredFields = new Set(report.field_coverage.map((item) => item.field));
      for (const field of activeFields) {
        if (!coveredFields.has(field)) {
          report.field_coverage.push({ field, status: 'ambiguous', value_json: null, evidence: [], reason: 'Champ omis par l’agent analyste.' });
        }
      }
      const canonical = calculateCanonicalSaAnalysis(report, activeFields, true);
      const structuring = await structureSaAnalysis({ report, canonical, active_fields: activeFields, claude_model: model });
      await logTest(structuring.usage);
      donneesExtraites = buildLegacySaData(structuring.data, report, canonical, true);
    } else {
      const extraction = await extractDataFromDocuments({
        documents_urls,
        champs_actifs: activeFields,
        prompt_template: prompt_template || '',
        claude_model: model,
        claude_effort: effort,
      });
      await logTest(extraction.usage);
      donneesExtraites = extraction.data;
    }

    console.log('Extraction réussie:', {
      champsExtraits: Object.keys(donneesExtraites).length,
    });

    return NextResponse.json({
      success: true,
      donnees_extraites: donneesExtraites,
      stats: {
        champs_demandes: champs_actifs.length,
        champs_extraits: Object.keys(donneesExtraites).length,
        taux_reussite: Math.round(
          (Object.keys(donneesExtraites).length / champs_actifs.length) * 100
        ),
      },
    });
  } catch (error) {
    console.error('Erreur test extraction:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors du test d\'extraction',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
