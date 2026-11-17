import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE, type OrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery, propositionSecteurBlocked } from '@/lib/propositions/visibility';
import { findValueInData, isPlainObject } from '@/lib/generators/data-utils';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface SignatureAccess {
  supabase: Supabase;
  userId: string;
  ctx: OrgContext;
  proposition: Record<string, unknown> & { id: string; template_id: string; statut_commercial?: string | null };
  canSend: boolean;
}

/**
 * Authentifie l'utilisateur et vérifie qu'il voit la proposition (mêmes règles
 * que la génération : organisation, visibilité commerciale, secteur).
 */
export async function resolveSignatureAccess(propositionId: string, columns = '*'): Promise<SignatureAccess | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await propositionSecteurBlocked(ctx, propositionId)) return NextResponse.json({ error: SECTEUR_FORBIDDEN_MESSAGE }, { status: 403 });

  const { data: proposition } = await scopePropositionsQuery(
    supabase.from('propositions').select(columns).eq('id', propositionId),
    ctx,
  ).maybeSingle();
  if (!proposition) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });

  return {
    supabase,
    userId: user.id,
    ctx,
    proposition: proposition as unknown as SignatureAccess['proposition'],
    canSend: ctx.role === 'owner' || ctx.permissions.send_signature,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Signataire proposé par défaut : le contact client extrait de la proposition. */
export function suggestedSigner(proposition: Record<string, unknown>): { name: string; email: string } {
  const extracted = isPlainObject(proposition.extracted_data) ? proposition.extracted_data : {};
  const filled = isPlainObject(proposition.filled_data) ? proposition.filled_data : {};
  const data = { ...extracted, ...filled };
  const email = text(findValueInData(data, 'contact_email'));
  const name = [text(findValueInData(data, 'contact_prenom')), text(findValueInData(data, 'contact_nom'))].filter(Boolean).join(' ');
  return {
    name: name || text(proposition.nom_client),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
  };
}
