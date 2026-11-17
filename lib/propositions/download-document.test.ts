import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPropositionDocument } from './download-document';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('browser document download', () => {
  it('fetches the authenticated application route and downloads the exact blob without navigation', async () => {
    vi.useFakeTimers();
    const body = new Blob(['document bytes']);
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-disposition': "attachment; filename*=UTF-8''Offre%20%C3%A9t%C3%A9.docx" } }));
    vi.stubGlobal('fetch', fetch);
    const click = vi.fn(), remove = vi.fn();
    const link = { href: '', download: '', click, remove };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-document');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await downloadPropositionDocument('proposal-a', { variantId: 'variant-a', annexId: 'annex-a' });
    expect(fetch).toHaveBeenCalledWith('/api/propositions/proposal-a/download?variant=variant-a&annex=annex-a', { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('document bytes');
    expect(link.href).toBe('blob:local-document');
    expect(link.download).toBe('Offre été.docx');
    expect(click).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledWith('blob:local-document');
  });
  it('surfaces access failures instead of downloading an error page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Téléchargement non autorisé' }), { status: 403 })));
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(downloadPropositionDocument('proposal-a')).rejects.toThrow('Téléchargement non autorisé');
    expect(create).not.toHaveBeenCalled();
  });
  it('refuses an unexpected successful HTML response instead of saving a login or error page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Connexion</html>', { headers: { 'content-type': 'text/html' } })));
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(downloadPropositionDocument('proposal-a')).rejects.toThrow('Réponse de téléchargement invalide');
    expect(create).not.toHaveBeenCalled();
  });
});
