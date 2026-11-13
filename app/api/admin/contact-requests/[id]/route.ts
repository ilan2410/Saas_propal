import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { CONTACT_STATUSES } from '@/lib/contact/schema';

const patchSchema = z.object({ status: z.enum(CONTACT_STATUSES) });

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.app_metadata?.role === 'admin';
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
  }

  const { error } = await serviceClient()
    .from('contact_requests')
    .update({
      status: parsed.data.status,
      handled_at: parsed.data.status === 'traite' ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) {
    console.error('Erreur mise à jour demande:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  const { error } = await serviceClient().from('contact_requests').delete().eq('id', id);
  if (error) {
    console.error('Erreur suppression demande:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
