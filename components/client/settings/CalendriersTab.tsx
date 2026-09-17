'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CalendarProvider } from '@/lib/calendar/types';

interface ConnectionView {
  id: string;
  provider: CalendarProvider;
  account_email: string | null;
  account_name: string | null;
  status: string;
  last_error: string | null;
}

const PROVIDERS: { id: CalendarProvider; name: string; description: string; accent: string }[] = [
  { id: 'google', name: 'Google Calendar', description: 'Comptes Google personnels et Google Workspace', accent: 'bg-blue-50 text-blue-700' },
  { id: 'microsoft', name: 'Outlook', description: 'Comptes Microsoft personnels et professionnels', accent: 'bg-sky-50 text-sky-700' },
];

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  microsoft_invalid_client_secret: 'Le secret Microsoft est invalide, expiré ou ne correspond pas au Client ID utilisé.',
  provider_invalid_client: 'Les identifiants OAuth du fournisseur sont invalides.',
  provider_unauthorized_client: 'Cette application OAuth n’est pas autorisée pour ce type de compte.',
  authorization_code_invalid: 'L’autorisation a expiré ou a déjà été utilisée. Recommencez la connexion.',
  provider_token_exchange_failed: 'Microsoft a refusé de finaliser la connexion. Vérifiez le secret et l’URI de redirection.',
  calendar_migration_missing: 'La migration des calendriers n’est pas encore appliquée dans Supabase.',
  calendar_encryption_key_invalid: 'La clé de chiffrement des calendriers est absente ou invalide.',
  missing_refresh_token: 'Microsoft n’a pas fourni d’accès hors ligne. Retirez l’autorisation puis reconnectez le compte.',
  oauth_session_expired: 'La session de connexion a expiré. Recommencez depuis les paramètres.',
  missing_callback_parameters: 'La réponse Microsoft est incomplète. Recommencez la connexion.',
  callback_failed: 'La connexion au calendrier a échoué. Consultez les logs serveur pour le code de diagnostic.',
};

function timezones(current: string) {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf?.('timeZone');
  return [...new Set([current, ...(supported ?? ['Europe/Paris', 'Europe/London', 'America/New_York', 'America/Montreal', 'Asia/Dubai'])])].filter(Boolean);
}

export function CalendriersTab() {
  const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris', []);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [loading, setLoading] = useState(true);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [disconnecting, setDisconnecting] = useState<CalendarProvider | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connectionsResponse, settingsResponse] = await Promise.all([
        fetch('/api/calendar/connections'),
        fetch('/api/calendar/settings'),
      ]);
      if (!connectionsResponse.ok || !settingsResponse.ok) throw new Error('Chargement impossible');
      const [connectionsData, settingsData] = await Promise.all([connectionsResponse.json(), settingsResponse.json()]);
      setConnections(connectionsData.connections ?? []);
      setTimezone(settingsData.timezone || detectedTimezone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [detectedTimezone]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('calendar_connected');
    const error = params.get('calendar_error');
    if (connected) toast.success(`${connected === 'google' ? 'Google Calendar' : 'Outlook'} connecté`);
    if (error) toast.error(CALENDAR_ERROR_MESSAGES[error] ?? CALENDAR_ERROR_MESSAGES.callback_failed);
    if (connected || error) {
      params.delete('calendar_connected');
      params.delete('calendar_error');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
  }, []);

  const saveTimezone = async () => {
    setSavingTimezone(true);
    try {
      const response = await fetch('/api/calendar/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timezone }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
      toast.success('Fuseau horaire enregistré');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSavingTimezone(false);
    }
  };

  const disconnect = async (provider: CalendarProvider) => {
    if (!window.confirm('Déconnecter ce calendrier ? Les événements déjà créés seront conservés mais ne seront plus synchronisés.')) return;
    setDisconnecting(provider);
    try {
      const response = await fetch(`/api/calendar/connections?provider=${provider}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Déconnexion impossible');
      toast.success('Calendrier déconnecté');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Déconnexion impossible');
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="space-y-7 p-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">Calendriers</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">Connectez vos calendriers personnels pour y synchroniser certains rappels. Notes et rappels fonctionnent toujours dans PropoBoost, même sans connexion.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des connexions…</div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {PROVIDERS.map((provider) => {
            const connection = connections.find((item) => item.provider === provider.id);
            const connected = connection?.status === 'connected';
            return (
              <div key={provider.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', provider.accent)}><CalendarDays className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-gray-900">{provider.name}</h3>
                      {connected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Connecté</span>}
                      {connection && !connected && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Reconnexion requise</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{connected ? connection.account_email || connection.account_name || provider.description : provider.description}</p>
                    {connection?.last_error && <p className="mt-1 text-xs text-rose-700">{connection.last_error}</p>}
                  </div>
                </div>
                {connected ? (
                  <div className="flex shrink-0 gap-2">
                    <Button asChild variant="outline" size="sm"><a href={`/api/calendar/${provider.id}/connect`}><RefreshCw className="h-3.5 w-3.5" /> Reconnecter</a></Button>
                    <Button type="button" variant="outline" size="sm" disabled={disconnecting === provider.id} onClick={() => void disconnect(provider.id)} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">{disconnecting === provider.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Déconnecter</Button>
                  </div>
                ) : (
                  <Button asChild size="sm" className="shrink-0 bg-gray-900 text-white hover:bg-gray-800"><a href={`/api/calendar/${provider.id}/connect`}>Connecter <ExternalLink className="h-3.5 w-3.5" /></a></Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="max-w-xl space-y-3">
        <div><h3 className="text-sm font-semibold text-gray-900">Fuseau horaire des rappels</h3><p className="mt-1 text-sm text-gray-600">Détecté depuis votre navigateur. Vous pouvez le corriger pour les prochains rappels.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            {timezones(timezone).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <Button type="button" onClick={() => void saveTimezone()} disabled={savingTimezone}>{savingTimezone && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700"><strong>À savoir :</strong> déconnecter un fournisseur ne supprime ni les rappels PropoBoost ni les événements déjà présents dans ce calendrier.</div>
    </div>
  );
}
