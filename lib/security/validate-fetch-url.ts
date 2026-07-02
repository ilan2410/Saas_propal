// Restreint les fetch() serveur déclenchés par une URL fournie/contrôlée par
// l'utilisateur (fileUrl de template, image_url de document) au seul host
// Supabase du projet, en HTTPS. Protection SSRF : empêche un attaquant de
// faire pointer une requête serveur vers le réseau interne ou les
// métadonnées cloud via une URL arbitraire.

function getAllowedHost(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    : null;
}

/** true si `url` est une URL https pointant vers le host Supabase du projet. */
export function isAllowedFetchUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const allowedHost = getAllowedHost();
  return parsed.protocol === 'https:' && !!allowedHost && parsed.hostname === allowedHost;
}

/** Comme `isAllowedFetchUrl`, mais lève une erreur explicite si l'URL est refusée. */
export function assertAllowedFetchUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL invalide: ${url}`);
  }
  const allowedHost = getAllowedHost();
  if (parsed.protocol !== 'https:' || !allowedHost || parsed.hostname !== allowedHost) {
    throw new Error(
      `URL non autorisée: seuls les documents hébergés sur ${allowedHost ?? '(host Supabase non configuré)'} sont acceptés`
    );
  }
  return parsed;
}
