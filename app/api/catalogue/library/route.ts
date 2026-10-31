import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { defaultSecteur, isAllowedSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx || (ctx.role !== 'owner' && !ctx.permissions.manage_catalogue)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data: organization } = await service.from('organizations')
    .select('secteur').eq('id', ctx.organizationId).single();
  const orgSecteur = organization?.secteur as Secteur;
  if (!orgSecteur) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
  const secteur = new URL(request.url).searchParams.get('secteur') ?? defaultSecteur(orgSecteur);
  if (!isAllowedSecteur(orgSecteur, secteur)) return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });

  const [{ data: products, error }, { data: own, error: ownError }] = await Promise.all([
    service.from('catalogues_produits').select('*').is('organization_id', null).eq('actif', true)
      .eq('secteur_catalogue', secteur).order('nom', { ascending: true }),
    service.from('catalogues_produits').select('categorie, nom, fournisseur').eq('organization_id', ctx.organizationId)
      .eq('secteur_catalogue', secteur).eq('actif', true),
  ]);
  if (error || ownError) return NextResponse.json({ error: error?.message ?? ownError?.message }, { status: 500 });
  return NextResponse.json({ products: products ?? [], own: own ?? [] });
}
