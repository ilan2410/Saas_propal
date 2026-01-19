import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const supabase = await createClient();
  await supabase.auth.exchangeCodeForSession(code);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const role = user.user_metadata?.role;
  if (role === 'admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur')
    .eq('id', user.id)
    .single();

  if (!organization?.secteur) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
