import { MAX_UPLOAD_SIZE_BYTES } from './validate-upload';

/** Enforce the limit while streaming, including when Content-Length is absent or false. */
export async function readLimitedResponse(response: Response, limit = MAX_UPLOAD_SIZE_BYTES): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error('Impossible de charger le document');
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Document trop volumineux');
  }
  if (!response.body) throw new Error('Document vide');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Document trop volumineux');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (!length) throw new Error('Document vide');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}
