import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LayoutDashboard, FileText, Zap, CreditCard, Settings, Package } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { CreditsDisplay } from '@/components/shared/CreditsDisplay';

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
  const role = user.user_metadata?.role;
  if (role === 'admin') {
    redirect('/admin/dashboard');
  }

  // Récupérer les infos de l'organisation
  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!organization?.secteur) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[var(--background)] border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-blue-600">Propositions</h1>
          <p className="text-sm text-gray-500 mt-1">{organization?.nom}</p>
        </div>

        <nav className="px-4 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <LayoutDashboard className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            href="/templates"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <FileText className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Templates</span>
          </Link>

          <Link
            href="/propositions"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Zap className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Propositions</span>
          </Link>

          <Link
            href="/catalogue"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Package className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Catalogue</span>
          </Link>

          <Link
            href="/credits"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <CreditCard className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Crédits</span>
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Paramètres</span>
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          {/* Solde crédits */}
          <CreditsDisplay 
            organizationId={organization.id}
            initialCredits={organization.credits || 0}
            tarifParProposition={organization.tarif_par_proposition || 0}
          />

          {/* Profil */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-semibold">
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <p className="text-xs text-gray-500">Client</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 p-8">{children}</main>
    </div>
  );
}
