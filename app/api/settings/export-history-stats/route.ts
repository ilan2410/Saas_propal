import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseAndValidateRange(searchParams: URLSearchParams): { startIso: string; endIso: string } | null {
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  if (!startParam || !endParam) return null;
  const start = new Date(startParam);
  const end = new Date(endParam);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() >= end.getTime()) {
    return null;
  }
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = parseAndValidateRange(searchParams);
  if (!range) {
    return NextResponse.json({ error: 'Paramètres de période invalides' }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  const [propsRes, propsArchiveRes, txRes] = await Promise.all([
    serviceSupabase
      .from('propositions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.id)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
    serviceSupabase
      .from('propositions_archive')
      .select('proposition_id', { count: 'exact', head: true })
      .eq('organization_id', user.id)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
    serviceSupabase
      .from('stripe_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.id)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
  ]);

  if (propsRes.error || propsArchiveRes.error || txRes.error) {
    return NextResponse.json({ error: 'Erreur lors de la récupération des compteurs' }, { status: 500 });
  }

  const propositionsCount = (propsRes.count || 0) + (propsArchiveRes.count || 0);
  const transactionsCount = txRes.count || 0;

  return NextResponse.json({
    propositionsCount,
    transactionsCount,
    start: range.startIso,
    end: range.endIso,
  });
}
