import { preparePropositionGeneration } from '@/lib/generators/prepare-proposition';
import { resolveSubTemplateSelection, subTemplateConfig, subTemplatesEnabled, type SubTemplateGenerationResult } from '@/lib/templates/sub-templates';
import { removeSubTemplateFiles } from '@/lib/templates/sub-template-server';
import { signedOrganizationStorageUrl, organizationStoragePath } from '@/lib/security/storage-access';
import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generatePropositionFile } from '@/lib/generators';
import { resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE } from '@/lib/auth/org-context';
import { scopePropositionsQuery, propositionSecteurBlocked } from '@/lib/propositions/visibility';



export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let failedProposition: { id: string; organizationId: string } | null = null;
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (await propositionSecteurBlocked(ctx, id)) {
      return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    if (ctx.role !== 'owner' && !ctx.permissions.download_proposition) {
      return NextResponse.json(
        { error: "Vous n'avez pas la permission de générer ou télécharger la proposition." },
        { status: 403 },
      );
    }

    // Récupérer la proposition
    const { data: proposition, error: propError } = await scopePropositionsQuery(
      supabase.from('propositions').select('*').eq('id', id),
      ctx
    ).single();

    if (propError || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    // Récupérer le template (scopé à l'organisation de l'utilisateur pour éviter
    // qu'un utilisateur authentifié puisse déclencher une génération sur un
    // template appartenant à une autre organisation).
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select(CLIENT_TEMPLATE_COLUMNS)
      .eq('id', proposition.template_id)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const service = createServiceClient();
    const { data: configuredChildren, error: childrenError } = await service.from('template_sub_templates').select('*').eq('template_id', template.id).eq('organization_id', ctx.organizationId).order('created_at').order('id');
    if (childrenError) throw childrenError;
    const enabled = subTemplatesEnabled(template.file_config, configuredChildren?.length ?? 0);
    const children = enabled ? configuredChildren : [];
    const { data: pref, error: prefError } = await service.from('template_generation_preferences').select('mode').eq('user_id', user.id).eq('template_id', template.id).maybeSingle();
    if (prefError) throw prefError;
    const body = await request.json().catch(() => ({}));
    const ids = (children ?? []).map(c => c.id as string);
    if (body.selected_sub_template_ids !== undefined && (!Array.isArray(body.selected_sub_template_ids) || body.selected_sub_template_ids.some((id: unknown) => typeof id !== 'string' || !ids.includes(id)))) {
      return NextResponse.json({ error: 'Sélection de sous-templates invalide' }, { status: 400 });
    }
    const selected = resolveSubTemplateSelection(ids, pref?.mode ?? 'all', proposition.selected_sub_template_ids, body.selected_sub_template_ids);
    const target = body.target_sub_template_id;
    if (target !== undefined && (!ids.includes(target) || !selected.includes(target))) return NextResponse.json({ error: 'Sous-template non sélectionné' }, { status: 400 });
    const { error: selectionError } = !enabled ? { error: null } : await service.from('propositions').update({ selected_sub_template_ids: selected }).eq('id', id).eq('organization_id', ctx.organizationId);
    if (selectionError) throw selectionError;
    const { data: previousResults, error: resultsError } = await service.from('proposition_sub_template_results').select('*').eq('proposition_id', id).eq('organization_id', ctx.organizationId);
    if (resultsError) throw resultsError;
    const removed = !enabled ? [] : (previousResults ?? []).filter(r => !selected.includes(r.sub_template_id));
    if (removed.length) {
      const { error } = await service.from('proposition_sub_template_results').delete().eq('proposition_id', id).eq('organization_id', ctx.organizationId).in('sub_template_id', removed.map(r => r.sub_template_id));
      if (error) throw error;
      await removeSubTemplateFiles(removed.map(r => r.file_url), ctx.organizationId);
    }
    if (!target) failedProposition = { id, organizationId: ctx.organizationId };
    const options = await preparePropositionGeneration(supabase, ctx, proposition, template);
    const fileUrl = target ? proposition.duplicated_template_url : await generatePropositionFile(options);
    const results: SubTemplateGenerationResult[] = [];
    for (const child of children ?? []) {
      if (!selected.includes(child.id) || (target && child.id !== target) || body.proposition_only === true) continue;
      const previous = previousResults?.find(r => r.sub_template_id === child.id);
      let generatedUrl: string | undefined;
      try {
        generatedUrl = await generatePropositionFile({ ...options, document_name: child.nom,
          template: { ...options.template, id: child.id, file_url: child.file_url, file_type: child.file_type,
            file_config: subTemplateConfig(template.file_config, child.file_config) } });
        const signed = await signedOrganizationStorageUrl(supabase, generatedUrl, 'templates', ctx.organizationId);
        const { error } = await service.from('proposition_sub_template_results').upsert({ proposition_id: id, sub_template_id: child.id, organization_id: ctx.organizationId, status: 'success', file_url: generatedUrl, error: null, generated_at: new Date().toISOString() });
        if (error) throw error;
        if (previous?.file_url && previous.file_url !== generatedUrl) await removeSubTemplateFiles([previous.file_url], ctx.organizationId);
        results.push({ id: child.id, nom: child.nom, status: 'success', file_url: signed });
      } catch (error) {
        if (generatedUrl) await removeSubTemplateFiles([generatedUrl], ctx.organizationId);
        const message = error instanceof Error ? error.message : 'Erreur de génération';
        const { error: saveError } = await service.from('proposition_sub_template_results').upsert({ proposition_id: id, sub_template_id: child.id, organization_id: ctx.organizationId, status: 'error', file_url: previous?.file_url ?? null, error: message, generated_at: new Date().toISOString() });
        if (saveError) console.error('Enregistrement erreur annexe', saveError);
        results.push({ id: child.id, nom: child.nom, status: 'error', error: message });
      }
    }

    // Mettre à jour la proposition avec les bons noms de colonnes
    const { error: updateError } = target ? { error: null } : await createServiceClient()
      .from('propositions')
      .update({
        duplicated_template_url: fileUrl,
        statut: 'exported',
        exported_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Nettoyage de l'ancien fichier généré (le bouton "Télécharger" régénère à
    // chaque clic pour reprendre le template Word courant, sans quoi les fichiers
    // s'accumuleraient dans le storage à chaque téléchargement).
    const previousFileUrl = proposition.duplicated_template_url as string | undefined;
    if (previousFileUrl && previousFileUrl !== fileUrl) {
      try {
        const filePath = organizationStoragePath(previousFileUrl, 'templates', ctx.organizationId);
        if (filePath) {
          const { error: removeError } = await createServiceClient().storage.from('templates').remove([filePath]);
          if (removeError) {
            // Cause historique de l'accumulation : l'erreur n'etait pas
            // regardee, et les policies RLS du bucket faisaient echouer la
            // suppression sur tout chemin `generated/` (cast uuid).
            console.error('Ancien fichier genere non supprime du storage:', {
              propositionId: id,
              path: filePath,
              details: removeError.message,
            });
          }
        }
      } catch (err) {
        console.error('Erreur nettoyage ancien fichier généré:', err);
        // On continue : le nouveau fichier est déjà généré et enregistré.
      }
    }

    // Note: les crédits sont débités lors de l'extraction (extract/route.ts),
    // pas ici. On ne déduit donc pas une seconde fois au téléchargement/génération.

    return NextResponse.json({ success: true, file_url: !target && fileUrl ? await signedOrganizationStorageUrl(supabase, fileUrl, 'templates', ctx.organizationId) : null, sub_templates: results });
  } catch (error) {
    console.error('Error generating proposition:', error);

    if (failedProposition) {
      await createServiceClient().from('propositions').update({ statut: 'error' }).eq('id', failedProposition.id).eq('organization_id', failedProposition.organizationId);
    }

    return NextResponse.json(
      {
        error: 'Failed to generate proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/** Current selection and preference; the same visibility checks as generation. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const { id } = await params;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(client, user);
  if (!ctx || (ctx.role !== 'owner' && !ctx.permissions.download_proposition)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (await propositionSecteurBlocked(ctx, id)) return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });
  const { data: proposition } = await scopePropositionsQuery(client.from('propositions').select('id,template_id,selected_sub_template_ids').eq('id', id), ctx).maybeSingle();
  if (!proposition) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
  const service = createServiceClient();
  const { data: configuredChildren, error } = await service.from('template_sub_templates').select('id,nom,file_type').eq('template_id', proposition.template_id).eq('organization_id', ctx.organizationId).order('created_at').order('id');
  if (error) throw error;
  const { data: parent, error: parentError } = await service.from('proposition_templates').select('file_config').eq('id', proposition.template_id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (parentError) throw parentError;
  if (!parent) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
  const children = subTemplatesEnabled(parent.file_config, configuredChildren?.length ?? 0) ? configuredChildren : [];
  const { data: pref, error: prefError } = await service.from('template_generation_preferences').select('mode').eq('user_id', user.id).eq('template_id', proposition.template_id).maybeSingle();
  if (prefError) throw prefError;
  const { data: results, error: resultError } = await service.from('proposition_sub_template_results').select('sub_template_id,status,error').eq('proposition_id', id).eq('organization_id', ctx.organizationId);
  if (resultError) throw resultError;
  return NextResponse.json({ template_id: proposition.template_id, mode: pref?.mode ?? 'all', selected_sub_template_ids: resolveSubTemplateSelection((children ?? []).map(c => c.id), pref?.mode ?? 'all', proposition.selected_sub_template_ids), sub_templates: (children ?? []).map(c => ({ ...c, result: results?.find(r => r.sub_template_id === c.id) })) });
 } catch (error) {
  console.error('Chargement annexes', error);
  return NextResponse.json({ error: 'Impossible de charger les annexes' }, { status: 500 });
 }
}
