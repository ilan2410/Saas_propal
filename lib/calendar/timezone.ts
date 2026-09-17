function parts(value: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const map = new Map(values.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
  };
}

function offsetAt(timestamp: number, timeZone: string): number {
  const value = parts(new Date(timestamp), timeZone);
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second) - timestamp;
}

export function zonedLocalDateTimeToUtc(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Date et heure invalides');
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let result = desired - offsetAt(desired, timeZone);
  result = desired - offsetAt(result, timeZone);
  const resolved = utcToZonedLocalInput(new Date(result).toISOString(), timeZone);
  if (resolved !== value) throw new Error('Cette heure n’existe pas dans le fuseau sélectionné');
  return new Date(result).toISOString();
}

export function utcToZonedLocalInput(value: string, timeZone: string): string {
  const resolved = parts(new Date(value), timeZone);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${resolved.year}-${pad(resolved.month)}-${pad(resolved.day)}T${pad(resolved.hour)}:${pad(resolved.minute)}`;
}
