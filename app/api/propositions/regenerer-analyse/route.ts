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
    const {
      ligne_actuelle,
      produit_propose_nom,
      produit_propose_fournisseur,
      prix_actuel,
      prix_propose,
      economie_mensuelle
    } = body;

    const prompt = `Tu es un expert en télécommunications.

SITUATION ACTUELLE DU CLIENT:
${JSON.stringify(ligne_actuelle, null, 2)}

PRODUIT PROPOSÉ:
- Nom: ${produit_propose_nom}
- Fournisseur: ${produit_propose_fournisseur}
- Prix actuel: ${prix_actuel}€/mois
- Prix proposé: ${prix_propose}€/mois
- Économie mensuelle: ${economie_mensuelle}€/mois

INSTRUCTIONS:
Rédige une analyse concise (2-4 phrases) expliquant pourquoi ce produit est recommandé.
Mets en avant:
- Les avantages techniques
- L'aspect économique
- L'adéquation avec les besoins du client

Réponds UNIQUEMENT avec le texte de l'analyse, sans titre ni introduction.`;

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

    const justification =
      message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({ justification });
  } catch (error) {
    console.error('Erreur lors de la régénération de l\'analyse:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération' },
      { status: 500 }
    );
  }
}
