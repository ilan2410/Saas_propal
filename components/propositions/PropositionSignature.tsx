'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Download, Eye, FileCheck2, Loader2, PenLine, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SignaturePreviewDialog } from './SignaturePreviewDialog';

type SignatureStatus = 'sending' | 'sent' | 'opened' | 'completed' | 'declined' | 'expired' | 'cancelled' | 'error';

interface SignatureItem {
  id: string;
  document_name: string;
  variant_name: string | null;
  annex_names: string[];
  signer_name: string;
  signer_email: string;
  status: SignatureStatus;
  sent_at: string;
  opened_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  expire_at: string | null;
  has_signed_document: boolean;
  has_audit_log: boolean;
  error: string | null;
}

interface SignatureState {
  enabled: boolean;
  can_send: boolean;
  file_type_supported: boolean;
  suggested_signer: { name: string; email: string };
  variant_name: string | null;
  annexes: AnnexItem[];
  signatures: SignatureItem[];
}

interface AnnexItem {
  id: string;
  nom: string;
  file_type: 'word' | 'excel';
  selected: boolean;
}

const STATUS_META: Record<SignatureStatus, { label: string; className: string; icon: typeof Clock }> = {
  sending: { label: 'Envoi…', className: 'bg-slate-100 text-slate-700', icon: Loader2 },
  sent: { label: 'Envoyée en signature', className: 'bg-blue-50 text-blue-700', icon: Clock },
  opened: { label: 'Ouverte par le client', className: 'bg-indigo-50 text-indigo-700', icon: Eye },
  completed: { label: 'Signée', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  declined: { label: 'Signature refusée', className: 'bg-rose-50 text-rose-700', icon: XCircle },
  expired: { label: 'Demande expirée', className: 'bg-amber-50 text-amber-800', icon: Clock },
  cancelled: { label: 'Annulée', className: 'bg-slate-100 text-slate-600', icon: XCircle },
  error: { label: 'Échec de l’envoi', className: 'bg-rose-50 text-rose-700', icon: XCircle },
};

const ACTIVE: SignatureStatus[] = ['sending', 'sent', 'opened'];

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function StatusBadge({ status }: { status: SignatureStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.className)}>
      <Icon className={cn('h-3 w-3', status === 'sending' && 'animate-spin')} /> {meta.label}
    </span>
  );
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Une erreur est survenue');
  return data;
}

interface Props {
  propositionId: string;
  /** Variante SP affichée : c'est elle qui est envoyée en signature. */
  spVariantId?: string | null;
  /** Style du bouton principal. */
  buttonClassName?: string;
}

/**
 * Bouton « Envoyer en signature » + suivi DocuSeal. N'affiche rien tant que la
 * signature électronique n'est pas activée pour l'organisation (sauf historique).
 */
