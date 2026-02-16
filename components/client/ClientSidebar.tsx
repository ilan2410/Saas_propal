'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Zap, CreditCard, Settings, Package, Menu, X, ChartBar } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { CreditsDisplay } from '@/components/shared/CreditsDisplay';

interface ClientSidebarProps {
  user: {
    email?: string | null;
  };
  organization: {
    id: string;
    nom: string;
    credits: number;
    tarif_par_proposition: number;
  };
}

export function ClientSidebar({ user, organization }: ClientSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* Mobile Header & Toggle */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between md:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="font-bold text-gray-900 truncate max-w-[200px]">{organization.nom}</span>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-64 bg-[var(--background)] border-r border-gray-200 overflow-y-auto z-50 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-blue-600">Propositions</h1>
          <p className="text-sm text-gray-500 mt-1 truncate" title={organization.nom}>{organization.nom}</p>
        </div>

        <nav className="px-4 space-y-2">
          <Link
            href="/dashboard"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname === '/dashboard' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            href="/templates"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/templates') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium">Templates</span>
          </Link>

          <Link
            href="/propositions"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/propositions') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Zap className="w-5 h-5" />
            <span className="font-medium">Propositions</span>
          </Link>

          <Link
            href="/catalogue"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/catalogue') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="font-medium">Catalogue</span>
          </Link>

          <Link
            href="/credits"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/credits') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span className="font-medium">Crédits</span>
          </Link>
          
          <Link
            href="/analytics"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/analytics') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <ChartBar className="w-5 h-5" />
            <span className="font-medium">Analytics</span>
          </Link>

          <Link
            href="/settings"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/settings') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Paramètres</span>
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-[var(--background)]">
          {/* Solde crédits */}
          <CreditsDisplay 
            organizationId={organization.id}
            initialCredits={organization.credits || 0}
            tarifParProposition={organization.tarif_par_proposition || 0}
          />

          {/* Profil */}
          <div className="flex items-center gap-3 mb-3 mt-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-blue-600 font-semibold">
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={user.email || ''}>{user.email}</p>
              <p className="text-xs text-gray-500">Client</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
