import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { safeStorageFileName } from '@/lib/security/validate-upload';
import { friendlyFileNameFromUrl } from '@/lib/utils/storage-filename';
import {
  asStringArray,
  extractStoragePathFromPublicUrl,
  syncSourceDocumentsAsAttachments,
  SOURCE_DOCUMENTS_BUCKET,
} from '@/lib/propositions/source-documents';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Récupérer la proposition originale
    const { data: originalProposition, error: fetchError } = await scopePropositionsQuery(
      supabase.from('propositions').select('*').eq('id', id),
      ctx
    ).single();

    if (fetchError || !originalProposition) {
      return NextResponse.json(
        { error: 'Proposition non trouvée' },
        { status: 404 }
      );
    }

    // Extraire le nom du client
    const extractedData = originalProposition.filled_data || originalProposition.extracted_data || originalProposition.donnees_extraites || {};
    let clientName = 'Client';
    
    if (extractedData.client?.nom) {
      clientName = extractedData.client.nom;
    } else if (extractedData['client.nom']) {
      clientName = extractedData['client.nom'];
    } else if (originalProposition.nom_client) {
      clientName = originalProposition.nom_client;
    }

    // Dupliquer les documents source : chaque proposition possède sa propre
    // copie des objets storage (les pièces jointes sont uniques par clé et la
    // suppression côté copie ne doit pas casser l'original, et inversement).
    const serviceSupabase = createServiceClient();
    const sourceUrls = asStringArray(
      originalProposition.source_documents || originalProposition.documents_urls || originalProposition.documents_sources_urls,
    );

    const { data: parentAttachments } = await serviceSupabase
      .from('proposition_attachments')
      .select('storage_key, original_name')
      .eq('proposition_id', id)
      .eq('organization_id', ctx.organizationId)
      .eq('storage_bucket', SOURCE_DOCUMENTS_BUCKET);
    const parentNameByKey = new Map(
      (parentAttachments ?? []).map((row) => [String(row.storage_key), String(row.original_name)]),
    );

    const duplicatedUrls: string[] = [];
    const duplicatedNames: Record<string, string> = {};
    for (const url of sourceUrls) {
      const key = extractStoragePathFromPublicUrl(url, SOURCE_DOCUMENTS_BUCKET);
      if (!key) {
        duplicatedUrls.push(url);
        continue;
      }
      const displayName = parentNameByKey.get(key) ?? friendlyFileNameFromUrl(url);
      const extension = displayName.includes('.')
        ? (displayName.split('.').pop() ?? 'pdf')
        : (key.split('.').pop() ?? 'pdf');
      const newKey = `${ctx.organizationId}/${safeStorageFileName(displayName, extension)}`;
      const { error: copyError } = await serviceSupabase.storage
        .from(SOURCE_DOCUMENTS_BUCKET)
        .copy(key, newKey);
      if (copyError) {
        console.error('Erreur copie document source:', copyError);
        duplicatedUrls.push(url); // fallback : référence l'objet d'origine
        continue;
      }
      const { data: { publicUrl } } = serviceSupabase.storage
        .from(SOURCE_DOCUMENTS_BUCKET)
        .getPublicUrl(newKey);
      duplicatedUrls.push(publicUrl);
      duplicatedNames[newKey] = displayName;
    }

    // Créer la nouvelle proposition
    const { data: newProposition, error: insertError } = await supabase
      .from('propositions')
      .insert({
        organization_id: ctx.organizationId,
        created_by: user.id,
        template_id: originalProposition.template_id,
        nom_client: `[COPIE] ${clientName}`,
        statut: Object.keys(extractedData).length > 0 ? 'ready' : 'draft',
        source_documents: duplicatedUrls,
        extracted_data: Object.keys(extractedData).length > 0 ? extractedData : null,
        donnees_extraites: Object.keys(extractedData).length > 0 ? extractedData : null,
        duplicated_template_url: null,
        fichier_genere_url: null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !newProposition) {
      console.error('Erreur insertion:', insertError);
      return NextResponse.json(
        { error: 'Erreur lors de la duplication' },
        { status: 500 }
      );
    }

    try {
      await syncSourceDocumentsAsAttachments(serviceSupabase, {
        organizationId: ctx.organizationId,
        propositionId: newProposition.id,
        urls: duplicatedUrls,
        uploadedBy: user.id,
        originalNames: duplicatedNames,
      });
    } catch (syncError) {
      console.error('Erreur sync pièces jointes (duplication):', syncError);
    }

    return NextResponse.json({
      success: true,
      id: newProposition.id,
    });
  } catch (error) {
    console.error('Erreur duplication proposition:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de la duplication',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
