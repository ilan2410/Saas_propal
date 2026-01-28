'use client';

import { useMemo, useState, useRef, DragEvent } from 'react';
import { Upload, X, FileText, Loader2, CheckCircle2, ArrowRight, ArrowLeft, Cloud, File, AlertCircle, Image } from 'lucide-react';
import { PropositionData } from './PropositionWizard';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Step2UploadDocuments({
  propositionData,
  updatePropositionData,
  onNext,
  onPrev,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadedUrls = useMemo(() => {
    return Array.isArray(propositionData.documents_urls)
      ? propositionData.documents_urls
      : [];
  }, [propositionData.documents_urls]);

  const persistSourceDocuments = (urls: string[]) => {
    if (!propositionData.proposition_id) return;
    fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_documents: urls,
        current_step: 2,
        statut: 'draft',
      }),
    }).catch(() => {});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    // Types supportés : PDF et Images uniquement
    const supportedTypes = [
      'application/pdf', // PDF
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp' // Images
    ];
    
    const validFiles = newFiles.filter(file => {
      const maxSize = 30 * 1024 * 1024; // 30 MB (limite Claude.ai)
      const isSupported = supportedTypes.includes(file.type);
      
      return isSupported && file.size <= maxSize;
    });

    if (validFiles.length < newFiles.length) {
      alert('Certains fichiers ont été ignorés.\nFormats acceptés : PDF, JPG, PNG, GIF, WebP (max 30 MB)');
    }

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeUploadedUrl = (index: number) => {
    const nextUrls = uploadedUrls.filter((_, i) => i !== index);
    updatePropositionData({ documents_urls: nextUrls });
    persistSourceDocuments(nextUrls);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      if (uploadedUrls.length > 0) {
        if (propositionData.proposition_id) {
          fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_step: 3, statut: 'draft' }),
          }).catch(() => {});
        }
        onNext();
        return;
      }

      alert('Veuillez ajouter au moins un document');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      // L'API backend enverra directement les fichiers à Claude (PDF et images supportés nativement)
      const response = await fetch('/api/propositions/upload-documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erreur upload');

      const result = await response.json();

      updatePropositionData({
        documents_urls: [...uploadedUrls, ...(result.urls || [])],
      });

      persistSourceDocuments([...uploadedUrls, ...(result.urls || [])]);

      if (propositionData.proposition_id) {
        fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: 3, statut: 'draft' }),
        }).catch(() => {});
      }

      onNext();
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload des documents');
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    const type = file.type;
    
    // Images
    if (type.startsWith('image/')) {
      const ext = type.split('/')[1].toUpperCase();
      return { 
        icon: Image, 
        color: 'from-pink-500 to-pink-600', 
        bg: 'bg-pink-50', 
        text: 'text-pink-700',
        label: ext === 'JPEG' ? 'JPG' : ext
      };
    }
    
    // PDF
    if (type === 'application/pdf') {
      return { 
        icon: FileText, 
        color: 'from-red-500 to-red-600', 
        bg: 'bg-red-50', 
        text: 'text-red-700',
        label: 'PDF'
      };
    }
    
    // Fallback
    return { 
      icon: File, 
      color: 'from-gray-500 to-gray-600', 
      bg: 'bg-gray-50', 
      text: 'text-gray-700',
      label: 'FILE'
    };
  };

  const getUploadedFileIcon = (url: string) => {
    const name = getFileNameFromUrl(url);
    const lower = name.toLowerCase();

    if (lower.endsWith('.pdf')) {
      return {
        icon: FileText,
        color: 'from-red-500 to-red-600',
        bg: 'bg-red-50',
        text: 'text-red-700',
        label: 'PDF',
      };
    }

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const foundExt = imageExts.find((ext) => lower.endsWith(ext));
    if (foundExt) {
      const extLabel = foundExt === '.jpeg' ? 'JPG' : foundExt.replace('.', '').toUpperCase();
      return {
        icon: Image,
        color: 'from-pink-500 to-pink-600',
        bg: 'bg-pink-50',
        text: 'text-pink-700',
        label: extLabel,
      };
    }

    return {
      icon: File,
      color: 'from-gray-500 to-gray-600',
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      label: 'FILE',
    };
  };

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  const canContinue = files.length > 0 || uploadedUrls.length > 0;

  const getFileNameFromUrl = (url: string) => {
    try {
      const withoutQuery = url.split('?')[0] || url;
      const parts = withoutQuery.split('/');
      const last = parts[parts.length - 1] || 'Document';
      return decodeURIComponent(last);
    } catch {
      return 'Document';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-purple-500/30">
          <Cloud className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Upload des documents
        </h2>
        <p className="text-gray-600 text-lg">
          {"Importez vos documents sources pour l'extraction automatique des données"}
        </p>
      </div>

      {/* Upload Zone avec Drag & Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ${
          isDragging
            ? 'border-purple-500 bg-purple-50 scale-105'
            : 'border-gray-300 bg-gradient-to-br from-gray-50 to-white hover:border-gray-400'
        }`}
      >
        <div className="text-center">
          {/* Icon animé */}
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 transition-all duration-300 ${
            isDragging 
              ? 'bg-gradient-to-br from-purple-500 to-purple-600 scale-110' 
              : 'bg-gradient-to-br from-gray-100 to-gray-200'
          }`}>
            <Upload className={`w-10 h-10 transition-all duration-300 ${
              isDragging ? 'text-white animate-bounce' : 'text-gray-400'
            }`} />
          </div>

          {/* Texte */}
          <div className="mb-6">
            <p className="text-lg font-semibold text-gray-900 mb-2">
              {isDragging ? 'Déposez vos fichiers ici' : 'Glissez-déposez vos fichiers'}
            </p>
            <p className="text-gray-500">
              ou cliquez pour parcourir
            </p>
          </div>

          {/* Bouton */}
          <label
            htmlFor="file-upload"
            className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-semibold shadow-lg shadow-purple-500/30 hover:scale-105"
          >
            <Upload className="w-5 h-5" />
            Parcourir les fichiers
          </label>
          <input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
            multiple
            onChange={handleFileChange}
          />

          {/* Formats acceptés */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-6 flex-wrap max-w-2xl mx-auto">
              {/* PDF */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center relative shadow-sm">
                  <span className="text-sm font-bold text-red-600">PDF</span>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-700 font-semibold">Documents PDF</span>
              </div>
              
              {/* JPG */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center relative shadow-sm">
                  <span className="text-sm font-bold text-pink-600">JPG</span>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-700 font-semibold">Photos JPEG</span>
              </div>
              
              {/* PNG */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center relative shadow-sm">
                  <span className="text-sm font-bold text-blue-600">PNG</span>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-700 font-semibold">Images PNG</span>
              </div>
              
              {/* GIF */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center relative shadow-sm">
                  <span className="text-sm font-bold text-purple-600">GIF</span>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-700 font-semibold">Images GIF</span>
              </div>
              
              {/* WebP */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center relative shadow-sm">
                  <span className="text-[11px] font-bold text-indigo-600">WebP</span>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-700 font-semibold">Images WebP</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-6 font-medium">
              📸 Vous pouvez photographier vos documents avec votre téléphone !
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Taille maximale : 30 MB par fichier
            </p>
          </div>
        </div>
      </div>

      {/* Liste des fichiers */}
      {uploadedUrls.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              Documents déjà uploadés
            </h3>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold">
                {uploadedUrls.length} fichier{uploadedUrls.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {uploadedUrls.map((url, index) => {
              const fileConfig = getUploadedFileIcon(url);
              const Icon = fileConfig.icon;

              return (
              <div
                key={`${url}-${index}`}
                className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-300"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${fileConfig.color} rounded-xl flex flex-col items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6 text-white mb-0.5" />
                  <span className="text-[9px] font-bold text-white">{fileConfig.label}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                    {getFileNameFromUrl(url)}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 ${fileConfig.bg} ${fileConfig.text} text-xs font-semibold rounded-md uppercase`}>
                      {fileConfig.label}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => removeUploadedUrl(index)}
                  disabled={isUploading}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Retirer ce document"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              Fichiers prêts à uploader
            </h3>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold">
                {files.length} fichier{files.length > 1 ? 's' : ''}
              </span>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                {totalSizeMB} MB
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {files.map((file, index) => {
              const fileConfig = getFileIcon(file);
              const Icon = fileConfig.icon;

              return (
                <div
                  key={index}
                  className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-300"
                >
                  {/* Icon du fichier */}
                  <div className={`w-14 h-14 bg-gradient-to-br ${fileConfig.color} rounded-xl flex flex-col items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white mb-0.5" />
                    <span className="text-[9px] font-bold text-white">{fileConfig.label}</span>
                  </div>

                  {/* Info du fichier */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 ${fileConfig.bg} ${fileConfig.text} text-xs font-semibold rounded-md uppercase`}>
                        {fileConfig.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>

                  {/* Bouton supprimer */}
                  <button
                    onClick={() => removeFile(index)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                    title="Retirer ce fichier"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conseils */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-lg mb-3">
              Conseils pour une extraction optimale
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">📄</span>
                <span><strong>PDFs</strong> : Format idéal - Claude analyse texte, images, graphiques et tableaux</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">📸</span>
                <span><strong>Photos</strong> : Prenez des photos claires de vos factures ou contrats - Claude les comprend parfaitement !</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">💡</span>
                <span>Assurez-vous que les documents sont bien éclairés et lisibles</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">✨</span>
                <span>{"L'IA Claude extraira automatiquement toutes les informations pertinentes"}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-8 border-t-2 border-gray-200">
        <button
          onClick={onPrev}
          disabled={isUploading}
          className="group px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Précédent
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Étape 2 sur 3
          </span>
          <button
            onClick={handleUpload}
            disabled={!canContinue || isUploading}
            className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-semibold text-lg shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-3 hover:scale-105 active:scale-95"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Upload en cours...
              </>
            ) : (
              <>
                Continuer
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
