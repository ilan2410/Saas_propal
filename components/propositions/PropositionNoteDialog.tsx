'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Check, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CalendarAgenda, CalendarProvider, PropositionNoteKind } from '@/lib/calendar/types';
import { utcToZonedLocalInput, zonedLocalDateTimeToUtc } from '@/lib/calendar/timezone';

export interface NoteView {
  id: string;
  kind: PropositionNoteKind;
  title: string | null;
  content: string | null;
  starts_at: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  alert_enabled: boolean;
  alert_minutes: number | null;
  author_user_id: string;
  author_name: string;
  is_own: boolean;
  created_at: string;
  updated_at: string;
  calendar_event_links: {
    id: string;
    connection_id: string | null;
    provider: CalendarProvider;
    calendar_id: string;
    calendar_name: string | null;
    sync_status: string;
    last_error: string | null;
  }[];
}

interface ConnectionView {
  id: string;
  provider: CalendarProvider;
  account_email: string | null;
  account_name: string | null;
  status: string;
}

type AgendaChoice = CalendarAgenda & { connectionId: string; accountLabel: string };

function toLocalInput(value: string | null, timeZone: string): string {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60_000);
  if (!value) date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return utcToZonedLocalInput(date.toISOString(), timeZone);
}

export function PropositionNoteDialog({
  propositionId,
  open,
  onOpenChange,
  initialNote,
  onSaved,
}: {
  propositionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNote?: NoteView | null;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<PropositionNoteKind>('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertMinutes, setAlertMinutes] = useState(15);
  const [agendas, setAgendas] = useState<AgendaChoice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
    setKind(initialNote?.kind ?? 'note');
    setTitle(initialNote?.title ?? '');
    setContent(initialNote?.content ?? '');
    const initialTimezone = initialNote?.timezone ?? detected;
    setStartsAt(toLocalInput(initialNote?.starts_at ?? null, initialTimezone));
    setTimezone(initialTimezone);
    setDurationMinutes(initialNote?.duration_minutes ?? 30);
    setAlertEnabled(initialNote?.alert_enabled ?? false);
    setAlertMinutes(initialNote?.alert_minutes ?? 15);
    if (initialNote?.is_own === false) setAgendas([]);
    setSelected(new Set((initialNote?.calendar_event_links ?? []).map((link) => `${link.provider}:${link.calendar_id}`)));
  }, [initialNote, open]);

  useEffect(() => {
    if (!open || kind !== 'reminder' || initialNote?.is_own === false) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCalendars(true);
      try {
        const [connectionsResponse, settingsResponse] = await Promise.all([
          fetch('/api/calendar/connections'),
          fetch('/api/calendar/settings'),
        ]);
        const connectionsData = await connectionsResponse.json();
        const settingsData = await settingsResponse.json();
        if (cancelled) return;
        const connected = (connectionsData.connections ?? []).filter((item: ConnectionView) => item.status === 'connected');
        if (!initialNote?.timezone && settingsData.timezone) {
          setTimezone(settingsData.timezone);
          setStartsAt(toLocalInput(null, settingsData.timezone));
        }
        const agendaGroups = await Promise.all(connected.map(async (connection: ConnectionView) => {
          const response = await fetch(`/api/calendar/agendas?connectionId=${encodeURIComponent(connection.id)}`);
          if (!response.ok) return [];
          const data = await response.json();
          return (data.agendas ?? []).map((agenda: CalendarAgenda) => ({
            ...agenda,
            connectionId: connection.id,
            accountLabel: connection.account_email || connection.account_name || connection.provider,
          }));
        }));
        if (!cancelled) setAgendas(agendaGroups.flat());
      } catch {
        if (!cancelled) setAgendas([]);
      } finally {
        if (!cancelled) setLoadingCalendars(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [initialNote?.is_own, initialNote?.timezone, kind, open]);

  const preservedTargets = useMemo(() => (initialNote?.calendar_event_links ?? []).filter((link) => {
    const key = `${link.provider}:${link.calendar_id}`;
    return selected.has(key) && !agendas.some((agenda) => `${agenda.provider}:${agenda.id}` === key);
  }), [agendas, initialNote?.calendar_event_links, selected]);

  const toggleAgenda = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const targets = [
        ...agendas.filter((agenda) => selected.has(`${agenda.provider}:${agenda.id}`)).map((agenda) => ({
          connectionId: agenda.connectionId,
          provider: agenda.provider,
          calendarId: agenda.id,
          calendarName: agenda.name,
        })),
        ...preservedTargets.filter((link) => link.connection_id).map((link) => ({
          connectionId: link.connection_id as string,
          provider: link.provider,
          calendarId: link.calendar_id,
          calendarName: link.calendar_name ?? undefined,
        })),
      ];
      const payload = {
        kind,
        title: kind === 'reminder' ? title : null,
        content,
        startsAt: kind === 'reminder' ? zonedLocalDateTimeToUtc(startsAt, timezone) : null,
        timezone: kind === 'reminder' ? timezone : null,
        durationMinutes: kind === 'reminder' ? durationMinutes : null,
        alertEnabled: kind === 'reminder' && alertEnabled,
        alertMinutes: kind === 'reminder' && alertEnabled ? alertMinutes : null,
        targets: kind === 'reminder' ? targets : [],
      };
      const endpoint = initialNote
        ? `/api/propositions/${propositionId}/notes/${initialNote.id}`
        : `/api/propositions/${propositionId}/notes`;
      const response = await fetch(endpoint, {
        method: initialNote ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
      if (data.syncError || data.syncResults?.some((result: { ok: boolean }) => !result.ok)) {
        toast.warning('Enregistré dans PropoBoost. Une synchronisation calendrier doit être relancée.');
      } else {
        toast.success(initialNote ? 'Note mise à jour' : kind === 'note' ? 'Note ajoutée' : 'Rappel ajouté');
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const valid = kind === 'note'
    ? Boolean(content.trim())
    : Boolean(title.trim() && startsAt && timezone && durationMinutes >= 5 && (!alertEnabled || alertMinutes >= 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-xl overflow-y-auto border-slate-200 bg-white p-0 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-6">
          <DialogTitle className="text-slate-900">{initialNote ? 'Modifier' : 'Ajouter'} une note</DialogTitle>
          <DialogDescription className="text-slate-500">Une note reste interne. Un rappel peut aussi être envoyé aux agendas de votre choix.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-1">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Type d’entrée">
            <button type="button" role="radio" aria-checked={kind === 'note'} onClick={() => setKind('note')} className={cn('flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500', kind === 'note' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
              <FileText className="h-4 w-4" /> Note
            </button>
            <button type="button" role="radio" aria-checked={kind === 'reminder'} onClick={() => setKind('reminder')} className={cn('flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500', kind === 'reminder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
              <CalendarClock className="h-4 w-4" /> Rappel
            </button>
          </div>

          {kind === 'reminder' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Titre du rappel</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} placeholder="Rappeler le client" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{kind === 'note' ? 'Note' : 'Détails (facultatif)'}</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={10000} rows={4} placeholder={kind === 'note' ? 'Saisissez votre note…' : 'Informations utiles pour le rendez-vous…'} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
          </label>

          {kind === 'reminder' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Date et heure</span>
                  <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Durée</span>
                  <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                    <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 heure</option><option value={90}>1 h 30</option><option value={120}>2 heures</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Bell className="h-4 w-4 text-slate-500" /> Activer une alerte calendrier</span>
                  <input type="checkbox" checked={alertEnabled} onChange={(event) => setAlertEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500" />
                </label>
                {alertEnabled && (
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    Prévenir <input type="number" min={0} max={40320} value={alertMinutes} onChange={(event) => setAlertMinutes(Number(event.target.value))} className="h-9 w-20 rounded-md border border-slate-300 px-2 text-slate-900" /> minutes avant
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Synchroniser avec un calendrier</p>
                  <p className="text-xs text-slate-500">Facultatif — le rappel sera enregistré dans PropoBoost dans tous les cas.</p>
                </div>
                {loadingCalendars ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des agendas…</div>
                ) : agendas.length ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
                    {agendas.map((agenda) => {
                      const key = `${agenda.provider}:${agenda.id}`;
                      const checked = selected.has(key);
                      return (
                        <button key={`${agenda.connectionId}:${agenda.id}`} type="button" onClick={() => toggleAgenda(key)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                          <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white')}><Check className={cn('h-3 w-3', !checked && 'opacity-0')} /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-800">{agenda.name}</span><span className="block truncate text-xs text-slate-500">{agenda.provider === 'google' ? 'Google' : 'Outlook'} · {agenda.accountLabel}</span></span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <a href="/settings?tab=calendriers" className="inline-flex text-sm font-medium text-blue-700 underline-offset-4 hover:underline">Connecter Google ou Outlook dans les paramètres</a>
                )}
                {preservedTargets.length > 0 && <p className="text-xs text-slate-500">Les agendas du créateur actuel resteront synchronisés.</p>}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="button" onClick={save} disabled={!valid || saving} className="bg-slate-900 text-white hover:bg-slate-800">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{initialNote ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
