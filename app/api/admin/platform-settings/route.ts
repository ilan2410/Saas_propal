import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const ALLOWED_KEYS = new Set(['tarif_par_proposition_defaut']);

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabaseAdmin = createServiceClient();
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('key,value,updated_at')
      .order('key', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Erreur lecture paramètres', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, settings: data || [] });
  } catch (error) {
    console.error('Error reading platform settings:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
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

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const key = body?.key;
    const value = body?.value;

    if (!key || typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: 'Clé invalide' }, { status: 400 });
    }

    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'Valeur manquante' }, { status: 400 });
    }

    const supabaseAdmin = createServiceClient();
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select('key,value,updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Erreur mise à jour', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, setting: data });
  } catch (error) {
    console.error('Error updating platform settings:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
