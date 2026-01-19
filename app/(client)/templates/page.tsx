import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';

function countMappedFields(fileConfig: any): number {
  if (!fileConfig || typeof fileConfig !== 'object') return 0;

  const mappedFields = new Set<string>();

  const sheetMappings = Array.isArray(fileConfig.sheetMappings)
    ? fileConfig.sheetMappings
    : [];
  for (const sheetMapping of sheetMappings) {
    const mapping = sheetMapping?.mapping;
    if (!mapping || typeof mapping !== 'object') continue;
    for (const [field, value] of Object.entries(mapping)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  const arrayMappings = Array.isArray(fileConfig.arrayMappings)
    ? fileConfig.arrayMappings
    : [];
  for (const arrayMapping of arrayMappings) {
    const columnMapping = arrayMapping?.columnMapping;
    if (!columnMapping || typeof columnMapping !== 'object') continue;
    for (const [field, value] of Object.entries(columnMapping)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        mappedFields.add(field);
      }
    }
  }

  return mappedFields.size;
}

export default async function TemplatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Récupérer tous les templates
  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-600 mt-2">
            Gérez vos templates de propositions
          </p>
        </div>
        <Link
          href="/templates/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nouveau Template
        </Link>
      </div>

      {/* Templates Grid */}
      {templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/templates/${template.id}`}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              {/* Icon */}
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    template.file_type === 'excel'
                      ? 'bg-green-100'
                      : template.file_type === 'word'
                      ? 'bg-blue-100'
                      : 'bg-red-100'
                  }`}
                >
                  <FileText
                    className={`w-6 h-6 ${
                      template.file_type === 'excel'
                        ? 'text-green-600'
                        : template.file_type === 'word'
                        ? 'text-blue-600'
                        : 'text-red-600'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {template.nom}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {template.file_type.toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Description */}
              {template.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {template.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center justify-between text-sm">
                <span
                  className={`px-2 py-1 rounded-full ${
                    template.statut === 'actif'
                      ? 'bg-green-100 text-green-800'
                      : template.statut === 'teste'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {template.statut}
                </span>
                <span className="text-gray-500">
                  {formatDate(template.created_at)}
                </span>
              </div>

              {/* Champs actifs */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">
                  {template.champs_actifs?.length || 0} champs configurés •{' '}
                  {countMappedFields(template.file_config)} mappés
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.champs_actifs?.slice(0, 3).map((field: string) => (
                    <span
                      key={field}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                    >
                      {field}
                    </span>
                  ))}
                  {template.champs_actifs && template.champs_actifs.length > 3 && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      +{template.champs_actifs.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📄</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucun template
          </h3>
          <p className="text-gray-500 mb-6">
            Créez votre premier template pour commencer à générer des propositions
          </p>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Créer un template
          </Link>
        </div>
      )}
    </div>
  );
}
