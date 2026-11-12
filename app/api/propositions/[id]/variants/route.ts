import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery, propositionSecteurBlocked } from '@/lib/propositions/visibility';
import { loadSpVariant } from '@/lib/propositions/sp-variant-server';
import { validVariantName, variantClientData } from '@/lib/propositions/sp-variants';
import { removeSubTemplateFiles } from '@/lib/templates/sub-template-server';

async function mutate(request: NextRequest, { params }: { params: Promise<{ id: string }> }, operation: 'create' | 'rename' | 'delete') {
  try {
    const { id } = await params;
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const ctx = await resolveOrgContext(client, user);
    if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (await propositionSecteurBlocked(ctx, id)) return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    const { data: parent } = await scopePropositionsQuery(client.from('propositions').select('*').eq('id', id), ctx).maybeSingle();
    if (!parent) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
    const body = await request.json();
    if (operation !== 'delete' && !validVariantName(body.nom)) return NextResponse.json({ error: 'Le nom doit contenir entre 1 et 80 caractères.' }, { status: 400 });
    const sourceId = operation === 'create' ? body.source_variant_id : body.variant_id;
    if (sourceId !== undefined && sourceId !== null && typeof sourceId !== 'string') return NextResponse.json({ error: 'Variante invalide' }, { status: 400 });
    const source = sourceId ? await loadSpVariant(id, ctx.organizationId, sourceId) : null;
    if ((sourceId || operation !== 'create') && !source) return NextResponse.json({ error: 'Variante introuvable' }, { status: 404 });
    const service = createServiceClient();
    if (operation === 'delete') {
      const { data: results, error: resultsError } = await service.from('proposition_sp_variant_results').select('file_url')
        .eq('variant_id', source!.id).eq('organization_id', ctx.organizationId);
      if (resultsError) throw resultsError;
      const { error } = await service.from('proposition_sp_variants').delete()
        .eq('id', source!.id).eq('proposition_id', id).eq('organization_id', ctx.organizationId);
      if (error) throw error;
      // Result rows cascade with the variant; cleanup is limited to its own files.
      await removeSubTemplateFiles([source!.duplicated_template_url, ...(results ?? []).map(r => r.file_url)], ctx.organizationId);
      return NextResponse.json({ success: true });
    }
    if (operation === 'rename') {
      const { error } = await service.from('proposition_sp_variants').update({ nom: body.nom.trim() })
        .eq('id', source!.id).eq('proposition_id', id).eq('organization_id', ctx.organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    const original = source ?? parent;
    const { data, error } = await service.from('proposition_sp_variants').insert({
      proposition_id: id, organization_id: ctx.organizationId, nom: body.nom.trim(),
      suggestions_sp_completes: original.suggestions_sp_completes,
      sp_reponses: original.sp_reponses ?? [],
      filled_data: variantClientData(source ? source.filled_data : { ...(parent.extracted_data ?? parent.donnees_extraites ?? {}), ...(parent.filled_data ?? {}) }),
      selected_sub_template_ids: original.selected_sub_template_ids,
    }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error('Variantes SP', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer la variante.' }, { status: 500 });
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, 'create'); }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, 'rename'); }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, 'delete'); }
