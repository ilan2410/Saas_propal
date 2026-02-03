import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComparatifPdf } from '@/lib/pdf/comparatif-generator';
import { SuggestionsGenerees } from '@/types';

type OrganizationPdfSettings = {
  nom?: string | null;
  pdf_header_logo_url?: string | null;
  pdf_footer_text?: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { suggestions, synthese } = await request.json();
    
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
      return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
    }

    const orgValue: unknown = (proposition as { organizations?: unknown }).organizations;
    const org: OrganizationPdfSettings | undefined = Array.isArray(orgValue)
      ? (orgValue[0] as OrganizationPdfSettings | undefined)
      : orgValue && typeof orgValue === 'object'
        ? (orgValue as OrganizationPdfSettings)
        : undefined;

    const pdfBytes = await generateComparatifPdf({
      suggestions: { suggestions, synthese } as SuggestionsGenerees,
      clientName: proposition.nom_client || 'Client',
      logoUrl: org?.pdf_header_logo_url ?? undefined,
      footerText: org?.pdf_footer_text || `Généré par PropoBoost pour ${org?.nom || 'Organisation'}`,
    });

    const pdfBytesArray = new Uint8Array(pdfBytes);
    const pdfBlob = new Blob([pdfBytesArray], { type: 'application/pdf' });

    return new NextResponse(pdfBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="comparatif-telecom-${proposition.nom_client || 'client'}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    return NextResponse.json({ 
        error: 'Erreur génération PDF', 
        details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
