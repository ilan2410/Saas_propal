import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClientSidebar } from '@/components/client/ClientSidebar';
import { resolveOrgContext } from '@/lib/auth/org-context';

export const revalidate = 0;

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Vérifier l'authentification
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Vérifier que ce n'est pas un admin
  const role = user.app_metadata?.role;
  if (role === 'admin') {
    redirect('/admin/dashboard');
  }

  // Résoudre le contexte organisation (propriétaire ou commercial)
  const ctx = await resolveOrgContext(supabase, user);

  if (!ctx) {
    redirect('/login');
  }

  // Récupérer les infos complètes de l'organisation (secteur, etc.)
  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', ctx.organizationId)
    .single();

  if (!organization?.secteur) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <ClientSidebar user={user} organization={organization} role={ctx.role} permissions={ctx.permissions} />
      <main className="md:ml-64 p-4 md:p-8 pt-16 md:pt-8">{children}</main>
    </div>
  );
}
