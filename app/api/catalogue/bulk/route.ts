import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { isAllowedSecteur, isCatalogueSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export async function DELETE(request: NextRequest) {
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
    const { ids, is_global } = body;
    const isGlobalOperation = is_global === true && user.app_metadata?.role === 'admin';
    if (!ctx && !isGlobalOperation) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGlobalOperation && ctx?.role !== 'owner' && !ctx?.permissions.manage_catalogue) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }


    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    // Vérifier si l'utilisateur est admin

    let query = (isGlobalOperation ? createServiceClient() : supabase)
      .from('catalogues_produits')
      .delete()
      .in('id', ids);

    if (isGlobalOperation) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', ctx!.organizationId);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete products', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    const { ids, updates, is_global } = body;
    const isGlobalOperation = is_global === true && user.app_metadata?.role === 'admin';
    if (!ctx && !isGlobalOperation) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isGlobalOperation && ctx?.role !== 'owner' && !ctx?.permissions.manage_catalogue) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { is_global: _ignored, organization_id: _org, ...sanitizedUpdates } = updates ?? {};
    if (sanitizedUpdates.secteur_catalogue !== undefined) {
      const { data: organization } = isGlobalOperation ? { data: null } : await createServiceClient().from('organizations')
        .select('secteur').eq('id', ctx!.organizationId).single();
      if (isGlobalOperation ? !isCatalogueSecteur(sanitizedUpdates.secteur_catalogue) : !organization || !isAllowedSecteur(organization.secteur as Secteur, sanitizedUpdates.secteur_catalogue)) {
        return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
      }
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    if (!sanitizedUpdates || Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Vérifier si l'utilisateur est admin

    let query = (isGlobalOperation ? createServiceClient() : supabase)
      .from('catalogues_produits')
      .update(sanitizedUpdates)
      .in('id', ids);

    if (isGlobalOperation) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', ctx!.organizationId);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update products', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
