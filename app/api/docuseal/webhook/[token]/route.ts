import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { credentialsFromSettings, loadDocusealSettingsByWebhookToken } from '@/lib/docuseal/settings';
import { SIGNATURE_COLUMNS, syncSignature, type PropositionSignatureRow } from '@/lib/docuseal/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY_BYTES = 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HANDLED_EVENTS = new Set([
  'form.viewed',
  'form.started',
  'form.completed',
  'form.declined',
  'submission.completed',
  'submission.expired',
  'submission.archived',
]);

type WebhookPayload = {
  event_type?: unknown;
  data?: {
    id?: unknown;
    external_id?: unknown;
    submission_id?: unknown;
    submission?: { id?: unknown } | null;
  } | null;
};

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Webhook DocuSeal, configuré par chaque organisation dans sa console DocuSeal.
 * DocuSeal ne signe pas ses webhooks : l'authentification repose sur le token
 * secret de l'URL (propre à l'organisation). Le payload sert seulement à
 * identifier la soumission ; l'état est toujours relu via l'API DocuSeal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limit = rateLimit(`docuseal-webhook:${token.slice(0, 16)}`, 120, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const settings = await loadDocusealSettingsByWebhookToken(token).catch(() => null);
  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';
  // Événements non suivis (templates, etc.) : accusé de réception sans traitement.
  if (!HANDLED_EVENTS.has(eventType)) return NextResponse.json({ received: true });

  const data = payload.data ?? {};
  const submissionId = eventType.startsWith('submission.')
    ? positiveInt(data.id)
    : positiveInt(data.submission?.id) ?? positiveInt(data.submission_id);
  const externalId = typeof data.external_id === 'string' && UUID_RE.test(data.external_id) ? data.external_id : null;
  if (!submissionId && !externalId) return NextResponse.json({ received: true });

  const service = createServiceClient();
  let query = service.from('proposition_signatures').select(SIGNATURE_COLUMNS).eq('organization_id', settings.organization_id);
  query = submissionId ? query.eq('submission_id', submissionId) : query.eq('id', externalId!);
  const { data: row, error } = await query.maybeSingle();
  if (error) {
    console.error('Webhook DocuSeal : lecture signature', error.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  // Soumission créée hors de l'application : rien à faire.
  if (!row) return NextResponse.json({ received: true });

  try {
    if (!settings.verified_at) return NextResponse.json({ received: true });
    await syncSignature(credentialsFromSettings(settings), row as PropositionSignatureRow);
    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 → DocuSeal réessaie (jusqu'à 48 h).
    console.error('Webhook DocuSeal : synchronisation', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
