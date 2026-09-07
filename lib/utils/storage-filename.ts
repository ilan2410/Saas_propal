// Retrouve un nom de fichier lisible à partir d'une URL (ou d'un nom) de
// stockage Supabase.
//
// Les fichiers uploadés sont stockés sous `<org>/<uuid>-<nom d'origine>.<ext>`
// (voir `safeStorageFileName`). Cette fonction isole le dernier segment, le
// décode, puis retire le préfixe UUID. Le préfixe historique `<nombre>-`
// (ancien schéma `timestamp-nom`) est également retiré pour les fichiers plus
// anciens ; les fichiers encore plus anciens (UUID nu, sans nom d'origine)
// ressortent tels quels, faute de nom récupérable.

const UUID_PREFIX_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

export function friendlyFileNameFromUrl(urlOrName: string, fallback = 'Document'): string {
  try {
    const withoutQuery = (urlOrName || '').split('?')[0] || '';
    const last = withoutQuery.split('/').pop() || fallback;
    const decoded = decodeURIComponent(last);
    const cleaned = decoded.replace(UUID_PREFIX_RE, '').replace(/^\d+-/, '');
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}
