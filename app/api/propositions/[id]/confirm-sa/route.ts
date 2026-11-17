import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE } from '@/lib/auth/org-context';
import { propositionSecteurBlocked, scopePropositionsQuery } from '@/lib/propositions/visibility';
import { clientExtractedData } from '@/lib/security/client-data';
import { buildEditedSaData, isRecord, isSaConfirmed, SaOperationsSchema } from '@/lib/sa/direct-confirmation';
import type { SpConfigResiliation } from '@/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await propositionSecteurBlocked(ctx, id)) {
    return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { data: proposition } = await scopePropositionsQuery(
    supabase.from('propositions').select('*').eq('id', id), ctx,
  ).single();
  if (!proposition) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
  const extracted = isRecord(proposition.extracted_data) ? proposition.extracted_data : {};
  const filled = isRecord(proposition.filled_data) ? proposition.filled_data : {};
  const base = { ...extracted, ...filled };
  if (isSaConfirmed(base) || proposition.suggestions_sp_completes || proposition.duplicated_template_url || proposition.fichier_genere_url) {
    return NextResponse.json({ error: 'La SA est déjà confirmée et ne peut plus être modifiée.' }, { status: 409 });
  }
  if (!Object.keys(extracted).length || proposition.statut === 'processing') {
    return NextResponse.json({ error: "L'extraction doit être terminée avant de confirmer la SA." }, { status: 409 });
  }
  const { data: template } = await supabase.from('proposition_templates')
    .select('file_config').eq('id', proposition.template_id).eq('organization_id', ctx.organizationId).single();
  const config = isRecord(template?.file_config) ? template.file_config : {};
  if (!isRecord(config.sp_config_mode_direct) || config.sp_config_mode_direct.actif !== true) {
    return NextResponse.json({ error: 'Cette confirmation est réservée au mode direct.' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const context = isRecord(extracted._sa_edit_context) ? extracted._sa_edit_context : {};
  if (context.revision && (!isRecord(body) || body.revision !== context.revision)) {
    return NextResponse.json({ error: "Une nouvelle extraction a été effectuée. Rechargez la SA avant de confirmer." }, { status: 409 });
  }
  const operations = SaOperationsSchema.safeParse(isRecord(body) ? body.operations : null);
  if (!operations.success) return NextResponse.json({ error: 'Corrections SA invalides' }, { status: 400 });
  const { data: organization } = await createServiceClient().from('organizations')
    .select('preferences').eq('id', ctx.organizationId).single();
  const preferences = isRecord(organization?.preferences) ? organization.preferences : {};
  const resiliation = (config.sp_config_resiliation ?? preferences.sp_config_resiliation) as SpConfigResiliation | undefined;
  const data = buildEditedSaData(base, operations.data, resiliation, proposition.created_at);
  if (isRecord(data._extraction_control) && data._extraction_control.status === 'review_required') {
    data._extraction_control = { ...data._extraction_control, status: 'valid_forced' };
  }
  data._sa_confirmation = { confirmed_at: new Date().toISOString(), confirmed_by: user.id };
  // Optimistic concurrency: a second tab cannot overwrite a confirmation or review.
  let query = scopePropositionsQuery(createServiceClient().from('propositions').update({
    filled_data: data, statut: 'ready', current_step: 4,
  }).eq('id', id), ctx)
    .eq('template_id', proposition.template_id)
    .eq('statut', proposition.statut)
    .eq('extracted_data', JSON.stringify(proposition.extracted_data));
  query = proposition.filled_data == null
    ? query.is('filled_data', null)
    : query.eq('filled_data', JSON.stringify(proposition.filled_data));
  const { data: saved, error } = await query.select('id').maybeSingle();
  if (error) return NextResponse.json({ error: "L'enregistrement de la SA a échoué." }, { status: 500 });
  if (!saved) return NextResponse.json({ error: 'La proposition a changé. Rechargez la page avant de confirmer.' }, { status: 409 });
  return NextResponse.json({ success: true, donnees_extraites: clientExtractedData(data) });
}
