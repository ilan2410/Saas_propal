import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  FileText, 
  File, 
  Calendar, 
  CheckCircle2, 
  Clock,
  Settings,
  Layers,
  Package,
  TrendingUp,
  Zap,
  FileSearch,
  Grid3x3
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
        return { icon: FileSpreadsheet, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-700' };
      case 'word':
        return { icon: FileText, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-700' };
      case 'pdf':
        return { icon: File, gradient: 'from-red-500 to-red-600', bg: 'bg-red-50', text: 'text-red-700' };
      default:
        return { icon: File, gradient: 'from-gray-500 to-gray-600', bg: 'bg-gray-50', text: 'text-gray-700' };
    }
  };

  const getStatusConfig = (statut: string) => {
    switch (statut) {
      case 'actif':
        return {
          icon: CheckCircle2,
          label: 'Actif',
          gradient: 'from-green-500 to-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700'
        };
      case 'teste':
        return {
          icon: Zap,
          label: 'Testé',
          gradient: 'from-blue-500 to-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700'
        };
      default:
        return {
          icon: Clock,
          label: 'Brouillon',
          gradient: 'from-amber-500 to-amber-600',
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-700'
        };
    }
  };

  const champsActifs = template.champs_actifs || [];
  const fileConfig = template.file_config || {};
  const fileIconConfig = getFileIcon(template.file_type);
  const FileIcon = fileIconConfig.icon;
  const statusConfig = getStatusConfig(template.statut);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <Link
                href="/templates"
                className="p-3 hover:bg-gray-100 rounded-xl transition-colors group"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 group-hover:-translate-x-1 transition-transform" />
              </Link>
              
              {/* Icon et titre */}
              <div className="flex items-start gap-4 flex-1">
                <div className={`w-16 h-16 bg-gradient-to-br ${fileIconConfig.gradient} rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <FileIcon className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{template.nom}</h1>
                  {template.description ? (
                    <p className="text-gray-600 leading-relaxed">{template.description}</p>
                  ) : (
                    <p className="text-gray-400 italic">Pas de description</p>
                  )}
                  
                  {/* Meta info */}
                  <div className="flex items-center gap-4 mt-4">
                    <div className={`flex items-center gap-2 px-4 py-2 ${statusConfig.bg} ${statusConfig.border} border rounded-xl`}>
                      <div className={`w-8 h-8 bg-gradient-to-br ${statusConfig.gradient} rounded-lg flex items-center justify-center shadow-lg`}>
                        <StatusIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold text-sm ${statusConfig.text}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <span className={`px-3 py-1.5 ${fileIconConfig.bg} ${fileIconConfig.text} rounded-lg text-sm font-semibold uppercase tracking-wide`}>
                      {template.file_type}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <TemplateActions
          templateId={template.id}
          templateName={template.nom}
          fileUrl={template.file_url}
          currentStatus={template.statut}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne principale */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fichier template */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center shadow-lg">
                  <File className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Fichier template
                </h2>
              </div>
              
              <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:shadow-md transition-all">
                <div className={`w-14 h-14 bg-gradient-to-br ${fileIconConfig.gradient} rounded-xl flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <FileIcon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{template.file_name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {template.file_type?.toUpperCase()} • {template.file_size_mb ? `${template.file_size_mb.toFixed(2)} MB` : 'Taille inconnue'}
                  </p>
                </div>
              </div>
            </div>

            {/* Champs actifs */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                    <FileSearch className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Champs à extraire
                  </h2>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                  {champsActifs.length} champs
                </span>
              </div>
              
              {champsActifs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {champsActifs.map((champ: string) => (
                    <span
                      key={champ}
                      className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-xl text-sm font-medium border border-blue-200 hover:shadow-md transition-all"
                    >
                      {champ}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FileSearch className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500">Aucun champ configuré</p>
                </div>
              )}
            </div>

            {/* Configuration du mapping */}
            {fileConfig.sheetMappings && fileConfig.sheetMappings.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Grid3x3 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Configuration du mapping
                  </h2>
                </div>
                
                <div className="space-y-4">
                  {fileConfig.sheetMappings.map((sheetMapping: Record<string, unknown>, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all bg-gradient-to-r from-gray-50 to-white">
                      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-600" />
                        Feuille : {String(sheetMapping.sheetName ?? '')}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(
                          sheetMapping.mapping && typeof sheetMapping.mapping === 'object' && !Array.isArray(sheetMapping.mapping)
                            ? (sheetMapping.mapping as Record<string, unknown>)
                            : {}
                        ).map(([field, cell]) => (
                          <div key={field} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                            <span className="text-sm text-gray-600 font-medium">{field}:</span>
                            <span className="font-mono text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-md border border-blue-200 font-semibold">
                              {Array.isArray(cell) ? cell.join(', ') : String(cell)}
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
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Tableaux configurés
                  </h2>
                </div>
                
                <div className="space-y-4">
                  {fileConfig.arrayMappings.map((arrayMapping: Record<string, unknown>, idx: number) => (
                    <div key={idx} className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 hover:shadow-lg transition-all">
                      <h3 className="font-bold text-purple-900 text-lg mb-3 flex items-center gap-2">
                        <Grid3x3 className="w-5 h-5" />
                        {String(arrayMapping.arrayId ?? '')}
                      </h3>
                      <div className="flex items-center gap-4 mb-4">
                        <span className="px-3 py-1 bg-white text-purple-700 rounded-lg text-sm font-medium border border-purple-200">
                          📄 Feuille: {String(arrayMapping.sheetName ?? '')}
                        </span>
                        <span className="px-3 py-1 bg-white text-purple-700 rounded-lg text-sm font-medium border border-purple-200">
                          📍 Ligne: {String(arrayMapping.startRow ?? '')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(
                          arrayMapping.columnMapping &&
                            typeof arrayMapping.columnMapping === 'object' &&
                            !Array.isArray(arrayMapping.columnMapping)
                            ? (arrayMapping.columnMapping as Record<string, unknown>)
                            : {}
                        ).map(([field, col]) => (
                          <div key={field} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-purple-200">
                            <span className="text-sm text-purple-700 font-medium">{field}:</span>
                            <span className="font-mono text-sm bg-purple-100 text-purple-800 px-3 py-1 rounded-md border border-purple-300 font-semibold">
                              Colonne {String(col)}
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
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center shadow-lg">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Informations
                </h2>
              </div>
              
              <dl className="space-y-4">
                <div className="pb-4 border-b border-gray-100">
                  <dt className="text-sm font-medium text-gray-500 mb-2">Créé le</dt>
                  <dd className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    {new Date(template.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
                
                <div className="pb-4 border-b border-gray-100">
                  <dt className="text-sm font-medium text-gray-500 mb-2">Dernière modification</dt>
                  <dd className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    {new Date(template.updated_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
                
                <div className="pb-4 border-b border-gray-100">
                  <dt className="text-sm font-medium text-gray-500 mb-2">Type de fichier</dt>
                  <dd className={`inline-flex items-center gap-2 px-3 py-1.5 ${fileIconConfig.bg} ${fileIconConfig.text} rounded-lg text-sm font-bold uppercase`}>
                    <FileIcon className="w-4 h-4" />
                    {template.file_type}
                  </dd>
                </div>
                
                {template.file_name && (
                  <div className="pb-4 border-b border-gray-100">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Fichier</dt>
                    <dd className="text-sm font-semibold text-gray-900 truncate" title={template.file_name}>
                      {template.file_name}
                    </dd>
                  </div>
                )}
                
                <div>
                  <dt className="text-sm font-medium text-gray-500 mb-3">Statut</dt>
                  <dd>
                    <div className={`flex items-center gap-2 px-4 py-3 ${statusConfig.bg} ${statusConfig.border} border rounded-xl`}>
                      <div className={`w-8 h-8 bg-gradient-to-br ${statusConfig.gradient} rounded-lg flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <StatusIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold ${statusConfig.text}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Résultat du test */}
            {template.test_result && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-green-900">
                    Dernier test
                  </h2>
                </div>
                
                <dl className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200">
                    <dt className="text-sm font-medium text-green-700">Champs extraits</dt>
                    <dd className="text-lg font-bold text-green-900">
                      {template.test_result.fieldsExtracted}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200">
                    <dt className="text-sm font-medium text-green-700">Confiance</dt>
                    <dd className="text-lg font-bold text-green-900">
                      {template.test_result.confidence}%
                    </dd>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white rounded-lg border border-green-200">
                    <dt className="text-sm font-medium text-green-700">Tokens utilisés</dt>
                    <dd className="text-lg font-bold text-green-900">
                      {template.test_result.tokensUsed}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Statistiques d'utilisation */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Utilisation
                </h2>
              </div>
              
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Les statistiques seront disponibles après la création de propositions avec ce template
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
