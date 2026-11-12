import { describe, expect, it } from 'vitest';
import { sameOriginRedirect } from './safe-redirect';

describe('post-auth navigation', () => {
  it.each([null, '//other.test', '/\\other.test', '/\n/other.test', 'https://other.test', 'javascript:void(0)'])('rejects %j', (target) => {
    expect(sameOriginRedirect(target, 'https://app.test')).toBeNull();
  });
  it('keeps a local path and its parameters', () => {
    expect(sameOriginRedirect('/propositions?q=demo#details', 'https://app.test')).toBe('/propositions?q=demo#details');
  });
});
