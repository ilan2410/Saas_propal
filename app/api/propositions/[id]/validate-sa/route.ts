import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { InvoiceAnalysisReportSchema, calculateCanonicalSaAnalysis, hasTotalBlockingIssue } from '@/lib/sa/invoice-analysis';
import { StructuredSaSchema, buildLegacySaData } from '@/lib/sa/structure-sa';
import { estimateResiliationFromSA, replaceIndemnitesSectionInResume } from '@/lib/sp/resiliation';
import type { SpConfigResiliation } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: proposition } = await scopePropositionsQuery(
    supabase.from('propositions').select('*').eq('id', id),
    ctx,
  ).single();
  if (!proposition) return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('champs_actifs, file_config')
    .eq('id', proposition.template_id)
    .eq('organization_id', ctx.organizationId)
    .single();
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const { data: organization } = await supabase
    .from('organizations')
    .select('preferences')
    .eq('id', ctx.organizationId)
    .single();

  const body = await request.json().catch(() => ({}));
  const extracted = isRecord(proposition.extracted_data) ? proposition.extracted_data : {};
  const reportResult = InvoiceAnalysisReportSchema.safeParse(body.report ?? extracted._invoice_analysis);
  const structuredResult = StructuredSaSchema.safeParse(extracted._structured_sa);
  if (!reportResult.success || !structuredResult.success) {
    return NextResponse.json({ error: 'Données de revue SA invalides' }, { status: 400 });
  }

  const activeFields = Array.isArray(template.champs_actifs)
    ? template.champs_actifs.filter((field): field is string => typeof field === 'string')
    : [];
  const fileConfig = isRecord(template.file_config) ? template.file_config : {};
  const includeVariableCharges = fileConfig.inclure_charges_variables_sa !== false;
  const canonical = calculateCanonicalSaAnalysis(reportResult.data, activeFields, includeVariableCharges);
  const manualTotal = typeof body.manual_total_ht === 'number' && Number.isFinite(body.manual_total_ht) && body.manual_total_ht > 0
    ? Math.round(body.manual_total_ht * 100) / 100
    : null;

  if (hasTotalBlockingIssue(canonical.issues) && manualTotal === null) {
    return NextResponse.json({
      success: false,
      validation_status: 'review_required',
      total_ht_mensuel_client: canonical.total_ht_mensuel_client,
      quality_issues: canonical.issues,
    }, { status: 422 });
  }

  if (manualTotal !== null) canonical.total_ht_mensuel_client = manualTotal;
  const structured = {
    ...structuredResult.data,
    mapped_fields: reportResult.data.field_coverage.map((item) => ({
      field: item.field,
      value_json: item.value_json,
    })),
  };
  const filledData = buildLegacySaData(
    structured,
    reportResult.data,
    canonical,
    includeVariableCharges,
  );
  const previousSa = isRecord(extracted.situation_actuelle) ? extracted.situation_actuelle : {};
  const currentSa = isRecord(filledData.situation_actuelle) ? filledData.situation_actuelle : {};
  for (const key of ['lignes', 'engagements']) {
    const previousRows = Array.isArray(previousSa[key]) ? previousSa[key] : [];
    const currentRows = Array.isArray(currentSa[key]) ? currentSa[key] : [];
    currentSa[key] = currentRows.map((row, index) =>
      isRecord(row) && isRecord(previousRows[index]) ? { ...previousRows[index], ...row } : row
    );
  }
  const orgPreferences = isRecord(organization?.preferences) ? organization.preferences : {};
  const resiliationConfig = (
    isRecord(fileConfig.sp_config_resiliation)
      ? fileConfig.sp_config_resiliation
      : orgPreferences.sp_config_resiliation
  ) as SpConfigResiliation | undefined;
  const estimation = estimateResiliationFromSA(
    { ...filledData, situation_actuelle: currentSa },
    resiliationConfig,
    typeof proposition.created_at === 'string' ? proposition.created_at : null,
  );
  const previousIndemnites = isRecord(previousSa.indemnites) ? previousSa.indemnites : {};
  currentSa.indemnites = {
    ...previousIndemnites,
    montant_source: estimation.montant_source,
    montant_estime: estimation.montant_estime,
    montant_calcule: estimation.montant_retenu,
    mois_restants_source: estimation.mois_restants,
    base_mensuelle_source: estimation.base_mensuelle,
    preavis_mois_source: estimation.preavis_mois,
    frais_resiliation_fixes: estimation.frais_resiliation_fixes,
    penalites: estimation.penalites,
    frais_materiel: estimation.frais_materiel,
    services_annexes: estimation.services_annexes,
    mensualites_restantes: estimation.mensualites_restantes,
    source_retenue: estimation.source_retenue,
    fiabilite: estimation.fiabilite,
    details_calcul: estimation.details,
    motifs_manquants: estimation.motifs_manquants,
    methode_calcul: estimation.methode_calcul,
  };
  const indemnityAmount = estimation.montant_retenu ?? estimation.montant_source ?? estimation.montant_estime;
  if (indemnityAmount !== null) {
    currentSa.ligne_bon_commande_materiel = {
      libelle: `Remboursement de ${indemnityAmount.toFixed(2)} € au titre du solde définitif de vos contrats téléphoniques.`,
      montant: indemnityAmount,
    };
  }
  filledData.situation_actuelle = currentSa;
  if (typeof filledData.resume === 'string') {
    const updatedResume = replaceIndemnitesSectionInResume(filledData.resume, estimation);
    filledData.resume = manualTotal === null
      ? updatedResume
      : `**TOTAL HT MENSUEL VALIDÉ MANUELLEMENT : ${manualTotal.toFixed(2)} € HT/mois**\n\n${updatedResume}`;
  }
  const control = isRecord(filledData._extraction_control) ? filledData._extraction_control : {};
  filledData._extraction_control = {
    ...control,
    status: manualTotal === null ? 'valid' : 'valid_manual',
    issues: canonical.issues,
    manual_override: manualTotal === null ? null : {
      total_ht_mensuel_client: manualTotal,
      justification: typeof body.justification === 'string' ? body.justification.trim() : '',
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    },
  };

  const { error } = await scopePropositionsQuery(
    supabase.from('propositions').update({
      filled_data: filledData,
      statut: 'ready',
      current_step: 4,
    }).eq('id', id),
    ctx,
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    validation_status: manualTotal === null ? 'valid' : 'valid_manual',
    donnees_extraites: filledData,
    total_ht_mensuel_client: canonical.total_ht_mensuel_client,
  });
}
