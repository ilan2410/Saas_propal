import { SupabaseClient } from '@supabase/supabase-js';

type PropositionSourceDocsRow = {
  id: string;
  source_documents: unknown;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function extractStoragePathFromPublicUrl(url: string, bucket: string): string | null {
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

/**
 * Purge les documents source (envoyés à l'IA pour extraction) des anciennes
 * propositions au-delà des N plus récentes, pour limiter le stockage.
 *
 * La proposition elle-même (et le document généré/téléchargeable) n'est
 * jamais supprimée : sa fiche reste toujours consultable. Seuls les
 * documents source, qui représentent l'essentiel du volume de stockage,
 * sont retirés au-delà de la limite.
 */
export async function purgeOldSourceDocuments(
  serviceSupabase: SupabaseClient,
  organizationId: string,
  limit: number = 15
) {
  try {
    const { data: allProps, error: listError } = await serviceSupabase
      .from('propositions')
      .select('id, source_documents')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (listError) {
      console.error('Erreur listing propositions pour purge des documents source:', listError);
      return;
    }

    const rows = (allProps || []) as PropositionSourceDocsRow[];

    if (rows.length <= limit) {
      return; // Rien à purger
    }

    const toPurge = rows.slice(limit).filter((p) => asStringArray(p.source_documents).length > 0);

    if (toPurge.length === 0) {
      return; // Les propositions au-delà de la limite n'ont déjà plus de documents source
    }

    console.log(
      `🧹 Purge: suppression des documents source de ${toPurge.length} ancienne(s) proposition(s) pour l'organisation ${organizationId}`
    );

    const urls: string[] = [];
    for (const p of toPurge) {
      urls.push(...asStringArray(p.source_documents));
    }

    const documentsPaths = Array.from(
      new Set(
        urls.map((u) => extractStoragePathFromPublicUrl(u, 'documents')).filter(Boolean) as string[]
      )
    );

    if (documentsPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('documents').remove(documentsPaths);
      if (storageError) console.error('Erreur suppression documents source (purge):', storageError);
    }

    const idsToUpdate = toPurge.map((p) => p.id);
    const { error: updateError } = await serviceSupabase
      .from('propositions')
      .update({ source_documents: [] })
      .in('id', idsToUpdate)
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('Erreur mise à jour source_documents après purge:', updateError);
    }
  } catch (error) {
    console.error('Erreur globale lors de la purge des documents source:', error);
  }
}
