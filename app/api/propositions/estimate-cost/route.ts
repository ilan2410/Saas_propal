import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { signedOrganizationStorageUrl, validateSourceDocuments } from '@/lib/security/storage-access';
import { canAccessSecteur, canUseTemplate, resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE, TEMPLATE_FORBIDDEN_MESSAGE } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { DocumentLimitError } from '@/lib/ai/document-limits';
import { SURCHARGE_THRESHOLD_EUR } from '@/lib/ai/extraction-cost';
import { buildExtractionQuote, getUsdToEurRate, resolveExtractionSetup } from '@/lib/propositions/extraction-quote';

/**
 * Devis d'une extraction, sans rien écrire ni débiter : indique si les
 * documents entraînent un supplément et si le solde de crédits suffit.
 * Même calcul que la route d'extraction (`buildExtractionQuote`), qui reste
 * l'autorité au moment du débit.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { template_id, documents_urls, proposition_id } = await request.json();
    if (!template_id) return NextResponse.json({ error: 'template_id manquant' }, { status: 400 });
    if (!Array.isArray(documents_urls) || documents_urls.length === 0) {
      return NextResponse.json({ error: 'Aucun document fourni' }, { status: 400 });
    }
    if (!await validateSourceDocuments(supabase, documents_urls, ctx.organizationId)) {
      return NextResponse.json({ error: 'Documents source invalides ou inaccessibles' }, { status: 400 });
    }

    if (!canUseTemplate(ctx, template_id)) {
      let sameTemplateAsExisting = false;
      if (proposition_id) {
        const { data: existing } = await scopePropositionsQuery(
          supabase.from('propositions').select('template_id').eq('id', proposition_id),
          ctx,
        ).maybeSingle();
        sameTemplateAsExisting = existing?.template_id === template_id;
      }
      if (!sameTemplateAsExisting) return NextResponse.json({ error: TEMPLATE_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { data: template } = await serviceSupabase
      .from('proposition_templates')
      .select('*')
      .eq('id', template_id)
      .eq('organization_id', ctx.organizationId)
      .single();
    if (!template) return NextResponse.json({ error: 'Template non trouvé' }, { status: 404 });
    if (!canAccessSecteur(ctx, template.secteur)) {
      return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { data: organization } = await serviceSupabase.from('organizations').select('*').eq('id', ctx.organizationId).single();
    if (!organization) return NextResponse.json({ error: 'Organisation non trouvée' }, { status: 404 });

    const signedDocuments = await Promise.all(
      documents_urls.map((url: string) => signedOrganizationStorageUrl(supabase, url, 'documents', ctx.organizationId)),
    );
    const quote = await buildExtractionQuote({
      documentUrls: signedDocuments,
      setup: resolveExtractionSetup(template, organization),
      tarif: parseFloat(String(organization.tarif_par_proposition || 0)),
      credits: parseFloat(String(organization.credits || 0)),
      usdToEurRate: await getUsdToEurRate(serviceSupabase),
    });

    // Le coût IA estimé n'est jamais renvoyé : seuls le supplément et les
    // montants débités sont affichés. Le solde n'est exposé qu'aux profils
    // autorisés à voir la facturation.
    return NextResponse.json({
      tarif: quote.tarif,
      surcharge: quote.surcharge,
      surcharge_threshold_eur: SURCHARGE_THRESHOLD_EUR,
      total_debit: quote.totalDebit,
      sufficient: quote.sufficient,
      total_pages: quote.totalPages,
      document_count: documents_urls.length,
      ...(ctx.permissions.view_credits_billing ? { credits: quote.credits } : {}),
    });
  } catch (error) {
    if (error instanceof DocumentLimitError) {
      return NextResponse.json(
        { error: 'Documents trop volumineux pour l\'extraction', details: error.message, limit_errors: error.errors },
        { status: 413 },
      );
    }
    console.error('Erreur estimation coût extraction:', error);
    return NextResponse.json(
      { error: 'Estimation impossible', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
