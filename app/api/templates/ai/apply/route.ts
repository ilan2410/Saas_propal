import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  injectVariablesIntoDocx,
  buildFileConfigFromAnalysis,
} from '@/lib/ai/docx-injector';
import type { AIAnalysis } from '@/lib/ai/template-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ApplyBody {
  fileUrl: string;
  analysis: AIAnalysis;
  templateName: string;
  tempId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Partial<ApplyBody>;
    if (!body.fileUrl || !body.analysis) {
      return NextResponse.json({ error: 'fileUrl et analysis requis' }, { status: 400 });
    }

    // Télécharger le .docx original
    const resp = await fetch(body.fileUrl);
    if (!resp.ok)
      return NextResponse.json({ error: 'Impossible de télécharger le fichier' }, { status: 400 });
    const originalBuffer = Buffer.from(await resp.arrayBuffer());

    // Injecter les variables
    const modifiedBuffer = await injectVariablesIntoDocx(originalBuffer, body.analysis);

    // Construire file_config + champs_actifs
    const { fileConfig, champsActifs } = buildFileConfigFromAnalysis(body.analysis);

    // Uploader le nouveau .docx
    const timestamp = Date.now();
    const safeName = (body.templateName || 'template').replace(/[^a-z0-9_-]/gi, '_');
    const path = `${user.id}/ai/${body.tempId || timestamp}/${safeName}-${timestamp}.docx`;

    const { error: upErr } = await supabase.storage
      .from('templates')
      .upload(path, modifiedBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('templates').getPublicUrl(path);

    return NextResponse.json({
      success: true,
      fileUrl: publicUrl,
      fileConfig,
      champsActifs,
      aiAnalysis: body.analysis,
    });
  } catch (error) {
    console.error('[AI] apply error:', error);
    return NextResponse.json(
      {
        error: "Échec de l'injection des variables",
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
