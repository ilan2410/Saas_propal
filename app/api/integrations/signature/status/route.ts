import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { isSignatureAvailable, loadDocusealSettings } from '@/lib/docuseal/settings';

export const dynamic = 'force-dynamic';

// GET — disponibilité de la signature électronique pour l'utilisateur courant.
// Aucune donnée sensible : sert uniquement à afficher ou non le bouton.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await loadDocusealSettings(ctx.organizationId);
    const enabled = isSignatureAvailable(settings);
    return NextResponse.json({
      enabled,
      available: enabled && (ctx.role === 'owner' || ctx.permissions.send_signature),
    });
  } catch (error) {
    console.error('Statut signature', error);
    return NextResponse.json({ enabled: false, available: false });
  }
}
