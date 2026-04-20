import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Relance l'analyse IA pour un template existant.
 * Enchaîne render-pages -> analyze -> update DB.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { templateId?: string };
    const templateId = body.templateId;
    if (!templateId) return NextResponse.json({ error: 'templateId requis' }, { status: 400 });

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .select('id, organization_id, file_url, file_name, ai_analysis')
      .eq('id', templateId)
      .single();
    if (error || !template)
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
    if (template.organization_id !== user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') || '';

    // 1. Render pages
    const renderResp = await fetch(`${origin}/api/templates/ai/render-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ fileUrl: template.file_url, tempId: template.id }),
    });
    if (!renderResp.ok) {
      const err = await renderResp.text();
      return NextResponse.json({ error: 'Render échoué', details: err }, { status: 500 });
    }
    const renderJson = (await renderResp.json()) as {
      pageImageUrls: string[];
      pageCount: number;
    };

    // 2. Analyze (toutes les pages)
    const selectedPages = Array.from({ length: renderJson.pageCount }, (_, i) => i + 1);
    const analyzeResp = await fetch(`${origin}/api/templates/ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        fileUrl: template.file_url,
        pageImageUrls: renderJson.pageImageUrls,
        selectedPages,
        secteur: 'telephonie',
      }),
    });
    if (!analyzeResp.ok) {
      const err = await analyzeResp.text();
      return NextResponse.json({ error: 'Analyse échouée', details: err }, { status: 500 });
    }
    const analyzeJson = await analyzeResp.json();

    // 3. Met à jour ai_analysis en DB
    await supabase
      .from('proposition_templates')
      .update({ ai_analysis: analyzeJson.analysis })
      .eq('id', templateId);

    return NextResponse.json({ success: true, analysis: analyzeJson.analysis });
  } catch (error) {
    console.error('[AI] re-analyze error:', error);
    return NextResponse.json(
      {
        error: "Échec du re-analyze",
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
