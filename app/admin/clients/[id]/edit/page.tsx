import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit } from 'lucide-react';
import { EditOrganizationFormSimple } from '@/components/admin/EditOrganizationFormSimple';

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Utiliser le client admin avec service_role_key pour bypasser les RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Récupérer l'organization
  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !org) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/admin/clients/${id}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au client
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Edit className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Modifier le client</h1>
              <p className="text-gray-600 mt-1">
                Modifiez les informations de <span className="font-medium">{org.nom}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <EditOrganizationFormSimple organization={org} />
      </div>
    </div>
  );
}
