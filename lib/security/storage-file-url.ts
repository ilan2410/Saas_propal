/** Browser links go through a session-authenticated route; canonical URLs remain in the database. */
export function storageFileUrl(value: string): string {
  try {
    const url = new URL(value);
    if (/^\/storage\/v1\/object\/(public|sign|authenticated)\/(templates|documents|propositions)\//.test(url.pathname)) {
      return `/api/storage/file?url=${encodeURIComponent(value)}`;
    }
  } catch { /* Other application links are left intact. */ }
  return value;
}
