import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WordConfig } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

const SP_STANDARD_VARIABLES = [
  'sp_economie_mensuelle', 'sp_economie_annuelle', 'sp_total_actuel', 'sp_total_propose',
  'sp_ameliorations', 'sp_fournisseur_propose', 'sp_nb_lignes', 'sp_est_economie',
  'sp_adresse_facturation', 'sp_adresse_facturation_rue', 'sp_adresse_facturation_cp',
  'sp_adresse_facturation_ville', 'sp_adresse_livraison', 'sp_adresse_livraison_rue',
  'sp_adresse_livraison_cp', 'sp_adresse_livraison_ville', 'sp_livraison_identique',
];

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('file_config')
    .eq('id', id)
    .single();

  const cfg = (template?.file_config ?? {}) as WordConfig;
  const custom = cfg.spVariablesCustom ?? [];

  return NextResponse.json({ standard: SP_STANDARD_VARIABLES, custom });
}
