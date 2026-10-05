import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  messages = { stream };
} }));

import { callDeepSeekStructured, prepareDocumentsForDeepSeek } from './deepseek';
import { analyzeInvoicesForSa, structureSaAnalysis } from './claude';
import { StructuredSaAiSchema } from '@/lib/sa/structure-sa';
import type { CanonicalSaAnalysis } from '@/lib/sa/invoice-analysis';
import nextConfig from '../../next.config';

const url = 'https://storage.example.test/files/source';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bC9kAAAAASUVORK5CYII=', 'base64');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  stream.mockReset();
});

describe('DeepSeek SA', () => {
  it('laisse le rendu PDF et son worker hors du bundle Next', () => {
    expect(nextConfig.serverExternalPackages).toEqual(expect.arrayContaining(['pdf-parse', '@napi-rs/canvas']));
  });

  it('conserve les index et les pages d’un PDF multipage et d’une photo', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const pdf = await PDFDocument.create();
    const scan = await pdf.embedPng(png);
    pdf.addPage([200, 200]).drawImage(scan, { x: 20, y: 20, width: 160, height: 160 });
    pdf.addPage([200, 200]).drawText('Facture 2', { x: 20, y: 150 });
    const bytes = await pdf.save();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from(bytes), { status: 200 }))
      .mockResolvedValueOnce(new Response(png, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const content = await prepareDocumentsForDeepSeek([url, `${url}-image`]);
    expect(fetch).toHaveBeenCalledWith(url, { redirect: 'error' });
    expect(content.filter((part) => part.type === 'image')).toHaveLength(3);
    expect(content.filter((part) => part.type === 'text').map((part) => part.type === 'text' ? part.text : '')).toEqual([
      'Document 1 (document_index: 0), page 1 :',
      'Document 1 (document_index: 0), page 2 :',
      'Document 2 (document_index: 1), page 1 :',
    ]);
  });

  it('utilise DeepSeek sur les deux étapes SA et garde le format métier', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { status: 200 })));
    const report = { summary: 'Facture de test', declared_monthly_total_ht: 0, invoices: [], field_coverage: [] };
    const structure = {
      mapped_fields: [], fournisseur: '',
      client: Object.fromEntries(Object.keys(StructuredSaAiSchema.shape.client.shape).map((key) => [key, ''])),
      situation_actuelle: { documents: [], operateurs: [], leasers: [], sites: [], lignes: [], engagements: [] },
      resume: 'Facture de test',
    };
    for (const [name, data] of [['analyse_sa', report], ['structure_sa', structure]] as const) {
      stream.mockReturnValueOnce({ finalMessage: async () => ({
        content: [{ type: 'tool_use', name, input: data }],
        usage: { input_tokens: 50, output_tokens: 20 },
      }) });
    }
    const analysis = await analyzeInvoicesForSa({ documents_urls: [url], active_fields: [], claude_model: 'deepseek-flash' });
    const structured = await structureSaAnalysis({ report: analysis.data, canonical: {} as CanonicalSaAnalysis, active_fields: [], claude_model: 'deepseek-flash' });
    expect(analysis.data).toMatchObject(report);
    expect(structured.data.resume).toBe('Facture de test');
    expect(stream.mock.calls.map(([request]) => request.tool_choice)).toEqual([{ type: 'any' }, { type: 'any' }]);
    expect(stream.mock.calls.map(([request]) => request.tools.map((tool: { name: string }) => tool.name))).toEqual([['analyse_sa'], ['structure_sa']]);
    expect(stream.mock.calls[0][0].messages[0].content.some((part: { type: string }) => part.type === 'image')).toBe(true);
    expect(stream.mock.calls[1][0].messages[0].content.every((part: { type: string }) => part.type !== 'image')).toBe(true);
  });

  it('rejette les URLs externes avant téléchargement', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(prepareDocumentsForDeepSeek(['https://other.example.test/file.png'])).rejects.toThrow('URL non autorisée');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('force le schéma de sortie et conserve les tokens facturés', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    stream.mockReturnValue({ finalMessage: async () => ({
      content: [{ type: 'tool_use', name: 'analyse_sa', input: { total: 12 } }],
      usage: { input_tokens: 100, output_tokens: 30 },
    }) });
    const result = await callDeepSeekStructured({ prompt: 'Analyse JSON', schema: z.object({ total: z.number() }), toolName: 'analyse_sa', maxTokens: 400 });
    expect(result.data).toEqual({ total: 12 });
    expect(result.usage).toMatchObject({ model: 'deepseek-flash', inputTokens: 100, outputTokens: 30 });
    expect(stream.mock.calls[0][0]).toMatchObject({ model: 'deepseek-flash', tool_choice: { type: 'any' }, tools: [{ name: 'analyse_sa' }] });
  });

  it('transporte la consommation en cas de résultat invalide', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    stream.mockReturnValue({ finalMessage: async () => ({
      content: [{ type: 'tool_use', name: 'structure_sa', input: { total: 'incorrect' } }],
      usage: { input_tokens: 80, output_tokens: 15 },
    }) });
    await expect(callDeepSeekStructured({ prompt: 'JSON', schema: z.object({ total: z.number() }), toolName: 'structure_sa', maxTokens: 400 }))
      .rejects.toMatchObject({ usage: { model: 'deepseek-flash', inputTokens: 80, outputTokens: 15 } });
  });
});
