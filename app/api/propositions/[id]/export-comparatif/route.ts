import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComparatifPdf } from '@/lib/pdf/comparatif-generator';
import { SuggestionsGenerees } from '@/types';

type OrganizationPdfSettings = {
  nom?: string | null;
  pdf_header_logo_url?: string | null;
  pdf_footer_text?: string | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const normalized = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (normalized === 'client' || normalized === 'client non specifie') {
      continue;
    }
    return trimmed;
  }
  return null;
}

function resolveClientNameFromProposition(proposition: UnknownRecord): string | null {
  const direct = firstNonEmptyString([proposition.nom_client]);
  if (direct) return direct;

  const filled = proposition.filled_data;
  if (isRecord(filled)) {
    const fromFlat = firstNonEmptyString([filled.nom_client, filled.client_nom]);
    if (fromFlat) return fromFlat;
    const client = filled.client;
    if (isRecord(client)) {
      const fromClient = firstNonEmptyString([
        client.raison_sociale,
        client.nom_commercial,
        client.nom,
        client.name,
      ]);
      if (fromClient) return fromClient;
    }
  }

  const extracted = proposition.extracted_data;
  if (isRecord(extracted)) {
    const fromFlat = firstNonEmptyString([extracted.nom_client, extracted.client_nom, extracted['client.nom']]);
    if (fromFlat) return fromFlat;
    const client = extracted.client;
    if (isRecord(client)) {
      const fromClient = firstNonEmptyString([
        client.raison_sociale,
        client.nom_commercial,
        client.nom,
        client.name,
      ]);
      if (fromClient) return fromClient;
    }
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🔵 [PDF Export] Début de la requête');
  
  try {
    const { id } = await params;
    console.log('🔵 [PDF Export] Proposition ID:', id);
    
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log('🔴 [PDF Export] Utilisateur non authentifié');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { suggestions, synthese } = body;
    
    console.log('🔵 [PDF Export] Body reçu:', {
      hasSuggestions: !!suggestions,
      suggestionsLength: suggestions?.length,
      hasSynthese: !!synthese,
      synthese: synthese
    });

    // Validation des données
    if (!suggestions || !Array.isArray(suggestions)) {
      console.log('🔴 [PDF Export] Suggestions manquantes ou invalides');
      return NextResponse.json({ 
        error: 'Données invalides', 
        details: 'Le champ "suggestions" est requis et doit être un tableau' 
      }, { status: 400 });
    }

    if (!synthese || typeof synthese !== 'object') {
      console.log('🔴 [PDF Export] Synthèse manquante ou invalide');
      return NextResponse.json({ 
        error: 'Données invalides', 
        details: 'Le champ "synthese" est requis' 
      }, { status: 400 });
    }
    
    // Récupérer infos proposition et organisation
    const { data: proposition, error: propError } = await supabase
      .from('propositions')
      .select(`
        *,
        organizations (
          nom,
          pdf_header_logo_url,
          pdf_footer_text
        )
      `)
      .eq('id', id)
      .single();

    if (propError || !proposition) {
      console.log('🔴 [PDF Export] Proposition introuvable:', propError);
      return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
    }

    console.log('🔵 [PDF Export] Proposition trouvée:', proposition.nom_client);
    const resolvedClientName =
      resolveClientNameFromProposition(proposition as UnknownRecord) || 'Client';

    const orgValue: unknown = (proposition as { organizations?: unknown }).organizations;
    const org: OrganizationPdfSettings | undefined = Array.isArray(orgValue)
      ? (orgValue[0] as OrganizationPdfSettings | undefined)
      : orgValue && typeof orgValue === 'object'
        ? (orgValue as OrganizationPdfSettings)
        : undefined;

    console.log('🔵 [PDF Export] Organisation:', org?.nom);
    console.log('🔵 [PDF Export] Génération du PDF...');

    const pdfBytes = await generateComparatifPdf({
      suggestions: { suggestions, synthese } as SuggestionsGenerees,
      clientName: resolvedClientName,
      logoUrl: org?.pdf_header_logo_url ?? undefined,
      footerText: org?.pdf_footer_text || `Généré par PropoBoost pour ${org?.nom || 'Organisation'}`,
    });

    console.log('🟢 [PDF Export] PDF généré, taille:', pdfBytes.length, 'bytes');

    // Vérifier que le PDF n'est pas vide
    if (!pdfBytes || pdfBytes.length === 0) {
      console.log('🔴 [PDF Export] PDF généré est vide!');
      return NextResponse.json({ 
        error: 'Erreur génération PDF', 
        details: 'Le PDF généré est vide' 
      }, { status: 500 });
    }

    // Créer un Buffer à partir du Uint8Array pour Node.js
    const buffer = Buffer.from(pdfBytes);

    console.log('🟢 [PDF Export] Envoi de la réponse, buffer size:', buffer.length);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="comparatif-telecom-${resolvedClientName || 'client'}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('🔴 [PDF Export] Erreur:', error);
    return NextResponse.json({ 
        error: 'Erreur génération PDF', 
        details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
