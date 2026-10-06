import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import {
  SOURCE_DOCUMENTS_BUCKET,
  asStringArray,
  extractStoragePathFromPublicUrl,
} from '@/lib/propositions/source-documents';

/**
 * Documents sources d'une proposition, dans l'ordre où ils ont été fournis à
 * l'extraction (= `document_index` du rapport d'analyse), chacun relié à sa
 * pièce jointe pour pouvoir être prévisualisé avec le visualiseur existant.
 * `attachment` vaut null si aucune pièce jointe ne correspond à ce document.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: proposition } = await scopePropositionsQuery(
    supabase.from('propositions').select('id, source_documents').eq('id', id),
    ctx,
  ).single();
  if (!proposition) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });

  const urls = asStringArray(proposition.source_documents);
  const keys = urls.map((url) => extractStoragePathFromPublicUrl(url, SOURCE_DOCUMENTS_BUCKET));

  const { data: rows, error } = await supabase
    .from('proposition_attachments')
    .select('id, original_name, mime_type, size_bytes, created_at, storage_key')
    .eq('proposition_id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('storage_bucket', SOURCE_DOCUMENTS_BUCKET);
  if (error) return NextResponse.json({ error: 'Chargement des documents impossible' }, { status: 500 });

  const byKey = new Map((rows ?? []).map((row) => [String(row.storage_key), row]));

  return NextResponse.json({
    documents: urls.map((_, index) => {
      const row = keys[index] ? byKey.get(keys[index]!) : undefined;
      return {
        index,
        attachment: row
          ? {
              id: row.id,
              originalName: row.original_name,
              mimeType: row.mime_type,
              sizeBytes: row.size_bytes,
              createdAt: row.created_at,
            }
          : null,
      };
    }),
  });
}
