'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, BarChart3, Settings, Package, Menu, X } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { usePathname } from 'next/navigation';

export function AdminSidebar({ user }: { user: { email?: string | null } }) {
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
          <span className="font-bold text-gray-900">Admin Panel</span>
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
        fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 overflow-y-auto z-50 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-blue-600">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Propositions SaaS</p>
        </div>

        <nav className="px-4 space-y-2">
          <Link
            href="/admin/dashboard"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname === '/admin/dashboard' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </Link>

          <Link
            href="/admin/clients"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/admin/clients') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">Clients</span>
          </Link>

          {/* Menu Catalogue avec sous-menus */}
          <div className="space-y-1">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
              pathname.startsWith('/admin/catalogue') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}>
              <Package className="w-5 h-5" />
              <span className="font-medium flex-1">Catalogue</span>
            </div>
            <div className="pl-12 space-y-1">
              <Link
                href="/admin/catalogue/telephonie"
                onClick={closeSidebar}
                className={`block px-4 py-2 text-sm rounded-lg transition-colors ${
                  pathname === '/admin/catalogue/telephonie' ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                Téléphonie
              </Link>
              <Link
                href="/admin/catalogue/tous"
                onClick={closeSidebar}
                className={`block px-4 py-2 text-sm rounded-lg transition-colors ${
                  pathname === '/admin/catalogue/tous' ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                Tous les produits
              </Link>
            </div>
          </div>

          <Link
            href="/admin/analytics"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/admin/analytics') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium">Analytics</span>
          </Link>

          <Link
            href="/admin/settings"
            onClick={closeSidebar}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              pathname.startsWith('/admin/settings') ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Paramètres</span>
          </Link>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
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
    </>
  );
}
