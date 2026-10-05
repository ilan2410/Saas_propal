import Anthropic from '@anthropic-ai/sdk';
import { fileTypeFromBuffer } from 'file-type';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import { assertAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { ClaudeCallError } from '@/lib/ai/claude-errors';
import type { ClaudeCallUsage } from '@/lib/ai/claude-pricing';

const MODEL = 'deepseek-flash';
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGES = 600;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

type Content = Anthropic.Messages.ContentBlockParam[];

export function validateDeepSeekApiKey(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export async function prepareDocumentsForDeepSeek(urls: string[]): Promise<Content> {
  const content: Content = [];
  let images = 0;
  let bodyBytes = 0;
  const addImage = (buffer: Buffer, mime: string, index: number, page: number) => {
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error(`Image du document ${index + 1} trop volumineuse pour DeepSeek (32 Mio maximum).`);
    if (++images > MAX_IMAGES) throw new Error('Trop de pages ou photos pour DeepSeek (600 images maximum).');
    const data = buffer.toString('base64');
    bodyBytes += data.length + 256;
    if (bodyBytes > MAX_BODY_BYTES) throw new Error('Documents trop volumineux pour DeepSeek. Réduisez le nombre ou la résolution des pages.');
    content.push({ type: 'text', text: `Document ${index + 1} (document_index: ${index}), page ${page} :` });
    content.push({ type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data } });
  };

  for (const [index, url] of urls.entries()) {
    assertAllowedFetchUrl(url);
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`Échec téléchargement document ${index + 1}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    if (detected?.mime === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const { total } = await parser.getInfo();
        if (!total) throw new Error(`PDF du document ${index + 1} vide.`);
        if (images + total > MAX_IMAGES) throw new Error('Trop de pages ou photos pour DeepSeek (600 images maximum).');
        for (let page = 1; page <= total; page++) {
          const result = await parser.getScreenshot({ partial: [page], scale: 1.5, imageDataUrl: false });
          addImage(Buffer.from(result.pages[0].data), 'image/png', index, page);
        }
      } finally {
        await parser.destroy();
      }
    } else if (detected && IMAGE_TYPES.includes(detected.mime)) {
      addImage(buffer, detected.mime, index, 1);
    } else {
      throw new Error(`Type de document ${index + 1} non pris en charge par DeepSeek.`);
    }
  }
  return content;
}

export async function callDeepSeekStructured<T extends z.ZodType>(options: {
  prompt: string;
  schema: T;
  toolName: string;
  maxTokens: number;
  documents?: Content;
}): Promise<{ data: z.infer<T>; usage: ClaudeCallUsage }> {
  if (!validateDeepSeekApiKey()) throw new Error('DEEPSEEK_API_KEY non configurée');
  const client = new Anthropic({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: 'https://api.deepseek.com/anthropic' });
  const content: Content = [...(options.documents ?? []), { type: 'text', text: options.prompt }];
  const inputSchema = z.toJSONSchema(options.schema) as Anthropic.Messages.Tool.InputSchema;
  const message = await client.messages.stream({
    model: MODEL,
    max_tokens: options.maxTokens,
    messages: [{ role: 'user', content }],
    tools: [{ name: options.toolName, description: 'Retourne les données extraites au format structuré.', input_schema: inputSchema }],
    tool_choice: { type: 'any' },
  }).finalMessage();
  const usage: ClaudeCallUsage = {
    model: MODEL,
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
  };
  const block = message.content.find((item) => item.type === 'tool_use' && item.name === options.toolName);
  const result = block?.type === 'tool_use' ? options.schema.safeParse(block.input) : null;
  if (!result?.success) {
    throw new ClaudeCallError(`DeepSeek n'a pas retourné de résultat structuré valide (${options.toolName}).`, usage);
  }
  return { data: result.data, usage };
}
