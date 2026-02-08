import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { suggestions, situation_actuelle } = body;

    const prompt = `Tu es un expert en télécommunications.

SITUATION ACTUELLE DU CLIENT:
${JSON.stringify(situation_actuelle || {}, null, 2)}

RECOMMANDATIONS PROPOSÉES:
${JSON.stringify(suggestions, null, 2)}

INSTRUCTIONS:
Génère une liste de 3-5 points clés résumant les principaux avantages de cette proposition globale.

Réponds UNIQUEMENT avec un JSON:
{
  "ameliorations": [
    "Point clé 1",
    "Point clé 2",
    "Point clé 3"
  ]
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Extraction du JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      console.error('Erreur parsing JSON Claude:', responseText);
      result = { ameliorations: [] };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur lors de la régénération de la synthèse:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération' },
      { status: 500 }
    );
  }
}
