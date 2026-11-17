import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/marketing/LandingPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Proboost — Vos propositions commerciales, vos modèles',
  description:
    'Préparez vos propositions en téléphonie et bureautique : import de documents clients, extraction assistée, modèles Word et Excel, suivi des dossiers et options adaptées à votre équipe.',
};

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
