import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import type { ReactNode } from 'react';

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="w-[200px]" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : {updatedAt}</p>

        <div className="space-y-4 text-gray-700 leading-relaxed">{children}</div>

        <div className="mt-10 pt-6 border-t border-gray-200">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-700">
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    </div>
  );
}
