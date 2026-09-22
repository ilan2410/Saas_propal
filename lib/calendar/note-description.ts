import type { PropositionNoteEntry } from './types';

export interface CalendarNoteLine {
  entryDate: string;
  content: string;
}

export interface EntryReconciliation {
  updates: { id: string; entryDate: string; content: string }[];
  creates: CalendarNoteLine[];
  deletes: string[];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim();
  const french = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(trimmed);
  if (french) return validDate(Number(french[3]), Number(french[2]), Number(french[1]));
  const iso = /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/.exec(trimmed);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export function formatEntryDate(value: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parsed ? `${parsed[3]}/${parsed[2]}/${parsed[1]}` : value;
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
}

function normalizeContent(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseCalendarDescription(description: string | null, fallbackDate: string): CalendarNoteLine[] {
  if (!description) return [];
  return description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separated = /^(.*?)\s+-\s+(.+)$/.exec(line);
      if (!separated) return { entryDate: fallbackDate, content: normalizeContent(line) };
      const prefix = separated[1].trim();
      const dateLike = /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(prefix);
      if (!dateLike) return { entryDate: fallbackDate, content: normalizeContent(line) };
      return {
        entryDate: parseFlexibleDate(prefix) ?? fallbackDate,
        content: normalizeContent(separated[2]),
      };
    })
    .filter((line) => Boolean(line.content));
}

export function serializeCalendarEntries(entries: Pick<PropositionNoteEntry, 'entry_date' | 'content'>[]): string {
  return entries.map((entry) => `${formatEntryDate(entry.entry_date)} - ${normalizeContent(entry.content)}`).join('\n');
}

export function formatPlatformEntry(entry: Pick<PropositionNoteEntry, 'entry_date' | 'content'> & { author_name?: string }): string {
  return `${entry.author_name || 'Utilisateur'} : ${formatEntryDate(entry.entry_date)} - ${normalizeContent(entry.content)}`;
}

export function reconcileCalendarLines(
  entries: Pick<PropositionNoteEntry, 'id' | 'entry_date' | 'content'>[],
  lines: CalendarNoteLine[],
): EntryReconciliation {
  const remainingEntries = new Set(entries.map((entry) => entry.id));
  const remainingLines = new Set(lines.map((_, index) => index));

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = entries.find((entry) => remainingEntries.has(entry.id)
      && entry.entry_date === line.entryDate
      && normalizeContent(entry.content) === line.content);
    if (match) {
      remainingEntries.delete(match.id);
      remainingLines.delete(lineIndex);
    }
  }

  const unmatchedEntries = entries.filter((entry) => remainingEntries.has(entry.id));
  const unmatchedLines = lines.filter((_, index) => remainingLines.has(index));
  const sharedLength = Math.min(unmatchedEntries.length, unmatchedLines.length);
  const updates = unmatchedEntries.slice(0, sharedLength).map((entry, index) => ({
    id: entry.id,
    entryDate: unmatchedLines[index].entryDate,
    content: unmatchedLines[index].content,
  }));

  return {
    updates,
    creates: unmatchedLines.slice(sharedLength),
    deletes: unmatchedEntries.slice(sharedLength).map((entry) => entry.id),
  };
}
