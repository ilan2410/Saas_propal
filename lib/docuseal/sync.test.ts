import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }));

import { deriveSignatureStatus } from './sync';
import type { DocusealSubmission } from './client';

function submission(partial: Partial<DocusealSubmission> = {}, submitter: Record<string, unknown> = {}): DocusealSubmission {
  return { id: 1, status: 'pending', submitters: [{ id: 10, email: 'a@b.fr', status: 'sent', ...submitter }], ...partial } as DocusealSubmission;
}

describe('deriveSignatureStatus', () => {
  const now = new Date('2026-11-17T12:00:00Z');

  it('envoyée par défaut', () => {
    expect(deriveSignatureStatus(submission(), 10, now).status).toBe('sent');
  });

  it('ouverte quand le signataire a consulté le document', () => {
    expect(deriveSignatureStatus(submission({}, { opened_at: '2026-11-17T10:00:00Z' }), 10, now).status).toBe('opened');
  });

  it('signée prioritaire sur les autres états', () => {
    const result = deriveSignatureStatus(submission({ expire_at: '2026-11-01T00:00:00Z' }, { opened_at: 'x', completed_at: '2026-11-17T11:00:00Z' }), 10, now);
    expect(result.status).toBe('completed');
    expect(result.completed_at).toBe('2026-11-17T11:00:00Z');
  });

  it('refusée', () => {
    expect(deriveSignatureStatus(submission({}, { declined_at: '2026-11-17T11:00:00Z' }), 10, now).status).toBe('declined');
  });

  it('expirée quand la date limite est passée', () => {
    expect(deriveSignatureStatus(submission({ expire_at: '2026-11-16T00:00:00Z' }), 10, now).status).toBe('expired');
  });

  it('annulée quand la soumission est archivée', () => {
    expect(deriveSignatureStatus(submission({ archived_at: '2026-11-16T00:00:00Z' }), 10, now).status).toBe('cancelled');
  });
});
