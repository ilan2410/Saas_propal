import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_PROPOSITION_COLUMNS,
  parsePropositionColumns,
} from '@/lib/propositions/list-preferences';

const PREFERENCE_KEY = 'propositions.visible_columns';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('user_ui_preferences')
    .select('value')
    .eq('user_id', user.id)
    .eq('preference_key', PREFERENCE_KEY)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const value = data?.value as Record<string, unknown> | undefined;
  return NextResponse.json({
    columns: value ? parsePropositionColumns(value.columns) : DEFAULT_PROPOSITION_COLUMNS,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.columns)) {
    return NextResponse.json({ error: 'Colonnes invalides' }, { status: 400 });
  }
  const columns = parsePropositionColumns(body.columns);
  const { error } = await supabase.from('user_ui_preferences').upsert({
    user_id: user.id,
    preference_key: PREFERENCE_KEY,
    value: { columns },
  }, { onConflict: 'user_id,preference_key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ columns });
}
