import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocxSubmission, DocusealError, isPublicHttpsUrl, regionFromBaseUrl, verifyDocusealKeyWithRegionFallback } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubHosts(validHost: string | null) {
  const fetchMock = vi.fn(async (url: string) => {
    const ok = validHost !== null && url.startsWith(validHost);
    return { ok, status: ok ? 200 : 401, json: async () => (ok ? [] : { error: 'Not authenticated' }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('verifyDocusealKeyWithRegionFallback', () => {
  it('garde la région choisie quand la clé y est valide', async () => {
    const fetchMock = stubHosts('https://api.docuseal.eu');
    await expect(verifyDocusealKeyWithRegionFallback('eu', 'k')).resolves.toBe('eu');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('détecte un compte docuseal.com saisi avec la région Europe', async () => {
    stubHosts('https://api.docuseal.com');
    await expect(verifyDocusealKeyWithRegionFallback('eu', 'k')).resolves.toBe('us');
  });

  it('détecte un compte docuseal.eu saisi avec la région US', async () => {
    stubHosts('https://api.docuseal.eu');
    await expect(verifyDocusealKeyWithRegionFallback('us', 'k')).resolves.toBe('eu');
  });

  it('refuse une clé invalide partout', async () => {
    stubHosts(null);
    await expect(verifyDocusealKeyWithRegionFallback('eu', 'k')).rejects.toBeInstanceOf(DocusealError);
  });
});

describe('regionFromBaseUrl', () => {
  it('reconnaît les deux hôtes cloud', () => {
    expect(regionFromBaseUrl('https://api.docuseal.eu')).toBe('eu');
    expect(regionFromBaseUrl('https://api.docuseal.com')).toBe('us');
  });
});

describe('isPublicHttpsUrl', () => {
  it('accepte les liens de fichiers DocuSeal', () => {
    expect(isPublicHttpsUrl('https://docuseal.eu/file/abc/doc.pdf')).toBe(true);
  });

  it('refuse http, localhost, IP privées et identifiants', () => {
    for (const url of ['http://docuseal.eu/f', 'https://localhost/f', 'https://10.0.0.5/f', 'https://169.254.169.254/x', 'https://[::1]/f', 'https://u:p@docuseal.eu/f']) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });
});

describe('createDocxSubmission', () => {
  function captureBody() {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 1, submitters: [] }) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  }
  const base = { name: 'Prop', signer: { name: 'Jean', email: 'j@x.fr', externalId: 'id' } };
  const credentials = { apiBaseUrl: 'https://api.docuseal.eu', apiKey: 'k' };

  it('envoie les fichiers Word dans l’ordre et demande un PDF signé unique', async () => {
    const body = captureBody();
    await createDocxSubmission(credentials, { ...base, documents: [{ name: 'Prop.docx', docxBase64: 'A' }, { name: 'Annexe.docx', docxBase64: 'B' }] });
    const sent = body();
    expect(sent.documents).toEqual([{ name: 'Prop.docx', file: 'A', position: 0 }, { name: 'Annexe.docx', file: 'B', position: 1 }]);
    expect(sent.merge_documents).toBe(true);
    expect(sent.send_email).toBe(true);
  });

  it('ne fusionne pas quand il n’y a qu’un seul fichier', async () => {
    const body = captureBody();
    await createDocxSubmission(credentials, { ...base, documents: [{ name: 'Prop.docx', docxBase64: 'A' }] });
    expect(body().merge_documents).toBeUndefined();
  });
});
