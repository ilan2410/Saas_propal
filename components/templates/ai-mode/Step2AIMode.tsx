'use client';

import { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageSelector } from './PageSelector';
import { AIAnalysisResult } from './AIAnalysisResult';
import { Step3AIReview } from './Step3AIReview';
import type { AIAnalysis } from './types';
import type { Secteur } from '@/lib/ai/fields-catalog';
import type { TemplateData } from '../TemplateWizard';

type SubStep = 'upload' | 'page-selection' | 'analyzing' | 'review' | 'final';

interface Props {
  templateData: Partial<TemplateData>;
  updateTemplateData: (data: Partial<TemplateData>) => void;
  secteur: Secteur;
  onPrev?: () => void;
  onComplete: () => Promise<void> | void;
  initialAnalysis?: AIAnalysis | null;
}

export function Step2AIMode({
  templateData,
  updateTemplateData,
  secteur,
  onPrev,
  onComplete,
  initialAnalysis,
}: Props) {
  const [subStep, setSubStep] = useState<SubStep>(
    initialAnalysis ? 'review' : templateData.file_url ? 'page-selection' : 'upload'
  );
  const [fileUrl, setFileUrl] = useState<string>(templateData.file_url || '');
  const [fileName, setFileName] = useState<string>(templateData.file_name || '');
  const [tempId, setTempId] = useState<string>(
    (templateData.id as string) || String(Date.now())
  );
  const [pageImageUrls, setPageImageUrls] = useState<string[]>(
    initialAnalysis?.pageImageUrls || []
  );
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(initialAnalysis || null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Si on arrive en édition avec initialAnalysis + pageImageUrls, réutilise
  useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      setPageImageUrls(initialAnalysis.pageImageUrls || []);
    }
  }, [initialAnalysis]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Seuls les fichiers .docx sont acceptés');
      return;
    }
    setIsUploading(true);
    try {
      // Upload du .docx
      const form = new FormData();
      form.append('file', file);
      const upResp = await fetch('/api/templates/upload', { method: 'POST', body: form });
      if (!upResp.ok) throw new Error('Échec de l’upload');
      const { url } = await upResp.json();

      setFileUrl(url);
      setFileName(file.name);
      updateTemplateData({
        file_url: url,
        file_name: file.name,
        file_type: 'word',
        file_size_mb: Math.round((file.size / 1024 / 1024) * 100) / 100,
      });

      // Render des pages
      setIsRendering(true);
      const renderResp = await fetch('/api/templates/ai/render-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: url, tempId }),
      });
      if (!renderResp.ok) {
        const err = await renderResp.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Échec du rendu des pages');
      }
      const renderJson = await renderResp.json();
      setPageImageUrls(renderJson.pageImageUrls || []);
      setTempId(renderJson.tempId || tempId);
      setSubStep('page-selection');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsUploading(false);
      setIsRendering(false);
    }
  };

  const handleAnalyze = async (selectedPages: number[]) => {
    setIsAnalyzing(true);
    setSubStep('analyzing');
    try {
      const resp = await fetch('/api/templates/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl,
          pageImageUrls,
          selectedPages,
          secteur,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Échec de l’analyse');
      }
      const data = await resp.json();
      setAnalysis(data.analysis as AIAnalysis);
      setSubStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
      setSubStep('page-selection');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplied = async (payload: {
    fileUrl: string;
    fileConfig: Record<string, unknown>;
    champsActifs: string[];
    aiAnalysis: AIAnalysis;
  }) => {
    updateTemplateData({
      file_url: payload.fileUrl,
      file_config: payload.fileConfig,
      champs_actifs: payload.champsActifs,
      ai_analysis: payload.aiAnalysis,
      creation_mode: 'ai',
    });
    await onComplete();
  };

  // ----------------------------------------
  // Render
  // ----------------------------------------
  if (subStep === 'upload') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Mode IA — Upload du template</h2>
          <p className="text-sm text-gray-600">
            Dépose ton .docx et laisse l&apos;IA détecter automatiquement les variables.
          </p>
        </div>
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition">
          <Upload className="w-10 h-10 text-gray-400" />
          <span className="text-sm text-gray-700 font-medium">
            Clique pour choisir un fichier .docx
          </span>
          <input
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {(isUploading || isRendering) && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {isRendering ? 'Rendu des pages…' : 'Upload…'}
            </div>
          )}
        </label>
        {onPrev && (
          <div>
            <button onClick={onPrev} className="text-sm text-gray-600 hover:underline">
              ← Retour
            </button>
          </div>
        )}
      </div>
    );
  }

  if (subStep === 'page-selection') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Mode IA — Sélection des pages</h2>
          <p className="text-sm text-gray-600">Fichier : {fileName}</p>
        </div>
        <PageSelector
          pageImageUrls={pageImageUrls}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
        />
      </div>
    );
  }

  if (subStep === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-lg font-medium">L&apos;IA analyse votre template…</p>
        <p className="text-sm text-gray-500">Cela peut prendre 30 à 60 secondes.</p>
      </div>
    );
  }

  if (subStep === 'review' && analysis) {
    return (
      <AIAnalysisResult
        analysis={analysis}
        setAnalysis={setAnalysis}
        secteur={secteur}
        onValidate={() => setSubStep('final')}
        onPrev={() => setSubStep('page-selection')}
      />
    );
  }

  if (subStep === 'final' && analysis) {
    return (
      <Step3AIReview
        analysis={analysis}
        setAnalysis={setAnalysis}
        fileUrl={fileUrl}
        templateName={templateData.nom || 'template'}
        tempId={tempId}
        onPrev={() => setSubStep('review')}
        onApplied={handleApplied}
      />
    );
  }

  return null;
}
