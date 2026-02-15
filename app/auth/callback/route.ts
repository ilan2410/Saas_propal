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
    .select('secteur, preferences')
    .eq('id', user.id)
    .single();

  if (!organization?.secteur) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  const allowedHomePages = new Set(['/dashboard', '/templates', '/propositions']);
  const preferences =
    organization.preferences && typeof organization.preferences === 'object'
      ? (organization.preferences as Record<string, unknown>)
      : {};

  const home =
    typeof preferences.page_accueil === 'string' && allowedHomePages.has(preferences.page_accueil)
      ? preferences.page_accueil
      : '/dashboard';

  const response = NextResponse.redirect(new URL(home, request.url));

  if (typeof preferences.theme === 'string') {
    response.cookies.set('appearance_theme', preferences.theme, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (typeof preferences.densite === 'string') {
    response.cookies.set('appearance_density', preferences.densite, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  response.cookies.set('appearance_home', home, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
