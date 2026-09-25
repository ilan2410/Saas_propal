import { SupabaseClient } from '@supabase/supabase-js';
import { friendlyFileNameFromUrl } from '@/lib/utils/storage-filename';

export const SOURCE_DOCUMENTS_BUCKET = 'documents';

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function extractStoragePathFromPublicUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rawPath = url.slice(idx + marker.length);
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

async function fetchObjectMetadata(url: string): Promise<{ size: number; mime: string } | null> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return null;
    const size = Number(response.headers.get('content-length')) || 0;
    if (size <= 0) return null;
    return {
      size,
      mime: response.headers.get('content-type') || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

type SyncPropositionInput = {
  id: string;
  sourceDocuments: unknown;
  uploadedBy?: string | null;
  /** storage_key -> vrai nom de fichier quand il est connu (upload, duplication) */
  originalNames?: Record<string, string>;
};

/**
 * Aligne `proposition_attachments` sur `propositions.source_documents` pour un
 * lot de propositions : chaque document source du bucket `documents` obtient
 * une ligne de pièce jointe pointant vers le même objet storage (pas de
 * copie), et les lignes auto-créées dont la clé n'est plus référencée sont
 * retirées.
 *
 * Les lignes sont identifiables par `storage_bucket = 'documents'` : les
 * pièces jointes envoyées manuellement vivent dans `proposition-attachments`
 * (ou S3) et ne sont jamais touchées.
 */
export async function syncAllSourceDocumentsAsAttachments(
  serviceSupabase: SupabaseClient,
  input: {
    organizationId: string;
    propositions: SyncPropositionInput[];
  },
): Promise<void> {
  const byProp = input.propositions.map((prop) => ({
    ...prop,
    docs: asStringArray(prop.sourceDocuments)
      .map((url) => ({ url, key: extractStoragePathFromPublicUrl(url, SOURCE_DOCUMENTS_BUCKET) }))
      .filter((doc): doc is { url: string; key: string } => Boolean(doc.key)),
  }));

  const { data: existingRows, error: existingError } = await serviceSupabase
    .from('proposition_attachments')
    .select('id, proposition_id, storage_key')
    .eq('organization_id', input.organizationId)
    .eq('storage_provider', 'supabase')
    .eq('storage_bucket', SOURCE_DOCUMENTS_BUCKET);

  if (existingError) {
    console.error('Erreur lecture pièces jointes (sync documents source):', existingError);
    return;
  }

  const existingByProp = new Map<string, Map<string, string>>();
  const keyTakenGlobally = new Set<string>();
  for (const row of existingRows ?? []) {
    const propId = String(row.proposition_id);
    const key = String(row.storage_key);
    if (!existingByProp.has(propId)) existingByProp.set(propId, new Map());
    existingByProp.get(propId)!.set(key, String(row.id));
    keyTakenGlobally.add(key);
  }

  const staleIds: string[] = [];
  const toInsert: Record<string, unknown>[] = [];

  for (const prop of byProp) {
    const wanted = new Set(prop.docs.map((doc) => doc.key));
    const existing = existingByProp.get(prop.id);

    if (existing) {
      for (const [key, rowId] of existing) {
        if (!wanted.has(key)) staleIds.push(rowId);
      }
    }

    for (const doc of prop.docs) {
      if (existing?.has(doc.key) || keyTakenGlobally.has(doc.key)) continue;
      const metadata = await fetchObjectMetadata(doc.url);
      if (!metadata) continue; // objet absent ou inaccessible : rien à référencer
      keyTakenGlobally.add(doc.key);
      toInsert.push({
        organization_id: input.organizationId,
        proposition_id: prop.id,
        uploaded_by: prop.uploadedBy ?? null,
        original_name: (prop.originalNames?.[doc.key] ?? friendlyFileNameFromUrl(doc.url)).slice(0, 255),
        mime_type: metadata.mime,
        size_bytes: metadata.size,
        storage_provider: 'supabase',
        storage_bucket: SOURCE_DOCUMENTS_BUCKET,
        storage_key: doc.key,
      });
    }
  }

  if (staleIds.length > 0) {
    const { error: deleteError } = await serviceSupabase
      .from('proposition_attachments')
      .delete()
      .in('id', staleIds)
      .eq('organization_id', input.organizationId);
    if (deleteError) {
      console.error('Erreur suppression pièces jointes obsolètes (sync documents source):', deleteError);
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await serviceSupabase
      .from('proposition_attachments')
      .upsert(toInsert, {
        onConflict: 'storage_provider,storage_bucket,storage_key',
        ignoreDuplicates: true,
      });
    if (insertError) {
      console.error('Erreur création pièces jointes (sync documents source):', insertError);
    }
  }
}

/**
 * Variante pour une seule proposition (écritures via les routes API et la
 * fiche détail).
 */
export async function syncSourceDocumentsAsAttachments(
  serviceSupabase: SupabaseClient,
  input: {
    organizationId: string;
    propositionId: string;
    urls: unknown;
    uploadedBy?: string | null;
    originalNames?: Record<string, string>;
  },
): Promise<void> {
  await syncAllSourceDocumentsAsAttachments(serviceSupabase, {
    organizationId: input.organizationId,
    propositions: [
      {
        id: input.propositionId,
        sourceDocuments: input.urls,
        uploadedBy: input.uploadedBy,
        originalNames: input.originalNames,
      },
    ],
  });
}
