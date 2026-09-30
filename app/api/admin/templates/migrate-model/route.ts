import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '@/lib/ai/claude-models';

/**
 * Bascule en masse des templates vers un modèle Claude : aperçu (GET) puis
 * application (POST). Seule la colonne `claude_model` est modifiée : l'effort de
 * raisonnement (file_config.claude_effort) et le reste de la config sont intacts.
 * Le modèle cible doit appartenir à CLAUDE_MODELS ; par défaut, le modèle par défaut.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return null;
  return user;
}

function resolveTarget(raw: unknown): string | null {
  const target = typeof raw === 'string' && raw ? raw : DEFAULT_CLAUDE_MODEL;
  return CLAUDE_MODELS.some((model) => model.value === target) ? target : null;
}

/** Templates à basculer : modèle différent de la cible, ou non renseigné. */
const needsSwitch = (target: string) => `claude_model.is.null,claude_model.neq.${target}`;

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const target = resolveTarget(request.nextUrl.searchParams.get('target'));
  if (!target) return NextResponse.json({ error: 'Modèle inconnu' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('proposition_templates')
    .select('claude_model')
    .or(needsSwitch(target));
  if (error) {
    return NextResponse.json({ error: 'Aperçu impossible', details: error.message }, { status: 500 });
  }

  const parModele: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = row.claude_model || '(non renseigné)';
    parModele[key] = (parModele[key] ?? 0) + 1;
  }
  return NextResponse.json({ target, total: data?.length ?? 0, parModele });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { target?: unknown; confirm?: unknown };
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirmation requise' }, { status: 400 });

  const target = resolveTarget(body.target);
  if (!target) return NextResponse.json({ error: 'Modèle inconnu' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('proposition_templates')
    .update({ claude_model: target })
    .or(needsSwitch(target))
    .select('id');
  if (error) {
    return NextResponse.json({ error: 'Bascule impossible', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ target, modifies: data?.length ?? 0 });
}
