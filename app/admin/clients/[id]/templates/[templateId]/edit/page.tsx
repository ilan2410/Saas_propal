import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Settings } from 'lucide-react';
import { AdminTemplateForm } from '@/components/admin/AdminTemplateForm';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Récupérer l'organization
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  // Récupérer le template
  const { data: template, error } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('id', templateId)
    .eq('organization_id', id)
    .single();

  if (error || !template || !org) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/admin/clients/${id}/templates/${templateId}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au template
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Settings className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Configurer le template</h1>
              <p className="text-gray-600 mt-1">
                Modifiez <span className="font-medium">{template.nom}</span> pour{' '}
                <span className="font-medium">{org.nom}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Note de synchronisation */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <div className="text-green-600 text-xl">🔄</div>
            <div>
              <h3 className="font-medium text-green-900">Synchronisation automatique</h3>
              <p className="text-sm text-green-700 mt-1">
                Les modifications seront immédiatement visibles par le client.
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <AdminTemplateForm 
          organizationId={id}
          organizationName={org.nom}
          secteur={org.secteur}
          template={template}
          isEditing={true}
        />
      </div>
    </div>
  );
}
