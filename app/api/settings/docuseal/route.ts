import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { rateLimit } from '@/lib/security/rate-limit';
import {
  DOCUSEAL_HOSTS,
  DocusealError,
  isDocusealRegion,
  REGION_LABELS,
  regionFromBaseUrl,
  verifyDocusealKeyWithRegionFallback,
  type DocusealRegion,
} from '@/lib/docuseal/client';
import {
  credentialsFromSettings,
  decryptWebhookToken,
  encryptIntegrationSecret,
  loadDocusealSettings,
  newWebhookToken,
  publicAppOrigin,
  webhookUrlForToken,
  type DocusealSettingsRow,
} from '@/lib/docuseal/settings';

export const dynamic = 'force-dynamic';

async function ownerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx || ctx.role !== 'owner') return { error: NextResponse.json({ error: 'Réservé au propriétaire du compte' }, { status: 403 }) } as const;
  return { user, ctx } as const;
}

function serialize(settings: DocusealSettingsRow | null, origin: string) {
  if (!settings) return { configured: false, enabled: false, region: 'eu' as DocusealRegion, last4: null, verified_at: null, webhook_url: null };
  let webhookUrl: string | null = null;
  try {
    webhookUrl = webhookUrlForToken(origin, decryptWebhookToken(settings));
  } catch {
    webhookUrl = null;
  }
  return {
    configured: true,
    enabled: settings.enabled,
    region: regionFromBaseUrl(settings.api_base_url),
    last4: settings.api_key_last4,
    verified_at: settings.verified_at,
    webhook_url: webhookUrl,
  };
}

function docusealErrorResponse(error: unknown) {
  if (error instanceof DocusealError) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'unauthorized' || error.code === 'invalid_request' || error.code === 'not_found' ? 400 : 502 });
  }
  if (error instanceof Error && error.message.includes('INTEGRATION_SECRET_ENCRYPTION_KEY')) {
    return NextResponse.json({ error: 'Le chiffrement des intégrations n’est pas configuré sur le serveur (INTEGRATION_SECRET_ENCRYPTION_KEY).' }, { status: 500 });
  }
  console.error('DocuSeal settings', error);
  return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
}

// GET — état de l'intégration (jamais la clé en clair).
export async function GET(request: NextRequest) {
  const auth = await ownerContext();
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(serialize(await loadDocusealSettings(auth.ctx.organizationId), publicAppOrigin(request.url)));
  } catch (error) {
    return docusealErrorResponse(error);
  }
}

// PUT — enregistre / remplace la clé API (vérifiée en direct auprès de DocuSeal).
export async function PUT(request: NextRequest) {
  const auth = await ownerContext();
  if ('error' in auth) return auth.error;
  const { ctx, user } = auth;

  const limit = rateLimit(`docuseal-settings:${ctx.organizationId}`, 10, 10 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  const body = (await request.json().catch(() => null)) as { region?: unknown; api_key?: unknown } | null;
  const region = body?.region;
  if (!isDocusealRegion(region)) return NextResponse.json({ error: 'Région invalide' }, { status: 400 });

  try {
    const existing = await loadDocusealSettings(ctx.organizationId);
    const providedKey = typeof body?.api_key === 'string' ? body.api_key.trim() : '';
    if (providedKey && (providedKey.length < 10 || providedKey.length > 200 || /\s/.test(providedKey))) {
      return NextResponse.json({ error: 'Clé API invalide' }, { status: 400 });
    }
    // Sans nouvelle clé, on ne fait que changer la région (en revérifiant la clé existante).
    const apiKey = providedKey || (existing ? credentialsFromSettings(existing).apiKey : '');
    if (!apiKey) return NextResponse.json({ error: 'Clé API requise' }, { status: 400 });

    // Un compte docuseal.eu et un compte docuseal.com sont distincts : si la clé
    // appartient à l'autre région, on corrige automatiquement et on le signale.
    const detectedRegion = await verifyDocusealKeyWithRegionFallback(region, apiKey);
    const apiBaseUrl = DOCUSEAL_HOSTS[detectedRegion];

    const webhook = existing ? null : newWebhookToken();
    const now = new Date().toISOString();
    const row = {
      organization_id: ctx.organizationId,
      api_base_url: apiBaseUrl,
      api_key_encrypted: encryptIntegrationSecret(apiKey),
      api_key_last4: apiKey.slice(-4),
      verified_at: now,
      updated_by: user.id,
      updated_at: now,
      ...(webhook ? { webhook_token_encrypted: webhook.encrypted, webhook_token_hash: webhook.hash, enabled: false } : {}),
    };
    const { error } = await createServiceClient().from('organization_docuseal_settings').upsert(row, { onConflict: 'organization_id' });
    if (error) throw error;
    return NextResponse.json({
      ...serialize(await loadDocusealSettings(ctx.organizationId), publicAppOrigin(request.url)),
      region_corrected: detectedRegion !== region,
      notice: detectedRegion !== region
        ? `Cette clé correspond à un compte ${REGION_LABELS[detectedRegion]} : l’hébergement a été ajusté automatiquement.`
        : null,
    });
  } catch (error) {
    return docusealErrorResponse(error);
  }
}

// PATCH — { enabled } pour activer / désactiver, ou { regenerate_webhook: true }.
export async function PATCH(request: NextRequest) {
  const auth = await ownerContext();
  if ('error' in auth) return auth.error;
  const { ctx, user } = auth;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; regenerate_webhook?: unknown } | null;

  try {
    const existing = await loadDocusealSettings(ctx.organizationId);
    if (!existing) return NextResponse.json({ error: 'Enregistrez d’abord une clé API DocuSeal.' }, { status: 400 });

    const update: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() };
    if (typeof body?.enabled === 'boolean') {
      if (body.enabled && !existing.verified_at) return NextResponse.json({ error: 'La clé API doit être vérifiée avant l’activation.' }, { status: 400 });
      update.enabled = body.enabled;
    } else if (body?.regenerate_webhook === true) {
      const webhook = newWebhookToken();
      update.webhook_token_encrypted = webhook.encrypted;
      update.webhook_token_hash = webhook.hash;
    } else {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const { error } = await createServiceClient().from('organization_docuseal_settings').update(update).eq('organization_id', ctx.organizationId);
    if (error) throw error;
    return NextResponse.json(serialize(await loadDocusealSettings(ctx.organizationId), publicAppOrigin(request.url)));
  } catch (error) {
    return docusealErrorResponse(error);
  }
}

// DELETE — supprime la clé (la fonction est désactivée ; l'historique des signatures est conservé).
export async function DELETE(request: NextRequest) {
  const auth = await ownerContext();
  if ('error' in auth) return auth.error;
  try {
    const { error } = await createServiceClient().from('organization_docuseal_settings').delete().eq('organization_id', auth.ctx.organizationId);
    if (error) throw error;
    return NextResponse.json(serialize(null, publicAppOrigin(request.url)));
  } catch (error) {
    return docusealErrorResponse(error);
  }
}
