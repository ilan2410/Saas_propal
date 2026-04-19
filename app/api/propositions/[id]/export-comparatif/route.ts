import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComparatifPdf } from '@/lib/pdf/comparatif-generator';
import { generateComparatifWord } from '@/lib/word/comparatif-generator';
import { OrganizationPreferences, SpCustomization, SuggestionsGenerees } from '@/types';

type OrganizationPdfSettings = {
  nom?: string | null;
  pdf_header_logo_url?: string | null;
  pdf_footer_text?: string | null;
  logo_url?: string | null;
  preferences?: OrganizationPreferences | null;
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

    const body = await request.json().catch(() => ({}));
    let { suggestions, synthese } = body;
    
    // Si les données ne sont pas fournies dans le body, on les récupère de la BDD
    if (!suggestions || !synthese) {
      console.log('🔵 [PDF Export] Données manquantes dans le body, récupération depuis la BDD...');
      const { data: propData, error: fetchError } = await supabase
        .from('propositions')
        .select('suggestions_editees, suggestions_generees')
        .eq('id', id)
        .single();
        
      if (fetchError || !propData) {
        return NextResponse.json({ error: 'Proposition introuvable ou données manquantes' }, { status: 404 });
      }
      
      const sourceData = propData.suggestions_editees || propData.suggestions_generees;
      if (
        sourceData &&
        typeof sourceData === 'object' &&
        'suggestions' in sourceData &&
        'synthese' in sourceData
      ) {
        const typed = sourceData as { suggestions: unknown; synthese: unknown };
        suggestions = typed.suggestions;
        synthese = typed.synthese;
      }
    }
    
    console.log('🔵 [PDF Export] Données à utiliser:', {
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
          pdf_footer_text,
          logo_url,
          preferences
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

    // Personnalisation SP (logo, couleur, footer, format...)
    const sp: SpCustomization = (org?.preferences?.sp_customization as SpCustomization | undefined) || {};
    const companyName = (sp.company_name && sp.company_name.trim()) || org?.nom || 'Organisation';
    const logoUrl = sp.logo_url || org?.pdf_header_logo_url || org?.logo_url || undefined;
    const footerText = sp.footer_text || org?.pdf_footer_text || `Généré par PropoBoost pour ${companyName}`;
    const primaryColor = sp.primary_color;
    const outputFormat = sp.output_format === 'word' ? 'word' : 'pdf';
    const logoSize = sp.logo_size;
    const logoPosition = sp.logo_position;
    const titleText = sp.title_text;
    const titleSize = sp.title_size;
    const titleColor = sp.title_color;
    const subtitleText = sp.subtitle_text;
    const subtitleSize = sp.subtitle_size;
    const subtitleColor = sp.subtitle_color;
    const titleAlignment = sp.title_alignment;
    const subtitleAlignment = sp.subtitle_alignment;

    const safeFileBase = `comparatif-telecom-${(resolvedClientName || 'client').replace(/[^a-zA-Z0-9-_]/g, '_')}`;

    if (outputFormat === 'word') {
      console.log('🔵 [Export] Génération Word...');
      const wordBuffer = await generateComparatifWord({
        suggestions: { suggestions, synthese } as SuggestionsGenerees,
        clientName: resolvedClientName,
        logoUrl,
        footerText,
        companyName,
        primaryColor,
      });

      if (!wordBuffer || wordBuffer.length === 0) {
        return NextResponse.json(
          { error: 'Erreur génération Word', details: 'Le fichier Word généré est vide' },
          { status: 500 }
        );
      }

      return new NextResponse(wordBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="${safeFileBase}.doc"`,
          'Content-Length': wordBuffer.length.toString(),
        },
      });
    }

    console.log('🔵 [PDF Export] Génération du PDF...');
    const pdfBytes = await generateComparatifPdf({
      suggestions: { suggestions, synthese } as SuggestionsGenerees,
      clientName: resolvedClientName,
      logoUrl,
      footerText,
      companyName,
      primaryColor,
      logoSize,
      logoPosition,
      titleText,
      titleSize,
      titleColor,
      subtitleText,
      subtitleSize,
      subtitleColor,
      titleAlignment,
      subtitleAlignment,
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
        'Content-Disposition': `attachment; filename="${safeFileBase}.pdf"`,
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
