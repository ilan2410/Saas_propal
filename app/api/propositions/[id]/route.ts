import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function extractStoragePathFromPublicUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rawPathWithParams = url.slice(idx + marker.length);
  const rawPath = rawPathWithParams.split('?')[0].split('#')[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

export async function GET(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer la proposition avec le template
    const { data: proposition, error } = await supabase
      .from('propositions')
      .select(`
        *,
        template:proposition_templates(*)
      `)
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (error || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    return NextResponse.json({ proposition });
  } catch (error) {
    console.error('Error fetching proposition:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: proposition, error: fetchError } = await serviceSupabase
      .from('propositions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (fetchError || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    const urls: string[] = [];
    const sourceDocsRaw =
      proposition.source_documents ?? proposition.documents_urls ?? proposition.documents_sources_urls;
    if (Array.isArray(sourceDocsRaw)) {
      urls.push(...sourceDocsRaw.filter((u): u is string => typeof u === 'string' && Boolean(u)));
    }

    const generatedUrlRaw = proposition.duplicated_template_url ?? proposition.fichier_genere_url;
    if (typeof generatedUrlRaw === 'string' && generatedUrlRaw) {
      urls.push(generatedUrlRaw);
    }

    const documentsPaths = urls
      .map((u) => extractStoragePathFromPublicUrl(u, 'documents'))
      .filter(Boolean) as string[];

    const templatesPaths = urls
      .map((u) => extractStoragePathFromPublicUrl(u, 'templates'))
      .filter(Boolean) as string[];

    const propositionsPaths = urls
      .map((u) => extractStoragePathFromPublicUrl(u, 'propositions'))
      .filter(Boolean) as string[];

    if (documentsPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('documents').remove(documentsPaths);
      if (storageError) {
        console.error('Error deleting documents files:', storageError);
      }
    }

    if (templatesPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('templates').remove(templatesPaths);
      if (storageError) {
        console.error('Error deleting templates files:', storageError);
      }
    }

    if (propositionsPaths.length > 0) {
      const { error: storageError } = await serviceSupabase.storage.from('propositions').remove(propositionsPaths);
      if (storageError) {
        console.error('Error deleting propositions files:', storageError);
      }
    }

    // Supprimer la proposition
    const { error } = await serviceSupabase
      .from('propositions')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting proposition:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
