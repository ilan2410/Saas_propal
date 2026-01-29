import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, is_global } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    // Vérifier si l'utilisateur est admin
    const role = user.user_metadata?.role;
    const isGlobalOperation = is_global === true && role === 'admin';

    let query = supabase
      .from('catalogues_produits')
      .delete()
      .in('id', ids);

    if (isGlobalOperation) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', user.id);
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

    const body = await request.json();
    const { ids, updates, is_global } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Vérifier si l'utilisateur est admin
    const role = user.user_metadata?.role;
    const isGlobalOperation = is_global === true && role === 'admin';

    let query = supabase
      .from('catalogues_produits')
      .update(updates)
      .in('id', ids);

    if (isGlobalOperation) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', user.id);
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
