import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { organizationStoragePath, signedOrganizationStorageUrl, storagePathFromUrl, validateSourceDocuments } from './storage-access';

const org = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const url = (key: string, bucket = 'documents') => `https://project.test/storage/v1/object/public/${bucket}/${key}`;
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.test'));
afterEach(() => vi.unstubAllEnvs());

function client() {
  const info = vi.fn().mockResolvedValue({ data: { size: 123 }, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://project.test/authorized' }, error: null });
  const from = vi.fn().mockReturnValue({ info, createSignedUrl });
  return { supabase: { storage: { from } } as unknown as SupabaseClient, from, info, createSignedUrl };
}

describe('tenant storage access', () => {
  it('accepts canonical, signed and generated paths for the resolved organization', () => {
    expect(organizationStoragePath(url(`${org}/invoice.pdf`), 'documents', org)).toBe(`${org}/invoice.pdf`);
    expect(organizationStoragePath(url(`generated/${org}/offer.docx`, 'templates'), 'templates', org)).toBe(`generated/${org}/offer.docx`);
    expect(storagePathFromUrl(url(`${org}/invoice.pdf`).replace('/public/', '/sign/') + '?token=secret', 'documents')).toBe(`${org}/invoice.pdf`);
  });
  it.each([
    `https://evil.test/documents/${org}/invoice.pdf`,
    url(`${other}/invoice.pdf`),
    url(`${org}/%2e%2e%2f${other}/invoice.pdf`),
    url(`${org}/%252e%252e/invoice.pdf`),
    url(`${org}/%5cinvoice.pdf`),
    url(`${org}/%00invoice.pdf`),
    url(`${org}/invoice.pdf`).replace('https:', 'http:'),
    url(`${org}/invoice.pdf`).replace('project.test', 'project.test:444'),
    url(`${org}/invoice.pdf`).replace('project.test', 'user:pass@project.test'),
    url(`${org}/invoice.pdf`, 'templates'),
  ])('rejects foreign origins, tenants, buckets and ambiguous paths: %s', (value) => {
    expect(organizationStoragePath(value, 'documents', org)).toBeNull();
  });
  it('rejects another tenant before using a privileged signer', async () => {
    const mock = client();
    await expect(signedOrganizationStorageUrl(mock.supabase, url(`${other}/invoice.pdf`), 'documents', org)).rejects.toThrow('storage_object_forbidden');
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('checks user Storage RLS before persisting document references', async () => {
    const mock = client();
    const own = url(`${org}/invoice.pdf`);
    expect(await validateSourceDocuments(mock.supabase, [own], org)).toEqual([own]);
    expect(mock.info).toHaveBeenCalledWith(`${org}/invoice.pdf`);
    mock.info.mockResolvedValueOnce({ data: null, error: { message: 'Forbidden' } });
    expect(await validateSourceDocuments(mock.supabase, [own], org)).toBeNull();
  });
  it('rejects malformed document arrays and foreign references without metadata/network requests', async () => {
    const mock = client();
    for (const value of [null, 'url', [12], [url(`${other}/invoice.pdf`)]]) {
      expect(await validateSourceDocuments(mock.supabase, value, org)).toBeNull();
    }
    expect(mock.info).not.toHaveBeenCalled();
  });
  it('does not return a URL if Storage denies signing', async () => {
    const mock = client();
    mock.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Forbidden' } });
    await expect(signedOrganizationStorageUrl(mock.supabase, url(`${org}/invoice.pdf`), 'documents', org)).rejects.toThrow('storage_object_forbidden');
  });
});
