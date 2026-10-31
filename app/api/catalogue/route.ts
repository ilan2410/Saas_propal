import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { defaultSecteur, isAllowedSecteur, isCatalogueSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const categorie = searchParams.get('categorie');
    const requestedSecteur = searchParams.get('secteur');
    const templateId = searchParams.get('template_id');

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: organization } = await service.from('organizations').select('secteur').eq('id', ctx.organizationId).single();
    const orgSecteur = organization?.secteur as Secteur;
    if (!orgSecteur) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    let secteur: unknown = requestedSecteur ?? defaultSecteur(orgSecteur);
    if (templateId) {
      const { data: template } = await supabase.from('proposition_templates')
        .select('secteur').eq('id', templateId).eq('organization_id', ctx.organizationId).single();
      if (!template || (requestedSecteur && requestedSecteur !== template.secteur)) {
        return NextResponse.json({ error: 'Template ou secteur invalide' }, { status: 400 });
      }
      secteur = template.secteur;
    }
    if (!isAllowedSecteur(orgSecteur, secteur)) return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });

    let query = supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .eq('organization_id', ctx.organizationId)
      .eq('secteur_catalogue', secteur)
      .order('est_produit_base', { ascending: false })
      .order('nom', { ascending: true });

    if (categorie && categorie !== 'all') {
      query = query.eq('categorie', categorie);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produits: data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch catalogue' }, { status: 500 });
  }
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

    const ctx = await resolveOrgContext(supabase, user);
    const body = await request.json();
    const role = user.app_metadata?.role;
    const isGlobalProduct = body?.is_global === true && role === 'admin';
    if (!ctx && !isGlobalProduct) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGlobalProduct && ctx?.role !== 'owner' && !ctx?.permissions.manage_catalogue) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = createServiceClient();
    const { data: organization } = isGlobalProduct ? { data: null } : await service.from('organizations')
      .select('secteur').eq('id', ctx!.organizationId).single();
    const orgSecteur = organization?.secteur as Secteur;
    const secteur = body?.secteur_catalogue ?? (orgSecteur && defaultSecteur(orgSecteur));
    if (isGlobalProduct ? !isCatalogueSecteur(secteur) : !orgSecteur || (orgSecteur === 'mixte' && body?.secteur_catalogue === undefined) || !isAllowedSecteur(orgSecteur, secteur)) {
      return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
    }

    // Vérifier si l'utilisateur est admin
    // Si isAdminRequest est true et que l'utilisateur est admin, on crée un produit global (organization_id = null)
    // Sinon, on crée un produit pour l'organisation de l'utilisateur

    const { data, error } = await (isGlobalProduct ? service : supabase)
      .from('catalogues_produits')
      .insert({
        organization_id: isGlobalProduct ? null : ctx!.organizationId,
        secteur_catalogue: secteur,
        categorie: body?.categorie,
        nom: body?.nom,
        description: body?.description ?? null,
        fournisseur: body?.fournisseur ?? null,
        type_frequence: body?.type_frequence ?? 'mensuel',
        mode_fas: body?.mode_fas ?? 'fixe_par_selection',
        prix_mensuel: body?.prix_mensuel,
        remise_type: body?.remise_type ?? null,
        remise_valeur: body?.remise_valeur ?? null,
        prix_vente: body?.prix_vente,
        prix_installation: body?.prix_installation ?? null,
        engagement_mois: body?.engagement_mois ?? null,
        image_url: body?.image_url ?? null,
        caracteristiques: body?.caracteristiques ?? {},
        tags: body?.tags ?? [],
        options_produits_ids: body?.options_produits_ids ?? null,
        est_produit_base: false,
        actif: body?.actif ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produit: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
