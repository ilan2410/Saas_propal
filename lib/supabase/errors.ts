// Codes PostgREST/Postgres renvoyés quand une table ou relation n'existe pas
// encore (ex. migration non appliquée sur un Supabase auto-hébergé).
export function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST200' || code === 'PGRST205';
}
