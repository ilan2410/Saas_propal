import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { AdminTemplateForm } from '@/components/admin/AdminTemplateForm';

export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
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

  const secteur = org.secteur || 'telephonie';
  const { data: promptDefault } = await supabase
    .from('prompt_defaults')
    .select('prompt_template')
    .eq('secteur', secteur)
    .single();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/admin/clients/${id}/templates`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux templates
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <FileText className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Nouveau Template</h1>
              <p className="text-gray-600 mt-1">
                Créez un template pour <span className="font-medium">{org.nom}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <AdminTemplateForm 
          organizationId={id} 
          organizationName={org.nom}
          secteur={secteur}
          initialPromptTemplate={promptDefault?.prompt_template}
        />
      </div>
    </div>
  );
}
