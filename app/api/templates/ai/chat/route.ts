import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  chatRefineAnalysis,
  resolveClaudeModel,
  type AIAnalysis,
  type AIChatMessage,
} from '@/lib/ai/template-analyzer';
import type { Secteur } from '@/lib/ai/fields-catalog';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatBody {
  message: string;
  currentAnalysis: AIAnalysis;
  chatHistory: AIChatMessage[];
  secteur: Secteur;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Partial<ChatBody>;
    if (!body.message || !body.currentAnalysis) {
      return NextResponse.json({ error: 'message et currentAnalysis requis' }, { status: 400 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('claude_model')
      .eq('id', user.id)
      .single();
    const claudeModel = resolveClaudeModel(org?.claude_model);

    const { response, updatedAnalysis } = await chatRefineAnalysis({
      message: body.message,
      analysis: body.currentAnalysis,
      history: body.chatHistory || [],
      claudeModel,
      secteur: (body.secteur || 'telephonie') as Secteur,
    });

    return NextResponse.json({ success: true, response, updatedAnalysis });
  } catch (error) {
    console.error('[AI] chat error:', error);
    return NextResponse.json(
      {
        error: 'Échec du chat IA',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
