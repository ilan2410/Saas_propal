import type { SupabaseClient } from '@supabase/supabase-js';

/** Parse only this project's Storage object URLs; never trust a substring or a host supplied by a caller. */
export function storagePathFromUrl(value: string, bucket: string): string | null {
  try {
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password) return null;
    const prefix = `/storage/v1/object/`;
    const match = url.pathname.slice(prefix.length).match(/^(public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!url.pathname.startsWith(prefix) || !match || match[2] !== bucket) return null;
    const key = decodeURIComponent(match[3]);
    if (!isSafeStorageKey(key)) return null;
    return key;
  } catch {
    return null;
  }
}

export function isSafeStorageKey(key: string): boolean {
  return !/[\\%\x00-\x1f\x7f]/.test(key) && key.split('/').every((segment) => !!segment && segment !== '.' && segment !== '..');
}

export function isOrganizationStorageKey(key: string, organizationId: string): boolean {
  if (!isSafeStorageKey(key)) return false;
  const parts = key.split('/');
  return (parts[0] === organizationId && parts.length > 1)
    || (parts[0] === 'generated' && parts[1] === organizationId && parts.length > 2);
}

export function organizationStoragePath(value: string, bucket: string, organizationId: string): string | null {
  const key = storagePathFromUrl(value, bucket);
  return key && isOrganizationStorageKey(key, organizationId) ? key : null;
}

/** Check both tenant ownership and the acting user's Storage RLS before saving a source reference. */
export async function validateSourceDocuments(supabase: SupabaseClient, value: unknown, organizationId: string): Promise<string[] | null> {
  if (!Array.isArray(value) || value.some((url) => typeof url !== 'string')) return null;
  for (const url of value as string[]) {
    const key = organizationStoragePath(url, 'documents', organizationId);
    if (!key) return null;
    const { data, error } = await supabase.storage.from('documents').info(key);
    if (error || !data) return null;
  }
  return value as string[];
}

export async function signedOrganizationStorageUrl(supabase: SupabaseClient, url: string, bucket: string, organizationId: string): Promise<string> {
  const key = organizationStoragePath(url, bucket, organizationId);
  if (!key) throw new Error('storage_object_forbidden');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, 60);
  if (error || !data?.signedUrl) throw new Error('storage_object_forbidden');
  return data.signedUrl;
}
