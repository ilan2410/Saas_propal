import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { defaultSecteur, isAllowedSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categories = searchParams.get('categories')?.split(',').filter(Boolean) ?? [];
    const { data: organization } = await createServiceClient().from('organizations')
      .select('secteur').eq('id', ctx.organizationId).single();
    const orgSecteur = organization?.secteur as Secteur;
    if (!orgSecteur) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    let secteur: unknown = searchParams.get('secteur') ?? defaultSecteur(orgSecteur);
    const templateId = searchParams.get('template_id');
    if (templateId) {
      const { data: template } = await supabase.from('proposition_templates')
        .select('secteur').eq('id', templateId).eq('organization_id', ctx.organizationId).single();
      if (!template || (searchParams.has('secteur') && secteur !== template.secteur)) {
        return NextResponse.json({ error: 'Template ou secteur invalide' }, { status: 400 });
      }
      secteur = template.secteur;
    }
    if (!isAllowedSecteur(orgSecteur, secteur)) return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });

    let query = supabase
      .from('catalogues_produits')
      .select('fournisseur')
      .eq('actif', true)
      .eq('organization_id', ctx.organizationId)
      .eq('secteur_catalogue', secteur)
      .not('fournisseur', 'is', null);

    if (categories.length > 0) {
      query = query.in('categorie', categories);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const fournisseurs = [...new Set((data ?? []).map((r) => r.fournisseur).filter(Boolean))].sort();
    return NextResponse.json({ fournisseurs });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
