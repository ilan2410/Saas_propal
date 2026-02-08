import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  Calendar, 
  User, 
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Package,
  Edit3,
  FileSearch,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { AccordionItem, SuggestionsPanel } from '@/components/propositions/PropositionDetailClient';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { ActionMenu } from '@/components/propositions/ActionMenu';
import { CopyButton } from '@/components/propositions/CopyButton';
import { ExportButton } from '@/components/propositions/ExportButton';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSuggestionsGenerees(
  value: unknown
): value is { suggestions: unknown[]; synthese: Record<string, unknown> } {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.suggestions)) return false;
  if (!isRecord(value.synthese)) return false;
  return true;
}

// Compte le nombre total de champs (récursivement)
function countTotalFields(data: unknown): number {
  if (data === null || data === undefined) return 0;
  if (typeof data !== 'object') return 1;
  if (Array.isArray(data)) return data.length;
  
  let count = 0;
  
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    
    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'object') {
      count += Object.keys(value as Record<string, unknown>).length;
    } else {
      count += 1;
    }
  }
  
  return count;
}

// Formate un nom de champ
function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

// Extrait le nom du document
function extractDocumentName(url: string): string {
  try {
    const filename = url.split('/').pop() || 'Document';
    const decodedFilename = decodeURIComponent(filename);
    const cleanName = decodedFilename.replace(/^\d+-/, '');
    return cleanName;
  } catch {
    return 'Document';
  }
}

// Extrait l'extension du fichier
function getFileExtension(url: string): string {
  try {
    const name = extractDocumentName(url);
    const ext = name.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  } catch {
    return 'FILE';
  }
}

// Extrait le nom du client
function getClientName(extractedData: unknown): string {
  try {
    const data: Record<string, unknown> = isRecord(extractedData) ? extractedData : {};
    
    if (isRecord(data.client)) {
      const nom = data.client.nom;
      const name = data.client.name;
      if (typeof nom === 'string' && nom) return nom;
      if (typeof name === 'string' && name) return name;
    }
    
    const clientNom = data['client.nom'];
    if (typeof clientNom === 'string' && clientNom) return clientNom;

    const clientPrenom = data['client.prenom'];
    const clientNom2 = data['client.nom'];
    if (typeof clientPrenom === 'string' && clientPrenom && typeof clientNom2 === 'string' && clientNom2) {
      return `${clientPrenom} ${clientNom2}`;
    }
    
    if (typeof data.nom_client === 'string' && data.nom_client) return data.nom_client;
    if (typeof data.client_nom === 'string' && data.client_nom) return data.client_nom;
    
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('client') && isRecord(value)) {
        const nom = value.nom;
        const name = value.name;
        if (typeof nom === 'string' && nom) return nom;
        if (typeof name === 'string' && name) return name;
      }
    }
    
    return 'Client non spécifié';
  } catch {
    return 'Client non spécifié';
  }
}

