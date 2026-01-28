import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, FileText, Settings, Download } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';

export default async function TemplateDetailPage({
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div>
          <Link
            href={`/admin/clients/${id}/templates`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux templates
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <FileText className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{template.nom}</h1>
                <p className="text-gray-600 mt-1">
                  Template de <span className="font-medium">{org.nom}</span>
                </p>
              </div>
            </div>
            <Link
              href={`/admin/clients/${id}/templates/${templateId}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Modifier
            </Link>
          </div>
        </div>

        {/* Informations générales */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Informations générales</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <dt className="text-sm text-gray-600">Type de fichier</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {template.type_fichier?.toUpperCase() || 'EXCEL'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Créé le</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {formatDate(template.created_at, 'long')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Modifié le</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {formatDate(template.updated_at, 'long')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Fichier template</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {template.file_url ? (
                  <div className="space-y-1">
                    <p className="text-gray-900">
                      {(() => {
                        // Utiliser file_name si disponible, sinon extraire depuis l'URL
                        if (template.file_name) {
                          // Retirer le timestamp du début (format: 1234567890123-nom_fichier.ext)
                          return template.file_name.replace(/^\d+-/, '');
                        }
                        // Extraire le nom depuis l'URL
                        const urlParts = template.file_url.split('/');
                        const fullName = urlParts[urlParts.length - 1];
                        // Retirer le timestamp du début
                        return decodeURIComponent(fullName.replace(/^\d+-/, ''));
                      })()}
                    </p>
                    <a
                      href={template.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                    >
                      <Download className="w-3 h-3" />
                      Télécharger
                    </a>
                  </div>
                ) : (
                  <span className="text-gray-400">Non configuré</span>
                )}
              </dd>
            </div>
          </div>
        </div>

        {/* Configuration IA */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Configuration IA</h2>
          <div className="space-y-4">
            <div>
              <dt className="text-sm text-gray-600">Modèle Claude</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {template.claude_model || org.claude_model || 'claude-3-7-sonnet-20250219'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Prompt personnalisé</dt>
              <dd className="mt-1">
                {template.prompt_template ? (
                  <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                    {template.prompt_template.substring(0, 500)}
                    {template.prompt_template.length > 500 && '...'}
                  </pre>
                ) : (
                  <span className="text-sm text-gray-400">Utilise le prompt par défaut</span>
                )}
              </dd>
            </div>
          </div>
        </div>

        {/* Champs à extraire */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Champs à extraire ({template.champs_actifs?.length || 0})
            </h2>
            <Link
              href={`/admin/clients/${id}/templates/${templateId}/edit`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <Settings className="w-4 h-4" />
              Configurer
            </Link>
          </div>
          {template.champs_actifs && template.champs_actifs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {template.champs_actifs.map((field: string) => (
                <span
                  key={field}
                  className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800"
                >
                  {field}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">
              Aucun champ configuré. Cliquez sur &quot;Configurer&quot; pour ajouter des champs.
            </p>
          )}
        </div>

        {/* Mapping colonnes */}
        {template.column_mapping && Object.keys(template.column_mapping).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Mapping des colonnes ({Object.keys(template.column_mapping).length})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(template.column_mapping).map(([field, column]) => (
                <div key={field} className="bg-gray-50 rounded-lg p-3">
                  <dt className="text-xs text-gray-500">{field}</dt>
                  <dd className="text-sm font-medium text-gray-900 mt-1">
                    Colonne {String(column)}
                  </dd>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note de synchronisation */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="text-green-600 text-xl">🔄</div>
            <div>
              <h3 className="font-medium text-green-900">Synchronisation automatique</h3>
              <p className="text-sm text-green-700 mt-1">
                Les modifications effectuées ici sont automatiquement visibles par le client.
                De même, les modifications faites par le client sont visibles ici.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
