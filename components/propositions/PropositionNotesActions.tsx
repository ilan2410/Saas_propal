'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, Loader2, MessageSquarePlus, Pencil, RefreshCw, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PropositionNoteDialog, type NoteTitleTemplateContext, type NoteView } from './PropositionNoteDialog';
import { formatEntryDate } from '@/lib/calendar/note-description';

function noteDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function PropositionNotesActions({
  propositionId,
  initialCount,
  titleContext,
}: {
  propositionId: string;
  initialCount: number;
  titleContext: NoteTitleTemplateContext;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteView | null>(null);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [canViewAuthors, setCanViewAuthors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chargement impossible');
      setNotes(data.notes ?? []);
      setCount(data.notes?.length ?? 0);
      setCanViewAuthors(Boolean(data.canViewAuthors));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [propositionId]);

  const openReader = (open: boolean) => {
    setPopoverOpen(open);
    if (open) void loadNotes();
  };

  const openCreator = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const saved = () => {
    void loadNotes();
    router.refresh();
  };

  const remove = async (note: NoteView) => {
    if (!window.confirm(note.kind === 'reminder' ? 'Supprimer ce rappel et ses événements calendrier synchronisés ?' : 'Supprimer cette note ?')) return;
    setBusyId(note.id);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${note.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Suppression impossible');
      toast.success(note.kind === 'reminder' ? 'Rappel supprimé' : 'Note supprimée');
      await loadNotes();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (note: NoteView) => {
    setBusyId(note.id);
    try {
      const response = await fetch(`/api/propositions/${propositionId}/notes/${note.id}/sync`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Synchronisation impossible');
      const failed = data.results?.some((result: { ok: boolean }) => !result.ok);
      if (failed) toast.warning('Certains agendas restent indisponibles. Un nouvel essai sera effectué automatiquement.');
      else toast.success('Calendriers synchronisés');
      await loadNotes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Synchronisation impossible');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); openCreator(); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
        aria-label="Ajouter une note"
        title="Ajouter une note"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>

      {count > 0 && (
        <Popover open={popoverOpen} onOpenChange={openReader}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              aria-label={`Lire les notes (${count})`}
              title="Lire les notes"
            >
              <StickyNote className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-none text-white">{count > 99 ? '99+' : count}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-hidden border-slate-200 bg-white p-0 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div><p className="text-sm font-semibold text-slate-900">Notes de suivi</p><p className="text-xs text-slate-500">{count} note{count > 1 ? 's' : ''}</p></div>
              <button type="button" onClick={openCreator} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"><MessageSquarePlus className="h-3.5 w-3.5" /> Ajouter</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
              ) : notes.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">Aucune note visible.</p>
              ) : (
                <div className="space-y-1.5">
                  {notes.map((note) => {
                    const hasError = note.calendar_event_links.some((link) => link.sync_status === 'error');
                    const pending = note.calendar_event_links.some((link) => link.sync_status === 'pending');
                    return (
                      <article key={note.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', note.kind === 'reminder' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')}>
                            {note.kind === 'reminder' ? <CalendarClock className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            {note.title && <p className="text-sm font-semibold text-slate-900">{note.title}</p>}
                            {note.structure_version === 2 ? (
                              note.proposition_note_entries.length > 0 ? (
                                <div className="mt-1.5 space-y-1">
                                  {note.proposition_note_entries.slice(-2).map((entry) => <p key={entry.id} className="truncate text-xs text-slate-600"><strong className="font-medium text-slate-800">{entry.author_name}</strong> : {formatEntryDate(entry.entry_date)} - {entry.content}</p>)}
                                  {note.proposition_note_entries.length > 2 && <p className="text-[11px] font-medium text-blue-700">+ {note.proposition_note_entries.length - 2} autre{note.proposition_note_entries.length > 3 ? 's' : ''}</p>}
                                </div>
                              ) : <p className="mt-1 text-xs text-slate-500">Aucun suivi ajouté</p>
                            ) : note.content ? <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{note.content}</p> : null}
                            {note.kind === 'reminder' && note.starts_at && <p className="mt-2 text-xs font-medium text-amber-700">{noteDate(note.starts_at)} · {note.duration_minutes} min</p>}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <span>{note.structure_version === 2 ? `${note.proposition_note_entries.length} ligne${note.proposition_note_entries.length > 1 ? 's' : ''}` : noteDate(note.created_at)}</span>
                              {canViewAuthors && <><span aria-hidden="true">·</span><span>{note.author_name}</span></>}
                              {note.structure_version !== 2 && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Historique</span>}
                              {note.calendar_event_links.length > 0 && <span className={cn('rounded-full px-1.5 py-0.5 font-medium', hasError ? 'bg-rose-50 text-rose-700' : pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{hasError ? 'Erreur calendrier' : pending ? 'Synchronisation…' : `${note.calendar_event_links.length} agenda${note.calendar_event_links.length > 1 ? 's' : ''}`}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center">
                            {(hasError || pending) && <button type="button" disabled={busyId === note.id} onClick={() => void retry(note)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-50 disabled:opacity-50" aria-label="Relancer la synchronisation" title="Relancer la synchronisation">{busyId === note.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasError ? <AlertCircle className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>}
                            <button type="button" onClick={() => { setEditing(note); setDialogOpen(true); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Modifier" title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" disabled={busyId === note.id} onClick={() => void remove(note)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-rose-700 disabled:opacity-50" aria-label="Supprimer" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <PropositionNoteDialog propositionId={propositionId} open={dialogOpen} onOpenChange={setDialogOpen} initialNote={editing} titleContext={titleContext} onSaved={saved} />
    </>
  );
}
