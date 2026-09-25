'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, File, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatFileSize } from '@/lib/utils/formatting';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type PropositionAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

const WORD_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type PreviewKind = 'image' | 'pdf' | 'word' | 'excel' | 'unsupported';

function previewKind(mimeType: string): PreviewKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (WORD_MIME_TYPES.has(mimeType)) return 'word';
  if (EXCEL_MIME_TYPES.has(mimeType)) return 'excel';
  return 'unsupported';
}

function AttachmentPreviewBody({ attachment, url }: { attachment: PropositionAttachment; url: string }) {
  const kind = previewKind(attachment.mimeType);
  if (kind === 'image') {
    return <img src={url} alt={attachment.originalName} className="mx-auto h-full max-h-full w-auto object-contain" />;
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={attachment.originalName} className="h-full w-full rounded-md border border-slate-200" />;
  }
  if (kind === 'word') {
    const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    return (
      <div className="flex h-full flex-col gap-2">
        <iframe src={viewerUrl} title={attachment.originalName} className="min-h-0 w-full flex-1 rounded-md border border-slate-200" />
        <p className="shrink-0 text-xs text-slate-500">
          Aperçu généré par Google Docs Viewer : le document est transmis à Google pour l’affichage.
        </p>
      </div>
    );
  }
  if (kind === 'excel') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
        <File className="h-8 w-8 text-slate-400" />
        <p>Aperçu non disponible pour les fichiers Excel.</p>
        <a
          href={url}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Télécharger le fichier
        </a>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Aperçu non disponible pour ce type de fichier.
    </div>
  );
}

function AttachmentManager({ propositionId, onCountChange }: { propositionId: string; onCountChange?: (count: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PropositionAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PropositionAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/attachments`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chargement impossible');
      const next = Array.isArray(data.attachments) ? data.attachments : [];
      setAttachments(next);
      onCountChange?.(next.length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [onCountChange, propositionId]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).slice(0, 10).forEach((file) => form.append('files', file));
      const response = await fetch(`/api/propositions/${propositionId}/attachments`, { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || 'Envoi impossible');
      const added = Array.isArray(data.attachments) ? data.attachments : [];
      setAttachments((previous) => {
        const next = [...added, ...previous];
        onCountChange?.(next.length);
        return next;
      });
      toast.success(`${added.length} pièce${added.length > 1 ? 's' : ''} jointe${added.length > 1 ? 's' : ''} ajoutée${added.length > 1 ? 's' : ''}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi impossible');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openPreview = async (attachment: PropositionAttachment) => {
    setPreviewAttachment(attachment);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/attachments/${attachment.id}/preview`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || 'Aperçu impossible');
      setPreviewUrl(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Aperçu impossible');
      setPreviewAttachment(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const remove = async (attachment: PropositionAttachment) => {
    if (!window.confirm(`Supprimer « ${attachment.originalName} » ?`)) return;
    setDeleting(attachment.id);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/attachments/${attachment.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || 'Suppression impossible');
      setAttachments((previous) => {
        const next = previous.filter((item) => item.id !== attachment.id);
        onCountChange?.(next.length);
        return next;
      });
      toast.success('Pièce jointe supprimée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:opacity-60">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Envoi en cours…' : 'Ajouter des fichiers'}
      </button>
      <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => void upload(event.target.files)} className="hidden" />
      <p className="text-xs text-slate-500">PDF, images, Word ou Excel · 50 Mo par fichier · 100 Mo et 10 fichiers par envoi</p>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : attachments.length === 0 ? (
        <div className="rounded-lg border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Aucune pièce jointe</div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100"><File className="h-4 w-4 text-slate-500" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{attachment.originalName}</p>
                <p className="text-xs text-slate-500">{formatFileSize(attachment.sizeBytes)} · {formatDate(attachment.createdAt)}</p>
              </div>
              <button type="button" onClick={() => void openPreview(attachment)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Aperçu de ${attachment.originalName}`}><Eye className="h-4 w-4" /></button>
              <a href={`/api/propositions/${propositionId}/attachments/${attachment.id}/download`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Télécharger ${attachment.originalName}`}><Download className="h-4 w-4" /></a>
              <button type="button" onClick={() => void remove(attachment)} disabled={deleting === attachment.id} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label={`Supprimer ${attachment.originalName}`}>
                {deleting === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={!!previewAttachment}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewAttachment(null);
            setPreviewUrl(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-slate-900">{previewAttachment?.originalName}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {previewLoading ? (
              <div className="flex h-full min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : previewAttachment && previewUrl ? (
              <div className="h-[70vh]"><AttachmentPreviewBody attachment={previewAttachment} url={previewUrl} /></div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PropositionAttachmentsDialog({ propositionId, open, onOpenChange, onCountChange }: { propositionId: string; open: boolean; onOpenChange: (open: boolean) => void; onCountChange?: (count: number) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-200 bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900"><Paperclip className="h-5 w-5" />Pièces jointes</DialogTitle>
          <DialogDescription>Factures, contrats signés et autres documents liés à cette proposition.</DialogDescription>
        </DialogHeader>
        {open && <AttachmentManager propositionId={propositionId} onCountChange={onCountChange} />}
      </DialogContent>
    </Dialog>
  );
}

export function PropositionAttachmentsPanel({ propositionId, onCountChange }: { propositionId: string; onCountChange?: (count: number) => void }) {
  return <AttachmentManager propositionId={propositionId} onCountChange={onCountChange} />;
}
