import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const appOrigin = process.env.NEXT_PUBLIC_URL || request.nextUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as 'email' | 'recovery' | 'invite' | 'magiclink' | null;
  const next = requestUrl.searchParams.get('next');

  const supabase = await createClient();
  const redirectToApp = (path: string) => NextResponse.redirect(new URL(path, appOrigin));

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.error('Erreur verifyOtp:', error);
      return redirectToApp('/login?error=invalid_token');
    }

    if (type === 'recovery') {
      return redirectToApp('/reset-password');
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Erreur exchangeCodeForSession:', error);
      return redirectToApp('/login?error=invalid_code');
    }

    if (type === 'recovery') {
      return redirectToApp('/reset-password');
    }
  } else {
    return redirectToApp('/login');
  }

  if (next?.startsWith('/')) {
    return redirectToApp(next);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToApp('/login');
  }

  const role = user.user_metadata?.role;
  if (role === 'admin') {
    return redirectToApp('/admin/dashboard');
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur, preferences')
    .eq('id', user.id)
    .single();

  if (!organization?.secteur) {
    return redirectToApp('/onboarding');
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

  const response = NextResponse.redirect(new URL(home, appOrigin));

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
