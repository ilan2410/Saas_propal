import { describe, expect, it } from 'vitest';
import { readLimitedResponse } from './read-limited-response';

describe('bounded document download', () => {
  it('enforces the streamed size even without a Content-Length', async () => {
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); controller.close(); },
    }));
    await expect(readLimitedResponse(response, 5)).rejects.toThrow('trop volumineux');
  });
  it('accepts a small document at the exact limit', async () => {
    const bytes = await readLimitedResponse(new Response(new Uint8Array([1, 2, 3])), 3);
    expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3]);
  });
});