// Composant pour afficher le statut
function StatusBadge({ statut }: { statut: string }) {
  const configs = {
    draft: {
      icon: Clock,
      label: 'Brouillon',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      iconColor: 'text-amber-600'
    },
    exported: {
      icon: CheckCircle2,
      label: 'Exportée',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      iconColor: 'text-emerald-600'
    },
    error: {
      icon: XCircle,
      label: 'Erreur',
      className: 'bg-red-100 text-red-700 border-red-200',
      iconColor: 'text-red-600'
    },
    extracted: {
      icon: FileSearch,
      label: 'Données extraites',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      iconColor: 'text-blue-600'
    },
    ready: {
      icon: Zap,
      label: 'Prête à générer',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      iconColor: 'text-purple-600'
    },
    processing: {
      icon: Clock,
      label: 'En cours',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      iconColor: 'text-amber-600'
    }
  };

  const config = configs[statut as keyof typeof configs] || configs.processing;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border ${config.className}`}>
      <Icon className={`w-4 h-4 ${config.iconColor}`} />
      {config.label}
    </span>
  );
}

export default async function PropositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Récupérer la proposition avec le template
  const { data: proposition, error } = await supabase
    .from('propositions')
    .select(`
      *,
      template:proposition_templates(*)
    `)
    .eq('id', id)
    .eq('organization_id', user.id)
    .single();

  if (error || !proposition) {
    console.error('Erreur récupération proposition:', error);
    notFound();
  }

  const templateRaw = (proposition as Record<string, unknown>).template;
  const template = isRecord(templateRaw) ? templateRaw : null;
  
  const extractedDataRaw = proposition.extracted_data || proposition.donnees_extraites || {};
  const extractedDataRecord: Record<string, unknown> = isRecord(extractedDataRaw) ? extractedDataRaw : {};
  const normalizeKey = (k: string) =>
    k
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  const resumeKey = Object.keys(extractedDataRecord).find((k) => normalizeKey(k) === 'resume');
  const resume =
    resumeKey && typeof extractedDataRecord[resumeKey] === 'string'
      ? (extractedDataRecord[resumeKey] as string)
      : '';
  const extractedDataForDisplay: Record<string, unknown> =
    resumeKey
      ? Object.fromEntries(Object.entries(extractedDataRecord).filter(([k]) => normalizeKey(k) !== 'resume'))
      : extractedDataRecord;
  const clientName = getClientName(extractedDataRecord) || proposition.nom_client || 'Proposition sans nom';
  
  const documentsUrls = proposition.source_documents || proposition.documents_urls || proposition.documents_sources_urls || [];
  const totalFields = countTotalFields(extractedDataForDisplay);
  const suggestionsGenerees =
    (proposition as Record<string, unknown>).suggestions_editees ||
    (proposition as Record<string, unknown>).suggestions_generees;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      {/* Header Hero */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb */}
          <Link
            href="/propositions"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Retour aux propositions
          </Link>

          {/* Header content */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              {/* Client avatar + name */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-blue-500/30">
                  {clientName[0]?.toUpperCase() || 'C'}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {clientName}
                  </h1>
                  <div className="flex items-center gap-3 mt-2">
                    <StatusBadge statut={proposition.statut} />
                    <span className="text-sm text-gray-500 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDate(proposition.created_at, 'long')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {/* Bouton Reprendre (brouillon) */}
              {['draft', 'ready', 'extracted'].includes(proposition.statut) && (
                <Link
                  href={`/propositions/${proposition.id}/resume`}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all font-semibold shadow-lg shadow-amber-500/30 hover:scale-105"
                >
                  <Edit3 className="w-5 h-5" />
                  Reprendre
                </Link>
              )}

              {/* Bouton Générer */}
              {['ready', 'extracted'].includes(proposition.statut) && 
               !proposition.duplicated_template_url && 
               !proposition.fichier_genere_url && (
                <GenerateButton propositionId={proposition.id} variant="primary" />
              )}
              
              {/* Bouton Télécharger */}
              {(proposition.duplicated_template_url || proposition.fichier_genere_url) && (
                <a
                  href={proposition.duplicated_template_url || proposition.fichier_genere_url}
                  download
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all font-semibold shadow-lg shadow-emerald-500/30 hover:scale-105"
                >
                  <Download className="w-5 h-5" />
                  Télécharger
                </a>
              )}

              {/* Menu actions */}
              <ActionMenu propositionId={proposition.id} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Client */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl group-hover:scale-110 transition-transform">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Client</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">
              {clientName}
            </p>
          </div>

          {/* Template */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Template</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">
              {typeof template?.nom === 'string' ? template.nom : 'N/A'}
            </p>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl group-hover:scale-110 transition-transform">
                <Package className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Documents</h3>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {documentsUrls.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">fichier(s) source</p>
          </div>

          {/* Champs extraits */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl group-hover:scale-110 transition-transform">
                <FileSearch className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Données</h3>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {totalFields}
            </p>
            <p className="text-xs text-gray-500 mt-1">champs extraits</p>
          </div>
        </div>

        {/* Timeline / Progress (si statut en cours) */}
        {proposition.statut === 'processing' && (
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 animate-spin" />
              <h3 className="text-lg font-bold">Génération en cours...</h3>
            </div>
            <div className="w-full bg-blue-400/30 rounded-full h-2">
              <div className="bg-white h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
            <p className="text-sm text-blue-100 mt-3">
              Votre proposition est en cours de création. Cela peut prendre quelques instants.
            </p>
          </div>
        )}

        {/* Documents sources */}
        {documentsUrls.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Documents sources
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {documentsUrls.length} fichier(s) utilisé(s) pour l&apos;extraction
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documentsUrls.map((url: string, index: number) => {
                  const fileName = extractDocumentName(url);
                  const fileExt = getFileExtension(url);
                  
                  return (
                    <a
                      key={index}
                      href={url}
                      download
                      className="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-300"
                    >
                      {/* File icon with extension */}
                      <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex flex-col items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                        <FileText className="w-6 h-6 mb-0.5" />
                        <span className="text-[9px] font-bold">{fileExt}</span>
                      </div>
                      
                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {fileName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Document source #{index + 1}
                        </p>
                      </div>
                      
                      {/* Download icon */}
                      <Download className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!!resume.trim() && (
          <details className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Résumé</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Synthèse automatique basée sur les documents sources
                      </p>
                    </div>
                  </div>

                  <ChevronDown className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180" />
                </div>
              </div>
            </summary>

            <div className="p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                {resume}
              </pre>
            </div>
          </details>
        )}

        {hasSuggestionsGenerees(suggestionsGenerees) && (
          <details className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Sparkles className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Suggestions IA</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Comparatif calculé à partir des données de la proposition
                      </p>
                    </div>
                  </div>

                  <ChevronDown className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180" />
                </div>
              </div>
            </summary>

            <div className="p-6">
              <SuggestionsPanel
                propositionId={proposition.id}
                clientName={clientName}
                suggestions={suggestionsGenerees}
                embedded
              />
            </div>
          </details>
        )}

        {/* Données extraites */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <FileSearch className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Données extraites
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {totalFields} champ(s) détecté(s) par l&apos;IA
                  </p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                <CopyButton data={extractedDataRecord} />
                <ExportButton data={extractedDataRecord} filename={`donnees-${clientName.toLowerCase().replace(/\s+/g, '-')}`} />
              </div>
            </div>
          </div>

          <div className="p-6">
            {extractedDataForDisplay && Object.keys(extractedDataForDisplay).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(extractedDataForDisplay).map(([key, value]) => (
                  <AccordionItem key={key} title={formatFieldName(key)}>
                    {Array.isArray(value) ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md font-semibold">
                            {value.length} élément{value.length > 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {value.map((item, idx) => (
                            <div key={idx} className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border border-gray-200">
                              {typeof item === 'object' && item !== null ? (
                                <div className="space-y-2">
                                  {Object.entries(item)
                                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                    .map(([k, v]) => (
                                      <div key={k} className="flex items-start gap-3">
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[120px]">
                                          {formatFieldName(k)}
                                        </span>
                                        <span className="text-sm text-gray-900 font-medium flex-1">
                                          {String(v)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-900 font-medium">{String(item)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : typeof value === 'object' && value !== null ? (
                      <div className="space-y-3">
                        {Object.entries(value)
                          .filter(([, v]) => v !== null && v !== undefined)
                          .map(([k, v]) => (
                            <div key={k} className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border border-gray-200">
                              <div className="flex items-start gap-3">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[120px]">
                                  {formatFieldName(k)}
                                </span>
                                {typeof v === 'object' ? (
                                  Array.isArray(v) ? (
                                    <div className="flex-1">
                                      <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md font-semibold text-xs inline-block mb-2">
                                        {v.length} élément{v.length > 1 ? 's' : ''}
                                      </div>
                                      {v.length > 0 && (
                                        <div className="space-y-2 mt-2">
                                          {v.map((item, idx) => (
                                            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                                              {typeof item === 'object' && item !== null ? (
                                                <div className="space-y-1">
                                                  {Object.entries(item)
                                                    .filter(([, iv]) => iv !== null && iv !== undefined && iv !== '')
                                                    .map(([ik, iv]) => (
                                                      <div key={ik} className="flex items-start gap-2 text-xs">
                                                        <span className="text-gray-500 font-medium">{formatFieldName(ik)}:</span>
                                                        <span className="text-gray-900">{String(iv)}</span>
                                                      </div>
                                                    ))}
                                                </div>
                                              ) : (
                                                <span className="text-xs text-gray-900">{String(item)}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex-1">
                                      <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md font-semibold text-xs inline-block mb-2">
                                        {Object.keys(v).length} propriété{Object.keys(v).length > 1 ? 's' : ''}
                                      </div>
                                      <div className="space-y-1 mt-2">
                                        {Object.entries(v)
                                          .filter(([, iv]) => iv !== null && iv !== undefined && iv !== '')
                                          .map(([ik, iv]) => (
                                            <div key={ik} className="flex items-start gap-2 text-xs">
                                              <span className="text-gray-500 font-medium">{formatFieldName(ik)}:</span>
                                              <span className="text-gray-900">{String(iv)}</span>
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-sm text-gray-900 font-medium flex-1">{String(v)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-4 border border-gray-200">
                        <p className="text-sm text-gray-900 font-medium">
                          {value !== null && value !== undefined ? String(value) : '-'}
                        </p>
                      </div>
                    )}
                  </AccordionItem>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileSearch className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Aucune donnée extraite
                </h3>
                <p className="text-gray-500 text-sm">
                  Les données n&apos;ont pas encore été extraites des documents sources
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
