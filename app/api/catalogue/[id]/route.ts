import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { isAllowedSecteur, isCatalogueSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    const { id } = await params;
    const body = await request.json();
    const { is_global, organization_id: _organizationId, ...updates } = body ?? {};
    const isGlobalProduct = is_global === true && user.app_metadata?.role === 'admin';
    if (!ctx && !isGlobalProduct) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGlobalProduct && ctx?.role !== 'owner' && !ctx?.permissions.manage_catalogue) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (updates.secteur_catalogue !== undefined) {
      const { data: organization } = isGlobalProduct ? { data: null } : await createServiceClient().from('organizations')
        .select('secteur').eq('id', ctx!.organizationId).single();
      if (isGlobalProduct ? !isCatalogueSecteur(updates.secteur_catalogue) : !organization || !isAllowedSecteur(organization.secteur as Secteur, updates.secteur_catalogue)) {
        return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
      }
    }

    // Vérifier si l'utilisateur est admin
    // Si is_global est true et que l'utilisateur est admin, on modifie un produit global (organization_id = null)
    // Sinon, on modifie un produit pour l'organisation de l'utilisateur

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    let query = (isGlobalProduct ? createServiceClient() : supabase)
      .from('catalogues_produits')
      .update(updates)
      .eq('id', id);

    if (isGlobalProduct) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', ctx!.organizationId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ produit: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    const { id } = await params;
    const body = await request.json().catch(() => ({})); // Body optionnel
    const isGlobalProduct = body?.is_global === true && user.app_metadata?.role === 'admin';
    if (!ctx && !isGlobalProduct) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGlobalProduct && ctx?.role !== 'owner' && !ctx?.permissions.manage_catalogue) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Vérifier si l'utilisateur est admin
    // Si is_global est true et que l'utilisateur est admin, on supprime un produit global (organization_id = null)
    // Sinon, on supprime un produit pour l'organisation de l'utilisateur

    let query = (isGlobalProduct ? createServiceClient() : supabase)
      .from('catalogues_produits')
      .delete()
      .eq('id', id);

    if (isGlobalProduct) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', ctx!.organizationId);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
