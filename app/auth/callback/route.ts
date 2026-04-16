import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as 'email' | 'recovery' | 'invite' | 'magiclink' | null;
  const next = requestUrl.searchParams.get('next');

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.error('Erreur verifyOtp:', error);
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Erreur exchangeCodeForSession:', error);
      return NextResponse.redirect(new URL('/login?error=invalid_code', request.url));
    }
  } else {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (next) {
    return NextResponse.redirect(new URL(next, request.url));
  }

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
