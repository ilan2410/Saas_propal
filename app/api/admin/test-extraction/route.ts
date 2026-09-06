import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeInvoicesForSa, extractDataFromDocuments, structureSaAnalysis } from '@/lib/ai/claude';
import { calculateCanonicalSaAnalysis } from '@/lib/sa/invoice-analysis';
import { buildLegacySaData } from '@/lib/sa/structure-sa';

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

    let donneesExtraites: Record<string, unknown>;
    if (useSaPipeline) {
      const report = await analyzeInvoicesForSa({ documents_urls, active_fields: activeFields, claude_model: model, claude_effort: effort });
      const coveredFields = new Set(report.field_coverage.map((item) => item.field));
      for (const field of activeFields) {
        if (!coveredFields.has(field)) {
          report.field_coverage.push({ field, status: 'ambiguous', value_json: null, evidence: [], reason: 'Champ omis par l’agent analyste.' });
        }
      }
      const canonical = calculateCanonicalSaAnalysis(report, activeFields, true);
      const structured = await structureSaAnalysis({ report, canonical, active_fields: activeFields, claude_model: model });
      donneesExtraites = buildLegacySaData(structured, report, canonical, true);
    } else {
      donneesExtraites = await extractDataFromDocuments({
        documents_urls,
        champs_actifs: activeFields,
        prompt_template: prompt_template || '',
        claude_model: model,
        claude_effort: effort,
      });
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
