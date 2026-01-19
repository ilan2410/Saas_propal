import { NextRequest, NextResponse } from 'next/server';
import { extractDataFromDocuments } from '@/lib/ai/claude';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documents_urls, champs_actifs, claude_model, prompt_template, secteur } = body;

    // Validation
    if (!documents_urls || documents_urls.length === 0) {
      return NextResponse.json(
        { error: 'Aucun document fourni' },
        { status: 400 }
      );
    }

    if (!champs_actifs || champs_actifs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun champ actif fourni' },
        { status: 400 }
      );
    }

    console.log('Test extraction IA:', {
      documents: documents_urls.length,
      champs: champs_actifs.length,
      model: claude_model,
      secteur,
    });

    // Extraire les données avec Claude
    const donneesExtraites = await extractDataFromDocuments({
      documents_urls,
      champs_actifs,
      prompt_template: prompt_template || '',
      claude_model: claude_model || 'claude-3-7-sonnet-20250219',
    });

    console.log('Extraction réussie:', {
      champsExtraits: Object.keys(donneesExtraites).length,
    });

    return NextResponse.json({
      success: true,
      donnees_extraites: donneesExtraites,
      stats: {
        champs_demandes: champs_actifs.length,
        champs_extraits: Object.keys(donneesExtraites).length,
        taux_reussite: Math.round(
          (Object.keys(donneesExtraites).length / champs_actifs.length) * 100
        ),
      },
    });
  } catch (error) {
    console.error('Erreur test extraction:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors du test d\'extraction',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
