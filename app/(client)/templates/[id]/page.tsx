import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  FileText, 
  File, 
  Calendar, 
  CheckCircle, 
  Clock
} from 'lucide-react';
import { TemplateActions } from '@/components/templates/TemplateActions';

export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Récupérer le template
  const { data: template, error } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !template) {
    redirect('/templates');
  }

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'excel':
        return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
      case 'word':
        return <FileText className="w-8 h-8 text-blue-600" />;
      case 'pdf':
        return <File className="w-8 h-8 text-red-600" />;
      default:
        return <File className="w-8 h-8 text-gray-600" />;
    }
  };

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'actif':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-4 h-4" />
            Actif
          </span>
        );
      case 'teste':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            <CheckCircle className="w-4 h-4" />
            Testé
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-4 h-4" />
            Brouillon
          </span>
        );
    }
  };

  const champsActifs = template.champs_actifs || [];
  const fileConfig = template.file_config || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/templates"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{template.nom}</h1>
            {template.description && (
              <p className="text-gray-600 mt-1">{template.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(template.statut)}
        </div>
      </div>

      {/* Actions rapides */}
      <TemplateActions
        templateId={template.id}
        templateName={template.nom}
        fileUrl={template.file_url}
        currentStatus={template.statut}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informations principales */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fichier template */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Fichier template
            </h2>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              {getFileIcon(template.file_type)}
              <div className="flex-1">
                <p className="font-medium text-gray-900">{template.file_name}</p>
                <p className="text-sm text-gray-500">
                  {template.file_type?.toUpperCase()} • {template.file_size_mb ? `${template.file_size_mb.toFixed(2)} MB` : 'Taille inconnue'}
                </p>
              </div>
            </div>
          </div>

          {/* Champs actifs */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Champs à extraire ({champsActifs.length})
            </h2>
            {champsActifs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {champsActifs.map((champ: string) => (
                  <span
                    key={champ}
                    className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                  >
                    {champ}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Aucun champ configuré</p>
            )}
          </div>

          {/* Configuration du mapping */}
          {fileConfig.sheetMappings && fileConfig.sheetMappings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Configuration du mapping
              </h2>
              <div className="space-y-4">
                {fileConfig.sheetMappings.map((sheetMapping: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-2">
                      Feuille : {sheetMapping.sheetName}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(sheetMapping.mapping || {}).map(([field, cell]) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-gray-600">{field}:</span>
                          <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                            {Array.isArray(cell) ? cell.join(', ') : cell}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapping des tableaux */}
          {fileConfig.arrayMappings && fileConfig.arrayMappings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Tableaux configurés
              </h2>
              <div className="space-y-4">
                {fileConfig.arrayMappings.map((arrayMapping: any, idx: number) => (
                  <div key={idx} className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                    <h3 className="font-medium text-purple-900 mb-2">
                      {arrayMapping.arrayId}
                    </h3>
                    <p className="text-sm text-purple-700 mb-2">
                      Feuille "{arrayMapping.sheetName}" • Ligne de départ: {arrayMapping.startRow}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(arrayMapping.columnMapping || {}).map(([field, col]) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-purple-600">{field}:</span>
                          <span className="font-mono bg-white px-2 py-0.5 rounded border border-purple-200">
                            Colonne {col as string}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Métadonnées */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Informations
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Créé le</dt>
                <dd className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {new Date(template.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Dernière modification</dt>
                <dd className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {new Date(template.updated_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Type de fichier</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {template.file_type?.toUpperCase()}
                </dd>
              </div>
              {template.file_name && (
                <div>
                  <dt className="text-sm text-gray-500">Fichier</dt>
                  <dd className="text-sm font-medium text-gray-900 truncate" title={template.file_name}>
                    {template.file_name}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-gray-500">Statut</dt>
                <dd className="mt-1">{getStatusBadge(template.statut)}</dd>
              </div>
            </dl>
          </div>

          {/* Résultat du test */}
          {template.test_result && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-6">
              <h2 className="text-lg font-semibold text-green-900 mb-4">
                Dernier test
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-green-700">Champs extraits</dt>
                  <dd className="font-medium text-green-900">
                    {template.test_result.fieldsExtracted}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">Confiance</dt>
                  <dd className="font-medium text-green-900">
                    {template.test_result.confidence}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-green-700">Tokens utilisés</dt>
                  <dd className="font-medium text-green-900">
                    {template.test_result.tokensUsed}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Statistiques d'utilisation */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Utilisation
            </h2>
            <p className="text-sm text-gray-500">
              Les statistiques d'utilisation seront disponibles après la création de propositions avec ce template.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
