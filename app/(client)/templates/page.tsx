import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, FileText, Settings, TrendingUp, CheckCircle2, Clock, Sparkles } from 'lucide-react';
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

  // Stats
  const totalTemplates = templates?.length || 0;
  const activeTemplates = templates?.filter(t => t.statut === 'actif').length || 0;
  const testTemplates = templates?.filter(t => t.statut === 'teste').length || 0;

  // Configuration des couleurs par type de fichier
  const getFileTypeConfig = (fileType: string) => {
    switch (fileType) {
      case 'excel':
        return {
          bg: 'from-emerald-500 to-emerald-600',
          lightBg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          icon: 'text-emerald-600',
          shadow: 'shadow-emerald-500/30'
        };
      case 'word':
        return {
          bg: 'from-blue-500 to-blue-600',
          lightBg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: 'text-blue-600',
          shadow: 'shadow-blue-500/30'
        };
      default:
        return {
          bg: 'from-red-500 to-red-600',
          lightBg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: 'text-red-600',
          shadow: 'shadow-red-500/30'
        };
    }
  };

  // Configuration des statuts
  const getStatusConfig = (statut: string) => {
    switch (statut) {
      case 'actif':
        return {
          icon: CheckCircle2,
          bg: 'bg-green-100',
          text: 'text-green-700',
          label: 'Actif'
        };
      case 'teste':
        return {
          icon: Clock,
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          label: 'Test'
        };
      default:
        return {
          icon: Settings,
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          label: statut
        };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Mes Templates
            </h1>
            <p className="text-gray-600 mt-2 text-lg">
              Gérez et créez vos modèles de propositions commerciales
            </p>
          </div>
          <Link
            href="/templates/new"
            className="group px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 w-fit"
          >
            <Plus className="w-5 h-5" />
            Nouveau Template
            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          </Link>
        </div>

        {/* Stats cards */}
        {totalTemplates > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-gray-600">Total</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{totalTemplates}</p>
              <p className="text-xs text-gray-500 mt-1">template{totalTemplates > 1 ? 's' : ''} créé{totalTemplates > 1 ? 's' : ''}</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/30">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-gray-600">Actifs</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{activeTemplates}</p>
              <p className="text-xs text-gray-500 mt-1">prêt{activeTemplates > 1 ? 's' : ''} à l&apos;emploi</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm font-medium text-gray-600">En test</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{testTemplates}</p>
              <p className="text-xs text-gray-500 mt-1">en validation</p>
            </div>
          </div>
        )}

        {/* Templates Grid */}
        {templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => {
              const fileConfig = getFileTypeConfig(template.file_type);
              const statusConfig = getStatusConfig(template.statut);
              const StatusIcon = statusConfig.icon;
              const mappedFieldsCount = countMappedFields(template.file_config);
              const totalFields = template.champs_actifs?.length || 0;
              const completionRate = totalFields > 0 ? (mappedFieldsCount / totalFields) * 100 : 0;

              return (
                <Link
                  key={template.id}
                  href={`/templates/${template.id}`}
                  className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Header avec icon et statut */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-14 h-14 bg-gradient-to-br ${fileConfig.bg} rounded-xl flex items-center justify-center shadow-lg ${fileConfig.shadow} group-hover:scale-110 transition-transform flex-shrink-0`}>
                        <FileText className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-lg truncate group-hover:text-blue-600 transition-colors">
                          {template.nom}
                        </h3>
                        <span className={`inline-block px-2 py-1 ${fileConfig.lightBg} ${fileConfig.text} text-xs font-semibold rounded-md uppercase tracking-wide mt-1`}>
                          {template.file_type}
                        </span>
                      </div>
                    </div>
                    
                    {/* Badge statut */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 ${statusConfig.bg} ${statusConfig.text} rounded-full text-xs font-semibold flex-shrink-0`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </div>
                  </div>

                  {/* Description */}
                  {template.description ? (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic mb-4">
                      Pas de description
                    </p>
                  )}

                  {/* Statistiques */}
                  <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 font-medium">Champs configurés</span>
                      <span className="font-bold text-gray-900">{totalFields}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 font-medium">Champs mappés</span>
                      <span className="font-bold text-gray-900">{mappedFieldsCount}</span>
                    </div>
                    
                    {/* Barre de progression */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>Complétion</span>
                        <span className="font-semibold">{Math.round(completionRate)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`bg-gradient-to-r ${fileConfig.bg} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${completionRate}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Champs actifs */}
                  {template.champs_actifs && template.champs_actifs.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Champs principaux
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {template.champs_actifs.slice(0, 3).map((field: string) => (
                          <span
                            key={field}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-200"
                          >
                            {field}
                          </span>
                        ))}
                        {template.champs_actifs.length > 3 && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md font-medium border border-gray-200">
                            +{template.champs_actifs.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {formatDate(template.created_at)}
                    </span>
                    <span className="text-sm text-blue-600 font-medium group-hover:gap-2 flex items-center gap-1 transition-all">
                      Modifier
                      <TrendingUp className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Aucun template pour le moment
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed">
                Créez votre premier template pour commencer à générer des propositions commerciales automatiquement avec l&apos;IA
              </p>
              <Link
                href="/templates/new"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Créer mon premier template
                <Sparkles className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
