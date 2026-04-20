import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  renderDocxToPdf,
  renderPdfToImages,
} from '@/lib/ai/template-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readInput(request: NextRequest): Promise<{ buffer: Buffer; fileName: string; tempId: string } | null> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as unknown;
    const fileUrl = isRecord(body) && typeof body.fileUrl === 'string' ? body.fileUrl : '';
    const tempId =
      (isRecord(body) && typeof body.tempId === 'string' && body.tempId) ||
      String(Date.now());
    if (!fileUrl) return null;
    const resp = await fetch(fileUrl);
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return {
      buffer: Buffer.from(ab),
      fileName: fileUrl.split('/').pop() || 'template.docx',
      tempId,
    };
  }
  const form = await request.formData();
  const file = form.get('file') as File | null;
  const tempId = (form.get('tempId') as string) || String(Date.now());
  if (!file) return null;
  const ab = await file.arrayBuffer();
  return { buffer: Buffer.from(ab), fileName: file.name, tempId };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const input = await readInput(request);
    if (!input) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // 1. .docx -> pdf -> images
    const pdfBuffer = await renderDocxToPdf(input.buffer);
    const pageImages = await renderPdfToImages(pdfBuffer);

    // 2. Upload images dans Supabase Storage
    const pageImageUrls: string[] = [];
    for (let i = 0; i < pageImages.length; i++) {
      const path = `${user.id}/ai/${input.tempId}/pages/page-${i + 1}.png`;
      const { error } = await supabase.storage
        .from('templates')
        .upload(path, pageImages[i], {
          contentType: 'image/png',
          upsert: true,
        });
      if (error) {
        console.error('[AI] Upload page error:', error);
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from('templates').getPublicUrl(path);
      pageImageUrls.push(publicUrl);
    }

    // 3. Texte complet (mammoth) — import dynamique pour éviter l'évaluation
    // du module natif pendant la phase "Collecting page data" du build Next.js
    const mammothMod = await import('mammoth');
    const mammoth =
      (mammothMod as unknown as { default?: typeof mammothMod }).default ?? mammothMod;
    const { value: docxText } = await mammoth.extractRawText({ buffer: input.buffer });

    return NextResponse.json({
      success: true,
      pageImageUrls,
      pageCount: pageImages.length,
      docxText,
      tempId: input.tempId,
    });
  } catch (error) {
    console.error('[AI] render-pages error:', error);
    return NextResponse.json(
      {
        error: 'Échec du rendu des pages',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
