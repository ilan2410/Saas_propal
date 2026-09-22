'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { formatEntryDate } from '@/lib/calendar/note-description';
import { formatNoteTitleDate, renderNoteTitleTemplate } from '@/lib/propositions/note-title-template';
import { utcToZonedLocalInput, zonedLocalDateTimeToUtc } from '@/lib/calendar/timezone';

export interface NoteEntryView {
  id: string;
  note_id: string;
  author_user_id: string;
  author_name: string;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  can_delete: boolean;
}

export interface NoteView {
  id: string;
  structure_version: number;
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
  can_edit: boolean;
  created_at: string;
  updated_at: string;
  proposition_note_entries: NoteEntryView[];
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

export interface NoteTitleTemplateContext {
  client: string;
  template: string;
  statut: string;
}

function toLocalInput(value: string | null, timeZone: string): string {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60_000);
  if (!value) date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return utcToZonedLocalInput(date.toISOString(), timeZone);
}

function hasSyncFailure(results: { ok: boolean }[] | undefined): boolean {
  return Boolean(results?.some((result) => !result.ok));
}

export function PropositionNoteDialog({
  propositionId,
  open,
  onOpenChange,
  initialNote,
  titleContext,
  onSaved,
}: {
  propositionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNote?: NoteView | null;
  titleContext: NoteTitleTemplateContext;
  onSaved: () => void;
}) {
  const [activeNote, setActiveNote] = useState<NoteView | null>(null);
  const [title, setTitle] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertMinutes, setAlertMinutes] = useState(15);
  const [agendas, setAgendas] = useState<AgendaChoice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryText, setEntryText] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState('');
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const applyNote = useCallback((note: NoteView | null) => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
    setActiveNote(note);
    setTitle(note?.title ?? '');
    setReminderEnabled(note?.kind === 'reminder');
    const initialTimezone = note?.timezone ?? detected;
    setStartsAt(toLocalInput(note?.starts_at ?? null, initialTimezone));
    setTimezone(initialTimezone);
    setDurationMinutes(note?.duration_minutes ?? 30);
    setAlertEnabled(note?.alert_enabled ?? false);
    setAlertMinutes(note?.alert_minutes ?? 15);
    setAgendas([]);
    setSelected(new Set((note?.calendar_event_links ?? []).map((link) => `${link.provider}:${link.calendar_id}`)));
    setEntryText('');
    setEditingEntryId(null);
    setEditingEntryText('');
  }, []);

  useEffect(() => {
    if (!open) return;
    applyNote(initialNote ?? null);
  }, [applyNote, initialNote, open]);

  useEffect(() => {
    if (!open || initialNote) return;
    let cancelled = false;
    const loadTemplate = async () => {
      try {
        const response = await fetch('/api/calendar/settings');
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.noteTitleTemplate) return;
        const templateTimezone = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
        const rendered = renderNoteTitleTemplate(data.noteTitleTemplate, {
          client: titleContext.client || 'Sans nom',
          date: formatNoteTitleDate(new Date(), templateTimezone),
          commercial: data.commercialName || 'Utilisateur',
          template: titleContext.template || 'Sans template',
          statut: titleContext.statut || 'En cours',
        });
        setTitle((current) => current.trim() ? current : rendered);
      } catch {
        return;
      }
    };
    void loadTemplate();
    return () => { cancelled = true; };
  }, [initialNote, open, titleContext.client, titleContext.statut, titleContext.template]);

  useEffect(() => {
    if (!open || !activeNote || !reminderEnabled || activeNote.is_own === false) return;
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
        if (!activeNote.timezone && settingsData.timezone) {
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
  }, [activeNote, open, reminderEnabled]);

  const refreshNote = async (noteId: string) => {
    const response = await fetch(`/api/propositions/${propositionId}/notes`);
    if (!response.ok) return null;
    const data = await response.json();
    const note = (data.notes ?? []).find((item: NoteView) => item.id === noteId) ?? null;
    if (note) applyNote(note);
    return note as NoteView | null;
  };

  const preservedTargets = useMemo(() => (activeNote?.calendar_event_links ?? []).filter((link) => {
    const key = `${link.provider}:${link.calendar_id}`;
    return selected.has(key) && !agendas.some((agenda) => `${agenda.provider}:${agenda.id}` === key);
  }), [activeNote?.calendar_event_links, agendas, selected]);

  const targets = () => [
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

  const toggleAgenda = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createNote = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Création impossible');
      await refreshNote(data.note.id);
      onSaved();
      toast.success('Note créée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!activeNote) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${activeNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          reminderEnabled,
          startsAt: reminderEnabled ? zonedLocalDateTimeToUtc(startsAt, timezone) : null,
          timezone: reminderEnabled ? timezone : null,
          durationMinutes: reminderEnabled ? durationMinutes : null,
          alertEnabled: reminderEnabled && alertEnabled,
          alertMinutes: reminderEnabled && alertEnabled ? alertMinutes : null,
          targets: reminderEnabled ? targets() : [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
      await refreshNote(activeNote.id);
      onSaved();
      if (data.syncError || hasSyncFailure(data.syncResults)) toast.warning('Note enregistrée, mais une synchronisation doit être relancée.');
      else toast.success('Note enregistrée');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const addEntry = async () => {
    if (!activeNote || !entryText.trim()) return;
    setBusyEntryId('new');
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${activeNote.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: entryText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Ajout impossible');
      setEntryText('');
      await refreshNote(activeNote.id);
      onSaved();
      if (hasSyncFailure(data.syncResults)) toast.warning('Mini-note ajoutée, synchronisation calendrier en attente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ajout impossible');
    } finally {
      setBusyEntryId(null);
    }
  };

  const updateEntry = async (entryId: string) => {
    if (!activeNote || !editingEntryText.trim()) return;
    setBusyEntryId(entryId);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${activeNote.id}/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingEntryText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Modification impossible');
      await refreshNote(activeNote.id);
      onSaved();
      if (hasSyncFailure(data.syncResults)) toast.warning('Mini-note modifiée, synchronisation calendrier en attente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    } finally {
      setBusyEntryId(null);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!activeNote || !window.confirm('Supprimer cette mini-note ?')) return;
    setBusyEntryId(entryId);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${activeNote.id}/entries/${entryId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Suppression impossible');
      await refreshNote(activeNote.id);
      onSaved();
      if (hasSyncFailure(data.syncResults)) toast.warning('Mini-note supprimée, synchronisation calendrier en attente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setBusyEntryId(null);
    }
  };

  const validReminder = !reminderEnabled || Boolean(startsAt && timezone && durationMinutes >= 5 && (!alertEnabled || alertMinutes >= 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] max-w-2xl overflow-y-auto border-slate-200 bg-white p-0 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-6">
          <DialogTitle className="text-slate-900">{activeNote ? 'Suivi de la note' : 'Créer une note'}</DialogTitle>
          <DialogDescription className="text-slate-500">
            {activeNote ? 'Ajoutez le suivi commercial ligne par ligne et programmez un rappel si nécessaire.' : 'Donnez un titre à cette note. Vous pourrez ensuite ajouter son suivi.'}
          </DialogDescription>
        </DialogHeader>

        {!activeNote ? (
          <div className="space-y-2 px-6 py-5">
            <label htmlFor="note-title" className="text-sm font-medium text-slate-700">Titre</label>
            <input id="note-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} onKeyDown={(event) => { if (event.key === 'Enter' && title.trim()) void createNote(); }} placeholder="Suivi de la proposition" className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
          </div>
        ) : activeNote.structure_version !== 2 ? (
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Cette ancienne note est disponible en lecture seule.</div>
            {activeNote.title && <h3 className="font-semibold text-slate-900">{activeNote.title}</h3>}
            {activeNote.content && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{activeNote.content}</p>}
          </div>
        ) : (
          <div className="space-y-6 px-6 py-5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Titre</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} disabled={!activeNote.can_edit} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50" />
            </label>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold text-slate-900">Journal de suivi</h3><p className="text-xs text-slate-500">Chaque ajout est daté et attribué automatiquement.</p></div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{activeNote.proposition_note_entries.length}</span>
              </div>

              {activeNote.proposition_note_entries.length ? (
                <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {activeNote.proposition_note_entries.map((entry) => (
                    <div key={entry.id} className="group px-3 py-3">
                      {editingEntryId === entry.id ? (
                        <div className="flex gap-2">
                          <input autoFocus value={editingEntryText} onChange={(event) => setEditingEntryText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void updateEntry(entry.id); if (event.key === 'Escape') setEditingEntryId(null); }} maxLength={2000} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                          <Button type="button" size="sm" disabled={!editingEntryText.trim() || busyEntryId === entry.id} onClick={() => void updateEntry(entry.id)}>Enregistrer</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingEntryId(null)}>Annuler</Button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-slate-700"><strong className="font-semibold text-slate-900">{entry.author_name}</strong> : <span className="tabular-nums text-slate-500">{formatEntryDate(entry.entry_date)}</span> - {entry.content}</p>
                          {(entry.can_edit || entry.can_delete) && (
                            <div className="flex shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
                              {entry.can_edit && <button type="button" onClick={() => { setEditingEntryId(entry.id); setEditingEntryText(entry.content); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Modifier la mini-note"><Pencil className="h-3.5 w-3.5" /></button>}
                              {entry.can_delete && <button type="button" disabled={busyEntryId === entry.id} onClick={() => void deleteEntry(entry.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-rose-700 disabled:opacity-50" aria-label="Supprimer la mini-note">{busyEntryId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Aucun suivi pour le moment.</div>
              )}

              <div className="flex gap-2">
                <input value={entryText} onChange={(event) => setEntryText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && entryText.trim()) void addEntry(); }} maxLength={2000} placeholder="Ajouter une ligne de suivi…" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                <Button type="button" onClick={() => void addEntry()} disabled={!entryText.trim() || busyEntryId === 'new'} className="bg-slate-900 text-white hover:bg-slate-800">{busyEntryId === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</Button>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span><span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CalendarClock className="h-4 w-4 text-amber-700" /> Activer un rappel</span><span className="mt-1 block text-xs text-slate-500">Ajoutez une échéance et synchronisez-la avec vos agendas.</span></span>
                <input type="checkbox" checked={reminderEnabled} disabled={!activeNote.can_edit} onChange={(event) => setReminderEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500" />
              </label>

              {reminderEnabled && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Date et heure</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /></label>
                    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Durée</span><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 heure</option><option value={90}>1 h 30</option><option value={120}>2 heures</option></select></label>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3">
                    <label className="flex cursor-pointer items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Bell className="h-4 w-4 text-slate-500" /> Alerte calendrier</span><input type="checkbox" checked={alertEnabled} onChange={(event) => setAlertEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500" /></label>
                    {alertEnabled && <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">Prévenir <input type="number" min={0} max={40320} value={alertMinutes} onChange={(event) => setAlertMinutes(Number(event.target.value))} className="h-9 w-20 rounded-md border border-slate-300 px-2 text-slate-900" /> minutes avant</label>}
                  </div>

                  <div className="space-y-2">
                    <div><p className="text-sm font-medium text-slate-700">Agendas synchronisés</p><p className="text-xs text-slate-500">Facultatif — le rappel reste disponible dans ProBoost sans agenda.</p></div>
                    {loadingCalendars ? <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des agendas…</div> : agendas.length ? (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
                        {agendas.map((agenda) => {
                          const key = `${agenda.provider}:${agenda.id}`;
                          const checked = selected.has(key);
                          return <button key={`${agenda.connectionId}:${agenda.id}`} type="button" onClick={() => toggleAgenda(key)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white')}><Check className={cn('h-3 w-3', !checked && 'opacity-0')} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-800">{agenda.name}</span><span className="block truncate text-xs text-slate-500">{agenda.provider === 'google' ? 'Google' : 'Outlook'} · {agenda.accountLabel}</span></span></button>;
                        })}
                      </div>
                    ) : <a href="/settings?tab=calendriers" className="inline-flex text-sm font-medium text-blue-700 underline-offset-4 hover:underline">Connecter Google ou Outlook</a>}
                    {preservedTargets.length > 0 && <p className="text-xs text-slate-500">Les agendas du créateur resteront synchronisés.</p>}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{activeNote ? 'Fermer' : 'Annuler'}</Button>
          {!activeNote && <Button type="button" onClick={() => void createNote()} disabled={!title.trim() || saving} className="bg-slate-900 text-white hover:bg-slate-800">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Créer la note</Button>}
          {activeNote?.structure_version === 2 && activeNote.can_edit && <Button type="button" onClick={() => void saveNote()} disabled={!title.trim() || !validReminder || saving} className="bg-slate-900 text-white hover:bg-slate-800">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
