import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'older_than_30_days' ? 'older_than_30_days' : 'all';

    const serviceSupabase = createServiceClient();

    // 1. Récupérer les propositions à supprimer
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const { data: propositions, error: listError } = await serviceSupabase
      .from('propositions')
      .select('id, duplicated_template_url, created_at, source_documents')
      .eq('organization_id', user.id)
      .order('created_at', { ascending: false });

    if (listError) {
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des propositions' },
        { status: 500 }
      );
    }

    const filteredPropositions =
      mode === 'older_than_30_days'
        ? (propositions || []).filter((p) => new Date(p.created_at).getTime() < cutoffDate.getTime())
        : (propositions || []);

    if (filteredPropositions.length === 0) {
      return NextResponse.json({ success: true, deleted_count: 0 });
    }

    // 2. Identifier les fichiers à supprimer dans le bucket 'propositions'
    const propositionPathsToDelete = filteredPropositions
      .map(p => p.duplicated_template_url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0)
      .map(url => extractStoragePathFromPublicUrl(url, 'propositions'))
      .filter((path): path is string => path !== null);

    const documentPathsToDelete = filteredPropositions
      .flatMap((p) => asStringArray(p.source_documents))
      .map((url) => extractStoragePathFromPublicUrl(url, 'documents'))
      .filter((path): path is string => path !== null);

    // 3. Supprimer les fichiers du storage
    if (propositionPathsToDelete.length > 0) {
      const { error: storageError } = await serviceSupabase.storage
        .from('propositions')
        .remove(propositionPathsToDelete);
        
      if (storageError) {
        console.error('Erreur suppression fichiers storage:', storageError);
        // On continue quand même pour supprimer les entrées BDD
      }
    }

    if (documentPathsToDelete.length > 0) {
      const { error: storageError } = await serviceSupabase.storage
        .from('documents')
        .remove(documentPathsToDelete);

      if (storageError) {
        console.error('Erreur suppression documents storage:', storageError);
      }
    }

    // 4. Supprimer les entrées BDD
    const ids = filteredPropositions.map((p) => p.id);
    const { error: deleteError, count } = await serviceSupabase
      .from('propositions')
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('organization_id', user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Erreur lors de la suppression des propositions en base' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted_count: count });
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}
