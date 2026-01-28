import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateClaudeApiKey } from '@/lib/ai/claude';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function extractJsonFromText(text: string): unknown {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  return JSON.parse(jsonStr);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!validateClaudeApiKey()) {
      return NextResponse.json(
        {
          error: 'Clé API Claude non configurée',
          details: "La variable ANTHROPIC_API_KEY n'est pas définie",
        },
        { status: 500 }
      );
    }

    const { situation_actuelle, catalogue, preferences } = await request.json();

    if (!Array.isArray(catalogue)) {
      return NextResponse.json({ error: 'catalogue invalide' }, { status: 400 });
    }

    const objectif = preferences?.objectif || 'equilibre';
    const budgetMax = preferences?.budget_max;

    const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle du client et propose la meilleure combinaison de produits de notre catalogue.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle ?? {}, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}

OBJECTIF: ${objectif}
${budgetMax ? `BUDGET MAX: ${budgetMax}€/mois` : ''}

INSTRUCTIONS:
1. Pour chaque ligne/service actuel, trouve le produit le plus adapté
2. Privilégie ${
      objectif === 'economie'
        ? 'les économies maximales'
        : objectif === 'performance'
          ? 'la meilleure performance'
          : "l'équilibre coût/performance"
    }
3. Calcule les économies mensuelles et annuelles
4. Justifie chaque choix

RETOURNE UN JSON:
{
  "suggestions": [
    {
      "ligne_actuelle": {...},
      "produit_propose_id": "uuid",
      "produit_propose_nom": "...",
      "prix_actuel": 0,
      "prix_propose": 0,
      "economie_mensuelle": 0,
      "justification": "..."
    }
  ],
  "synthese": {
    "cout_total_actuel": 0,
    "cout_total_propose": 0,
    "economie_mensuelle": 0,
    "economie_annuelle": 0,
    "ameliorations": ["..."]
  }
}`;

    const preferredModel = 'claude-sonnet-4-20250514';
    const fallbackModel = 'claude-3-7-sonnet-20250219';

    try {
      const message = await anthropic.messages.create({
        model: preferredModel,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const result = extractJsonFromText(text);
      return NextResponse.json(result);
    } catch {
      const message = await anthropic.messages.create({
        model: fallbackModel,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const result = extractJsonFromText(text);
      return NextResponse.json(result);
    }
  } catch {
    return NextResponse.json({ error: 'Erreur génération suggestions' }, { status: 500 });
  }
}
