import { SupabaseClient } from '@supabase/supabase-js';

type PropositionListRow = {
  id: string;
  created_at: string;
  exported_at?: string | null;
  nom_client?: string | null;
  template_id?: string | null;
  generated_file_name?: string | null;
  source_documents: unknown;
  duplicated_template_url: string | null;
  template?: unknown;
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
 * Nettoie les anciennes propositions pour ne garder que les N plus récentes.
 * Supprime également les fichiers associés dans le stockage.
 */
export async function cleanupOldPropositions(
  serviceSupabase: SupabaseClient,
  organizationId: string,
  limit: number = 15
) {
  try {
    const { data: allProps, error: listError } = await serviceSupabase
      .from('propositions')
      .select('id, created_at, exported_at, nom_client, template_id, generated_file_name, source_documents, duplicated_template_url, template:proposition_templates(nom, file_type)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (listError) {
      console.error('Erreur listing propositions pour cleanup:', listError);
      return;
    }

    const rows = (allProps || []) as PropositionListRow[];

    if (rows.length <= limit) {
      return; // Rien à nettoyer
    }

    const toDelete = rows.slice(limit);
    console.log(
      `🧹 Nettoyage: Suppression de ${toDelete.length} anciennes propositions pour l'utilisateur ${organizationId}`
    );

    const idsToDelete = toDelete.map((p) => p.id).filter(Boolean);

    if (toDelete.length > 0) {
      const archiveRows = toDelete.map((p) => {
        const templateValue = p.template;
        const template =
          Array.isArray(templateValue)
            ? (templateValue[0] as Record<string, unknown> | undefined)
            : templateValue && typeof templateValue === 'object'
              ? (templateValue as Record<string, unknown>)
              : undefined;

        const templateNom = typeof template?.nom === 'string' ? template.nom : null;
        const templateType = typeof template?.file_type === 'string' ? template.file_type : null;

        return {
          organization_id: organizationId,
          proposition_id: p.id,
          template_id: p.template_id ?? null,
          template_nom: templateNom,
          template_type: templateType,
          nom_client: p.nom_client ?? null,
          created_at: p.created_at ?? null,
          exported_at: p.exported_at ?? null,
          source_documents: p.source_documents ?? null,
          generated_file_name: p.generated_file_name ?? null,
        };
      });

      const { error: archiveError } = await serviceSupabase
        .from('propositions_archive')
        .upsert(archiveRows, { onConflict: 'proposition_id' });

      if (archiveError) {
        console.error('Erreur insertion archive propositions:', archiveError);
      }
    }

    const urls: string[] = [];
    for (const p of toDelete) {
      urls.push(...asStringArray(p.source_documents));
      const generatedUrl = p.duplicated_template_url;
      if (typeof generatedUrl === 'string' && generatedUrl) urls.push(generatedUrl);
    }

    const documentsPaths = Array.from(
      new Set(
        urls.map((u) => extractStoragePathFromPublicUrl(u, 'documents')).filter(Boolean) as string[]
      )
    );

    const templatesPaths = Array.from(
      new Set(urls.map((u) => extractStoragePathFromPublicUrl(u, 'templates')).filter(Boolean) as string[])
    );

    const propositionsPaths = Array.from(
      new Set(
        urls.map((u) => extractStoragePathFromPublicUrl(u, 'propositions')).filter(Boolean) as string[]
      )
    );

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await serviceSupabase
        .from('propositions')
        .delete()
        .in('id', idsToDelete)
        .eq('organization_id', organizationId);

      if (deleteError) {
        console.error('Erreur suppression propositions (cleanup):', deleteError);
        return;
      }
    }

    if (documentsPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('documents').remove(documentsPaths);
      if (storageError) console.error('Erreur suppression documents (cleanup):', storageError);
    }

    if (templatesPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('templates').remove(templatesPaths);
      if (storageError) console.error('Erreur suppression templates (cleanup):', storageError);
    }

    if (propositionsPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('propositions').remove(propositionsPaths);
      if (storageError) console.error('Erreur suppression propositions bucket (cleanup):', storageError);
    }
  } catch (error) {
    console.error('Erreur globale lors du cleanup des propositions:', error);
  }
}
