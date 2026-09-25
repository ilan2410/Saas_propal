'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, File, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
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

function AttachmentManager({ propositionId, onCountChange }: { propositionId: string; onCountChange?: (count: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PropositionAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
              <a href={`/api/propositions/${propositionId}/attachments/${attachment.id}/download`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Télécharger ${attachment.originalName}`}><Download className="h-4 w-4" /></a>
              <button type="button" onClick={() => void remove(attachment)} disabled={deleting === attachment.id} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label={`Supprimer ${attachment.originalName}`}>
                {deleting === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
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
