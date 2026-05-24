import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SuggestionsSpCompletes, OrganizationPreferences, SpCustomization } from '@/types';
import { generateComparatifSaSpExcel } from '@/lib/excel/comparatif-sa-sp-generator';
import { generateComparatifSaSpWord } from '@/lib/word/comparatif-sa-sp-generator';

type RouteParams = { params: Promise<{ id: string }> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get('format') ?? 'excel';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: proposition, error } = await supabase
    .from('propositions')
    .select(`*, organizations(nom, preferences, logo_url, pdf_header_logo_url)`)
    .eq('id', id)
    .eq('organization_id', user.id)
    .single();

  if (error || !proposition) {
    return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
  }

  const sp = proposition.suggestions_sp_completes as SuggestionsSpCompletes | null;
  if (!sp || !sp.sp_total_propose) {
    return NextResponse.json(
      { error: 'Aucune donnée SP disponible. Complétez d\'abord le questionnaire SP.' },
      { status: 400 },
    );
  }

  const orgRaw = proposition.organizations;
  const org = isRecord(orgRaw)
    ? orgRaw
    : Array.isArray(orgRaw) && orgRaw.length > 0
      ? (orgRaw[0] as Record<string, unknown>)
      : null;

  const prefs = (isRecord(org?.preferences) ? org.preferences : {}) as OrganizationPreferences;
  const spCustom = (isRecord(prefs.sp_customization) ? prefs.sp_customization : {}) as SpCustomization;
  const companyName = (typeof spCustom.company_name === 'string' && spCustom.company_name.trim())
    || (typeof org?.nom === 'string' ? org.nom : '')
    || 'Organisation';
  const primaryColor = typeof spCustom.primary_color === 'string' ? spCustom.primary_color : '#0D4073';
  const logoUrl = typeof spCustom.logo_url === 'string'
    ? spCustom.logo_url
    : typeof org?.pdf_header_logo_url === 'string'
      ? org.pdf_header_logo_url
      : typeof org?.logo_url === 'string'
        ? org.logo_url
        : undefined;

  const clientName = proposition.nom_client || 'Client';
  const safeClient = clientName.replace(/[^a-zA-Z0-9-_]/g, '_');

  try {
    if (format === 'word') {
      const buf = await generateComparatifSaSpWord({
        sp, clientName, companyName, primaryColor, logoUrl,
        footerText: `Généré par ${companyName} pour ${clientName}`,
      });
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="comparatif-sa-sp-${safeClient}.doc"`,
          'Content-Length': buf.length.toString(),
        },
      });
    }

    // Default: Excel
    const buf = await generateComparatifSaSpExcel({ sp, clientName, companyName, primaryColor });
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="comparatif-sa-sp-${safeClient}.xlsx"`,
        'Content-Length': buf.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Erreur génération export', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
