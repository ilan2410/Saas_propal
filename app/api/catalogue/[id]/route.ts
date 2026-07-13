import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { id } = await params;
    const body = await request.json();
    const { is_global, ...updates } = body ?? {};

    // Vérifier si l'utilisateur est admin
    const role = user.app_metadata?.role;
    // Si is_global est true et que l'utilisateur est admin, on modifie un produit global (organization_id = null)
    // Sinon, on modifie un produit pour l'organisation de l'utilisateur
    const isGlobalProduct = is_global === true && role === 'admin';

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    let query = supabase
      .from('catalogues_produits')
      .update(updates)
      .eq('id', id);

    if (isGlobalProduct) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', user.id);
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

    const { id } = await params;
    const body = await request.json().catch(() => ({})); // Body optionnel

    // Vérifier si l'utilisateur est admin
    const role = user.app_metadata?.role;
    // Si is_global est true et que l'utilisateur est admin, on supprime un produit global (organization_id = null)
    // Sinon, on supprime un produit pour l'organisation de l'utilisateur
    const isGlobalProduct = body?.is_global === true && role === 'admin';

    let query = supabase
      .from('catalogues_produits')
      .delete()
      .eq('id', id);

    if (isGlobalProduct) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', user.id);
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
