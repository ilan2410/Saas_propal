import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  analyzeWithClaude,
  extractTablesXml,
  extractTextByPage,
  resolveClaudeModel,
  type AIAnalysis,
} from '@/lib/ai/template-analyzer';
import type { Secteur } from '@/lib/ai/fields-catalog';

export const runtime = 'nodejs';
export const maxDuration = 180;

interface AnalyzeBody {
  fileUrl: string;
  pageImageUrls: string[];
  selectedPages: number[];
  secteur: Secteur;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Partial<AnalyzeBody>;
    const fileUrl = body.fileUrl || '';
    const pageImageUrls = body.pageImageUrls || [];
    const selectedPages = body.selectedPages || [];
    const secteur = (body.secteur || 'telephonie') as Secteur;

    if (!fileUrl) return NextResponse.json({ error: 'fileUrl manquant' }, { status: 400 });
    if (selectedPages.length === 0)
      return NextResponse.json({ error: 'Aucune page sélectionnée' }, { status: 400 });

    // Récupère le claude_model de l'organisation
    const { data: org } = await supabase
      .from('organizations')
      .select('claude_model')
      .eq('id', user.id)
      .single();

    const claudeModel = resolveClaudeModel(org?.claude_model);

    // Télécharge le .docx
    const docxResp = await fetch(fileUrl);
    if (!docxResp.ok)
      return NextResponse.json({ error: 'Impossible de télécharger le .docx' }, { status: 400 });
    const docxBuffer = Buffer.from(await docxResp.arrayBuffer());

    // Texte par page
    const textPerPage = await extractTextByPage(docxBuffer);
    // Fallback si mammoth n'a renvoyé qu'une seule page
    if (textPerPage.length < pageImageUrls.length) {
      const mammothMod = await import('mammoth');
      const mammoth =
        (mammothMod as unknown as { default?: typeof mammothMod }).default ?? mammothMod;
      const { value } = await mammoth.extractRawText({ buffer: docxBuffer });
      const sizePerPage = Math.ceil(value.length / Math.max(1, pageImageUrls.length));
      while (textPerPage.length < pageImageUrls.length) {
        const start = textPerPage.length * sizePerPage;
        textPerPage.push(value.slice(start, start + sizePerPage));
      }
    }

    // XML des tableaux (globaux — le découpage par page Word est fragile)
    const tablesXml = await extractTablesXml(docxBuffer);

    // Télécharger en base64 les images des pages sélectionnées
    const pagesPayload: Array<{ pageNumber: number; imageBase64: string; text: string }> = [];
    for (const pageNum of selectedPages) {
      const url = pageImageUrls[pageNum - 1];
      if (!url) continue;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer()).toString('base64');
      pagesPayload.push({
        pageNumber: pageNum,
        imageBase64: buf,
        text: textPerPage[pageNum - 1] || '',
      });
    }

    const analysis: AIAnalysis = await analyzeWithClaude({
      pages: pagesPayload,
      tablesXml,
      secteur,
      claudeModel,
      pageImageUrls,
      selectedPages,
    });

    return NextResponse.json({ success: true, analysis, claudeModel });
  } catch (error) {
    console.error('[AI] analyze error:', error);
    return NextResponse.json(
      {
        error: "Échec de l'analyse IA",
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
