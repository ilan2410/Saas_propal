'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Region = 'eu' | 'us';

interface DocusealSettingsState {
  configured: boolean;
  enabled: boolean;
  region: Region;
  last4: string | null;
  verified_at: string | null;
  webhook_url: string | null;
}

const REGIONS: Array<{ id: Region; label: string; hint: string }> = [
  { id: 'eu', label: 'DocuSeal Europe', hint: 'docuseal.eu — recommandé (données hébergées dans l’UE)' },
  { id: 'us', label: 'DocuSeal US', hint: 'docuseal.com' },
];

/** Console DocuSeal correspondant à la région du compte. */
function consoleUrl(region: Region, path: string) {
  return `https://console.docuseal.${region === 'us' ? 'com' : 'eu'}${path}`;
}

const WEBHOOK_EVENTS = ['form.viewed', 'form.completed', 'form.declined', 'submission.expired'];

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Une erreur est survenue');
  return data;
}

function ToggleSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-blue-600' : 'bg-gray-300',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

interface SignatureTabProps {
  isOwner: boolean;
  /** Fiche client admin : organisation gérée (en-tête x-admin-org-id). */
  adminOrgId?: string;
}

export function SignatureTab({ isOwner, adminOrgId }: SignatureTabProps) {
  const adminHeaders: Record<string, string> = adminOrgId ? { 'x-admin-org-id': adminOrgId } : {};
  const [state, setState] = useState<DocusealSettingsState | null>(null);
  const [memberEnabled, setMemberEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>('eu');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const apply = useCallback((data: DocusealSettingsState) => {
    setState(data);
    setRegion(data.region === 'us' ? 'us' : 'eu');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isOwner) {
          const data = await readJson(await fetch('/api/settings/docuseal', { cache: 'no-store', headers: adminOrgId ? { 'x-admin-org-id': adminOrgId } : undefined }));
          if (!cancelled) apply(data);
        } else {
          const data = await readJson(await fetch('/api/integrations/signature/status', { cache: 'no-store' }));
          if (!cancelled) setMemberEnabled(Boolean(data.enabled));
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOwner, apply, adminOrgId]);

  const save = async () => {
    if (!state?.configured && !apiKey.trim()) {
      toast.error('Saisissez votre clé API DocuSeal');
      return;
    }
    setSaving(true);
    try {
      const data = await readJson(await fetch('/api/settings/docuseal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...adminHeaders },
        body: JSON.stringify({ region, api_key: apiKey.trim() || undefined }),
      }));
      apply(data);
      setApiKey('');
      if (data.region_corrected && typeof data.notice === 'string') {
        toast.warning(data.notice, { duration: 8000 });
      } else {
        toast.success('Clé API vérifiée et enregistrée');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (body: Record<string, unknown>) => readJson(await fetch('/api/settings/docuseal', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders },
    body: JSON.stringify(body),
  }));

  const toggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      apply(await patch({ enabled }));
      toast.success(enabled ? 'Signature électronique activée' : 'Signature électronique désactivée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    } finally {
      setToggling(false);
    }
  };

  const regenerate = async () => {
    if (!window.confirm('Générer une nouvelle URL de webhook ? L’ancienne cessera de fonctionner : pensez à mettre à jour DocuSeal.')) return;
    setRegenerating(true);
    try {
      apply(await patch({ regenerate_webhook: true }));
      toast.success('Nouvelle URL de webhook générée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Opération impossible');
    } finally {
      setRegenerating(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Supprimer la clé API DocuSeal ? La signature électronique sera désactivée. L’historique des signatures est conservé.')) return;
    setRemoving(true);
    try {
      apply(await readJson(await fetch('/api/settings/docuseal', { method: 'DELETE', headers: adminHeaders })));
      toast.success('Clé API supprimée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setRemoving(false);
    }
  };

  const copyWebhook = async () => {
    if (!state?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(state.webhook_url);
      toast.success('URL copiée');
    } catch {
      toast.error('Copie impossible');
    }
  };

  const header = (
    <div className="border-b border-gray-100 pb-4">
      <h2 className="text-lg font-semibold text-gray-900">Signature électronique</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Envoyez vos propositions Word en signature à vos prospects directement depuis PropoBoost, avec votre propre compte{' '}
        <a href="https://www.docuseal.eu" target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">DocuSeal</a>.
        Les emails de signature sont envoyés par DocuSeal ; la proposition passe automatiquement en « Signée » et le PDF signé est archivé.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-7 p-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-7 p-6">
        {header}
        <div className={cn('rounded-lg px-4 py-3 text-sm', memberEnabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700')}>
          {memberEnabled
            ? 'La signature électronique est activée pour votre entreprise. Le bouton « Envoyer en signature » est disponible sur vos propositions Word (selon vos permissions).'
            : 'La signature électronique n’est pas activée. Seul l’administrateur du compte peut la configurer.'}
        </div>
      </div>
    );
  }

  const configured = !!state?.configured;

  return (
    <div className="space-y-7 p-6">
      {header}

      {/* Activation */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><PenLine className="h-5 w-5" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-gray-900">Activer la signature électronique</h3>
              {state?.enabled && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Activée</span>}
            </div>
            <p className="mt-0.5 text-sm text-gray-600">
              {configured ? 'Affiche le bouton « Envoyer en signature » sur les propositions Word.' : 'Enregistrez d’abord une clé API DocuSeal valide ci-dessous.'}
            </p>
          </div>
        </div>
        <ToggleSwitch label="Activer la signature électronique" checked={!!state?.enabled} disabled={!configured || !state?.verified_at || toggling} onChange={(v) => void toggle(v)} />
      </div>

      {/* Clé API */}
      <div className="max-w-2xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Compte DocuSeal</h3>
          <p className="mt-1 text-sm text-gray-600">
            L’API DocuSeal nécessite un abonnement <strong>Pro</strong>. Votre clé se trouve dans{' '}
            <a href={consoleUrl(region, '/api')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-blue-700 hover:underline">{consoleUrl(region, '/api').replace('https://', '')} <ExternalLink className="h-3 w-3" /></a>.
            {' '}Si la clé appartient à l’autre hébergement, il est détecté automatiquement.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Hébergement</legend>
          {REGIONS.map((r) => (
            <label key={r.id} className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', region === r.id ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200')}>
              <input type="radio" name="docuseal-region" value={r.id} checked={region === r.id} onChange={() => setRegion(r.id)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-900">{r.label}</span>
                <span className="block text-xs text-gray-500">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-700">Clé API</span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={configured ? `•••••••••••• ${state?.last4 ?? ''} (laisser vide pour conserver)` : 'Collez votre clé API DocuSeal'}
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {configured && state?.verified_at && (
            <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Clé vérifiée le {new Date(state.verified_at).toLocaleString('fr-FR')}</span>
          )}
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {configured ? 'Tester et enregistrer' : 'Tester et enregistrer la clé'}
          </Button>
          {configured && (
            <Button type="button" variant="outline" onClick={() => void remove()} disabled={removing} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer la clé
            </Button>
          )}
        </div>
      </div>

      {/* Webhook */}
      {configured && state?.webhook_url && (
        <div className="space-y-3 border-t border-gray-100 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Suivi automatique des signatures (webhook)</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Pour que PropoBoost soit prévenu dès qu’un document est ouvert ou signé, ajoutez cette URL dans DocuSeal :{' '}
              <a href={consoleUrl(state.region, '/webhooks')} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">Console → Webhooks</a>,
              en cochant les événements {WEBHOOK_EVENTS.map((e, i) => <span key={e}><code className="rounded bg-gray-100 px-1 text-xs">{e}</code>{i < WEBHOOK_EVENTS.length - 1 ? ', ' : ''}</span>)}.
              Sans webhook, utilisez le bouton « Actualiser » sur la proposition.
            </p>
          </div>
          <div className="flex max-w-3xl flex-col gap-2 sm:flex-row">
            <input readOnly value={state.webhook_url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 font-mono text-xs text-gray-800" />
            <Button type="button" variant="outline" onClick={() => void copyWebhook()}><Copy className="h-4 w-4" /> Copier</Button>
            <Button type="button" variant="outline" onClick={() => void regenerate()} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Régénérer
            </Button>
          </div>
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Cette URL contient un code secret : ne la partagez pas.
          </div>
        </div>
      )}

      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <strong>Placement de la signature :</strong> ajoutez la variable <code className="rounded bg-white px-1">{'{{signature_client}}'}</code> dans votre modèle Word à l’endroit voulu. Sans cette variable, un bloc « Bon pour accord » (nom, date, signature) est ajouté automatiquement en fin de document.
        <br />
        <strong>Paraphes :</strong> placez <code className="rounded bg-white px-1">{'{{paraphe_client}}'}</code> dans le <strong>pied de page</strong> du modèle (proposition et/ou annexes) pour faire parapher chaque page.
        <br />
        Ces variables restent vides dans les documents téléchargés.
      </div>
    </div>
  );
}