export function PropositionSignature({ propositionId, spVariantId, buttonClassName }: Props) {
  const router = useRouter();
  const [state, setState] = useState<SignatureState | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [expireDays, setExpireDays] = useState(30);
  const [annexIds, setAnnexIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...(spVariantId ? { variant: spVariantId } : {}), ...extra });
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [spVariantId]);

  const load = useCallback(async (refresh = false) => {
    const data = await readJson(await fetch(`/api/propositions/${propositionId}/signature${query(refresh ? { refresh: '1' } : {})}`, { cache: 'no-store' }));
    setState(data as SignatureState);
    return data as SignatureState;
  }, [propositionId, query]);

  useEffect(() => {
    // Statuts relus chez DocuSeal au chargement (filet de sécurité sans webhook).
    load(true).catch(() => setState(null));
  }, [load]);

  if (!state || (!state.enabled && state.signatures.length === 0)) return null;

  const latest = state.signatures[0];
  const hasActive = state.signatures.some((s) => ACTIVE.includes(s.status));
  const canSendNow = state.can_send && !hasActive;
  const wordAnnexes = state.annexes.filter((a) => a.file_type === 'word');
  const excelAnnexes = state.annexes.filter((a) => a.file_type !== 'word');

  const openSend = () => {
    setSignerName(state.suggested_signer.name);
    setSignerEmail(state.suggested_signer.email);
    setMessage('');
    setExpireDays(30);
    setAnnexIds(wordAnnexes.filter((a) => a.selected).map((a) => a.id));
    setHistoryOpen(false);
    setSendOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const data = await readJson(await fetch(`/api/propositions/${propositionId}/signature${query()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer_name: signerName, signer_email: signerEmail, message: message || undefined, expire_days: expireDays, annex_ids: annexIds }),
      }));
      toast.success(`Document envoyé en signature à ${signerEmail}`);
      if (data.placement === 'auto_block') {
        toast.info('Zone de signature ajoutée en fin de document (variable {{signature_client}} absente du modèle).');
      }
      setSendOpen(false);
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi impossible');
      await load().catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const before = state.signatures.find((s) => s.status === 'completed')?.id;
      const data = await load(true);
      if (!before && data.signatures.some((s) => s.status === 'completed')) router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Actualisation impossible');
    } finally {
      setRefreshing(false);
    }
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Annuler cette demande de signature ? Le lien envoyé au client ne fonctionnera plus.')) return;
    setBusyId(id);
    try {
      await readJson(await fetch(`/api/propositions/${propositionId}/signature/${id}`, { method: 'DELETE' }));
      toast.success('Demande de signature annulée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Annulation impossible');
    } finally {
      setBusyId(null);
    }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail.trim());

  return (
    <>
      {latest && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 transition-colors hover:bg-slate-50"
          title="Suivi de la signature électronique"
        >
          <StatusBadge status={latest.status} />
        </button>
      )}

      {canSendNow && (
        <Button type="button" variant="outline" onClick={openSend} className={buttonClassName}>
          <PenLine className="h-4 w-4" /> {latest?.status === 'completed' ? 'Renvoyer en signature' : 'Envoyer en signature'}
        </Button>
      )}

      {/* Envoi */}
      <Dialog open={sendOpen} onOpenChange={(open) => !sending && setSendOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer en signature</DialogTitle>
            <DialogDescription>
              {state.variant_name ? <>La variante <strong>{state.variant_name}</strong> de la proposition</> : 'La proposition'} est générée en Word avec une zone de signature, puis envoyée par DocuSeal au client, qui signe en ligne.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {state.annexes.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700">Annexes à joindre</legend>
                {wordAnnexes.map((annex) => (
                  <label key={annex.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={annexIds.includes(annex.id)}
                      onChange={(e) => setAnnexIds((ids) => (e.target.checked ? [...ids, annex.id] : ids.filter((x) => x !== annex.id)))}
                    />
                    {annex.nom}
                  </label>
                ))}
                {excelAnnexes.map((annex) => (
                  <label key={annex.id} className="flex items-center gap-2 text-sm text-gray-400" title="DocuSeal n’accepte que les fichiers Word">
                    <input type="checkbox" disabled checked={false} readOnly />
                    {annex.nom} <span className="text-xs">(Excel, non envoyable)</span>
                  </label>
                ))}
                <p className="text-xs text-gray-500">Le client signe une seule fois ; le PDF signé regroupe la proposition et les annexes jointes.</p>
              </fieldset>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Nom du signataire</span>
              <input value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={160} className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Email du signataire</span>
              <input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} maxLength={254} className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              {!state.suggested_signer.email && <span className="text-xs text-gray-500">Aucun email client trouvé dans la proposition : saisissez-le.</span>}
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Message personnalisé <span className="font-normal text-gray-500">(optionnel)</span></span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Bonjour, voici notre proposition à signer…" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <span className="text-xs text-gray-500">Le lien de signature est ajouté automatiquement. Sans message, l’email standard de DocuSeal est utilisé.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">Validité de la demande</span>
              <select value={expireDays} onChange={(e) => setExpireDays(Number(e.target.value))} className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
                {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
              </select>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} disabled={sending}>
              <Eye className="h-4 w-4" /> Prévisualiser {annexIds.length > 0 ? `(${annexIds.length + 1} documents)` : 'le document'}
            </Button>
            <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>Annuler</Button>
            <Button type="button" onClick={() => void send()} disabled={sending || !signerName.trim() || !emailValid}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Envoyer
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignaturePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        propositionId={propositionId}
        spVariantId={spVariantId}
        documents={[
          { key: 'main', label: state.variant_name ? `Proposition — ${state.variant_name}` : 'Proposition' },
          ...wordAnnexes.filter((a) => annexIds.includes(a.id)).map((a) => ({ key: a.id, label: a.nom })),
        ]}
      />

      {/* Suivi */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Signature électronique</DialogTitle>
            <DialogDescription>Suivi des demandes de signature envoyées via DocuSeal pour cette proposition.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {state.signatures.map((s) => (
              <li key={s.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{s.signer_name} <span className="font-normal text-slate-500">· {s.signer_email}</span></p>
                    <p className="truncate text-xs text-slate-500">
                      {s.document_name}
                      {s.variant_name && <> · variante <strong className="font-medium text-slate-700">{s.variant_name}</strong></>}
                    </p>
                    {s.annex_names.length > 0 && (
                      <p className="truncate text-xs text-slate-500">Annexes : {s.annex_names.join(', ')}</p>
                    )}
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-slate-500">
                  Envoyée le {formatDateTime(s.sent_at)}
                  {s.opened_at && ` · ouverte le ${formatDateTime(s.opened_at)}`}
                  {s.completed_at && ` · signée le ${formatDateTime(s.completed_at)}`}
                  {s.declined_at && ` · refusée le ${formatDateTime(s.declined_at)}`}
                  {ACTIVE.includes(s.status) && s.expire_at && ` · expire le ${formatDateTime(s.expire_at)}`}
                </p>
                {s.error && <p className="text-xs text-rose-700">{s.error}</p>}
                <div className="flex flex-wrap gap-2">
                  {s.has_signed_document && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/propositions/${propositionId}/signature/${s.id}/download?type=document`}><FileCheck2 className="h-3.5 w-3.5" /> PDF signé</a>
                    </Button>
                  )}
                  {s.has_audit_log && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/propositions/${propositionId}/signature/${s.id}/download?type=audit`}><ShieldCheck className="h-3.5 w-3.5" /> Journal d’audit</a>
                    </Button>
                  )}
                  {s.status === 'completed' && !s.has_signed_document && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Download className="h-3.5 w-3.5" /> Archivage du PDF en cours — cliquez sur Actualiser.</span>
                  )}
                  {state.can_send && (ACTIVE.includes(s.status) || s.status === 'error') && (
                    <Button type="button" size="sm" variant="outline" disabled={busyId === s.id} onClick={() => void cancel(s.id)} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">
                      {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} {s.status === 'error' ? 'Retirer' : 'Annuler la demande'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualiser
            </Button>
            {canSendNow && (
              <Button type="button" onClick={openSend}><PenLine className="h-4 w-4" /> Nouvel envoi</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
