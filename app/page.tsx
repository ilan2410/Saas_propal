import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/marketing/LandingPage';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

  const role = user.app_metadata?.role;
  if (role === 'admin') {
    redirect('/admin/dashboard');
  }

  const cookieStore = await cookies();
  const home = cookieStore.get('appearance_home')?.value;
  const allowedHomePages = new Set(['/dashboard', '/templates', '/propositions']);

  if (home && allowedHomePages.has(home)) {
    redirect(home);
  }

  redirect('/dashboard');
}
