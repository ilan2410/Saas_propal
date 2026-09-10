export function formatBdcOperatorNameWithNumber(name: string, number?: string): string {
  const trimmedNumber = number?.trim();
  if (!trimmedNumber) return name;
  return [name.trim(), trimmedNumber].filter(Boolean).join(' - ');
}
