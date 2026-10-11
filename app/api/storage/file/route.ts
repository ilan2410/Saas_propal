import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { organizationStoragePath, storagePathFromUrl } from '@/lib/security/storage-access';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = request.nextUrl.searchParams.get('url') ?? '';
  const admin = user.app_metadata?.role === 'admin';
  const ctx = admin ? null : await resolveOrgContext(supabase, user);
  if (!admin && !ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  for (const bucket of ['templates', 'documents', 'propositions']) {
    const key = admin ? storagePathFromUrl(url, bucket) : organizationStoragePath(url, bucket, ctx!.organizationId);
    if (!key) continue;
    // The user client enforces per-proposition/template/download Storage policies.
    const client = admin ? createServiceClient() : supabase;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(key, 60);
    if (!error && data?.signedUrl) {
      const response = NextResponse.redirect(data.signedUrl);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
