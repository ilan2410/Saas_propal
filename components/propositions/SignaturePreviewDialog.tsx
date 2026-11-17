'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { WordViewerFrame } from './PropositionAttachments';

export interface PreviewDocument {
  /** 'main' pour la proposition, sinon l'id de l'annexe. */
  key: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propositionId: string;
  spVariantId?: string | null;
  documents: PreviewDocument[];
}

interface PreviewEntry {
  url: string;
  placement: string | null;
  /** Date d'expiration du lien signé (ms). */
  expiresAt: number;
}

/**
 * Aperçu des fichiers Word exacts qui partiront en signature (même génération que
 * l'envoi), avec le même rendu que les pièces jointes (Google Docs Viewer).
 */
export function SignaturePreviewDialog({ open, onOpenChange, propositionId, spVariantId, documents }: Props) {
  const [active, setActive] = useState('main');
  const [entry, setEntry] = useState<PreviewEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Liens déjà générés pendant cette ouverture (réutilisés tant qu'ils sont valides).
  const cacheRef = useRef(new Map<string, PreviewEntry>());

  useEffect(() => {
    if (open) {
      cacheRef.current.clear();
      setActive('main');
    }
  }, [open, spVariantId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    const cached = cacheRef.current.get(active);
    // Marge d'une minute : Google doit encore pouvoir télécharger le fichier.
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      setEntry(cached);
      return;
    }

    setEntry(null);
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ document: active, ...(spVariantId ? { variant: spVariantId } : {}) });
        const res = await fetch(`/api/propositions/${propositionId}/signature/preview?${params}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data?.url !== 'string') throw new Error(typeof data?.error === 'string' ? data.error : 'Aperçu impossible');
        const next: PreviewEntry = {
          url: data.url,
          placement: typeof data.placement === 'string' ? data.placement : null,
          expiresAt: Date.now() + Number(data.expires_in ?? 300) * 1000,
        };
        cacheRef.current.set(active, next);
        if (!cancelled) setEntry(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Aperçu impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, active, propositionId, spVariantId]);

  const activeLabel = documents.find((d) => d.key === active)?.label ?? 'Document';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Aperçu avant envoi</DialogTitle>
          <DialogDescription>
            Documents Word tels qu’ils partiront en signature. La zone de signature est indiquée par « [ Signature du client ] », les paraphes par « [ Paraphe ] ».
          </DialogDescription>
        </DialogHeader>

        {documents.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Documents envoyés">
            {documents.map((doc) => (
              <button
                key={doc.key}
                type="button"
                role="tab"
                aria-selected={active === doc.key}
                onClick={() => setActive(doc.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active === doc.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                <FileText className="h-3.5 w-3.5" /> {doc.label}
              </button>
            ))}
          </div>
        )}

        {active === 'main' && entry?.placement === 'auto_block' && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Le modèle ne contient pas la variable {'{{signature_client}}'} : un bloc « Bon pour accord » a été ajouté en fin de document.
          </p>
        )}

        <div className="h-[70vh]">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Génération de l’aperçu…
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-rose-700">{error}</p>
          ) : entry ? (
            <WordViewerFrame key={entry.url} url={entry.url} title={activeLabel} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
