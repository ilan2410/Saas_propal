import { OrganizationFormSimple } from '@/components/admin/OrganizationFormSimple';
import { createServiceClient } from '@/lib/supabase/server';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0;

export default async function NewClientPage() {
  const supabase = createServiceClient();
  const { data: settingsRows } = await supabase
    .from('platform_settings')
    .select('key,value')
    .eq('key', 'tarif_par_proposition_defaut')
    .limit(1);

  const tarifDefaut = settingsRows?.[0]
    ? Number(settingsRows[0].value)
    : 5.0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux clients
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Nouveau Client</h1>
              <p className="text-gray-600 mt-1">
                Créez un nouveau compte client pour la plateforme
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <OrganizationFormSimple defaultTarif={tarifDefaut} />
      </div>
    </div>
  );
}
