import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Users, BarChart3, Settings } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';

export default async function AdminLayout({
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

  // Vérifier le rôle admin
  const role = user.user_metadata?.role;
  if (role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-blue-600">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Propositions SaaS</p>
        </div>

        <nav className="px-4 space-y-2">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <LayoutDashboard className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            href="/admin/clients"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Users className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Clients</span>
          </Link>

          <Link
            href="/admin/analytics"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <BarChart3 className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Analytics</span>
          </Link>

          <Link
            href="/admin/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Paramètres</span>
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-semibold">
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <p className="text-xs text-gray-500">Administrateur</p>
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
