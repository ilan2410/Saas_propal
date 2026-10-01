import { afterEach, describe, expect, it, vi } from 'vitest';
import PizZip from 'pizzip';
import { generatePropositionFile } from './index';

const upload = vi.fn().mockResolvedValue({ error: null });
const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.test/generated.docx' } });
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ upload, getPublicUrl }) } }),
}));

function makeDocx(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{societe}} - {{sp_reference}} - {{sp_date_limite_souscription-15}}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('generatePropositionFile Word', () => {
  it('rend un DOCX avec mapping, référence et date dynamique sans dépendre du rendu Excel', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const docx = makeDocx();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Uint8Array.from(docx).buffer }));
    const url = await generatePropositionFile({
      template: {
        id: 'template-word', file_type: 'word', file_url: 'https://storage.example.test/template.docx',
        file_config: { fieldMappings: { '{{societe}}': 'client.raison_sociale' } }, champs_actifs: [],
      },
      donnees: { client: { raison_sociale: 'SOCIÉTÉ TEST' } },
      organization_id: 'org-1', proposition_id: 'prop-1',
      proposition_created_at: '2026-09-07T00:00:00.000Z', sp_reference: 'REF-42',
    });
    expect(url).toBe('https://example.test/generated.docx');
    expect(upload).toHaveBeenCalledOnce();
    const [path, bytes, config] = upload.mock.calls[0];
    expect(path).toMatch(/^generated\/org-1\/Propal_SOCIT_TEST_\d+\.docx$/);
    expect(config.contentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const xml = new PizZip(Buffer.from(bytes)).file('word/document.xml')!.asText();
    expect(xml).toContain('Société Test');
    expect(xml).toContain('REF-42');
    expect(xml).toContain('22/09/2026');
  });
});
