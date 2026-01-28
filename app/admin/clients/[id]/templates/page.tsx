import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft, Plus, FileText, Eye, Settings } from 'lucide-react';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/utils/formatting';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function countMappedFields(fileConfig: unknown): number {
  if (!isRecord(fileConfig)) return 0;

  const mappedFields = new Set<string>();

  const sheetMappings = Array.isArray(fileConfig.sheetMappings) ? fileConfig.sheetMappings : [];
  for (const sheetMapping of sheetMappings) {
    const mappingRaw = isRecord(sheetMapping) ? sheetMapping.mapping : null;
    if (!isRecord(mappingRaw)) continue;
    for (const [field, value] of Object.entries(mappingRaw)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  const arrayMappings = Array.isArray(fileConfig.arrayMappings) ? fileConfig.arrayMappings : [];
  for (const arrayMapping of arrayMappings) {
    const columnMappingRaw = isRecord(arrayMapping) ? arrayMapping.columnMapping : null;
    if (!isRecord(columnMappingRaw)) continue;
    for (const [field, value] of Object.entries(columnMappingRaw)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  return mappedFields.size;
}

export default async function ClientTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const supabase = createServiceClient();

  // Récupérer l'organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (orgError || !org) {
    notFound();
  }

  // Récupérer les templates
  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', id)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/admin/clients/${id}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au client
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Templates de {org.nom}</h1>
              <p className="text-gray-600 mt-2">
                Gérez les templates et leur configuration IA
              </p>
            </div>
            <Link
              href={`/admin/clients/${id}/templates/new`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouveau template
            </Link>
          </div>
        </div>

        {/* Liste des templates */}
        {templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <FileText className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{template.nom}</h3>
                      <p className="text-sm text-gray-500">
                        {template.type_fichier?.toUpperCase() || 'EXCEL'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Champs configurés</span>
                    <span className="font-medium text-gray-900">
                      {template.champs_actifs?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Champs mappés</span>
                    <span className="font-medium text-gray-900">
                      {countMappedFields(template.file_config)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Créé le</span>
                    <span className="font-medium text-gray-900">
                      {formatDate(template.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Modifié le</span>
                    <span className="font-medium text-gray-900">
                      {formatDate(template.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/admin/clients/${id}/templates/${template.id}`}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Voir
                  </Link>
                  <Link
                    href={`/admin/clients/${id}/templates/${template.id}/edit`}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Configurer
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun template</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Créez un template pour configurer l&apos;extraction IA pour ce client
            </p>
            <Link
              href={`/admin/clients/${id}/templates/new`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Créer un template
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
