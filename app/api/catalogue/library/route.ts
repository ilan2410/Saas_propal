import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { canAccessSecteur, resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE } from '@/lib/auth/org-context';
import { rateLimit } from '@/lib/security/rate-limit';
import { defaultSecteur, isAllowedSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

const LIBRARY_PRODUCT_COLUMNS =
  'id, secteur_catalogue, categorie, nom, description, fournisseur, type_frequence, mode_fas, prix_mensuel, prix_vente, prix_installation, engagement_mois, image_url, caracteristiques, tags';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx || (ctx.role !== 'owner' && !ctx.permissions.manage_catalogue)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rl = rateLimit(`catalogue-library:${ctx.organizationId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }
  const service = createServiceClient();
  const { data: organization } = await service.from('organizations')
    .select('secteur').eq('id', ctx.organizationId).single();
  const orgSecteur = organization?.secteur as Secteur;
  if (!orgSecteur) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
  const secteur = new URL(request.url).searchParams.get('secteur') ?? ctx.secteur ?? defaultSecteur(orgSecteur);
  if (!isAllowedSecteur(orgSecteur, secteur)) return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
  if (!canAccessSecteur(ctx, secteur)) return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });

  const [{ data: products, error }, { data: own, error: ownError }] = await Promise.all([
    service.from('catalogues_produits').select(LIBRARY_PRODUCT_COLUMNS).is('organization_id', null).eq('actif', true)
      .eq('secteur_catalogue', secteur).order('nom', { ascending: true }),
    service.from('catalogues_produits').select('categorie, nom, fournisseur').eq('organization_id', ctx.organizationId)
      .eq('secteur_catalogue', secteur).eq('actif', true),
  ]);
  if (error || ownError) {
    console.error('Erreur chargement bibliothèque catalogue:', error ?? ownError);
    return NextResponse.json({ error: 'Impossible de charger la bibliothèque' }, { status: 500 });
  }
  return NextResponse.json({ products: products ?? [], own: own ?? [] });
}
