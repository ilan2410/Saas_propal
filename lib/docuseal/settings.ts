import 'server-only';
import { randomBytes } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, sha256Hex } from '@/lib/security/secret-crypto';
import type { DocusealCredentials } from './client';

export const INTEGRATION_KEY_ENV = 'INTEGRATION_SECRET_ENCRYPTION_KEY';

export interface DocusealSettingsRow {
  organization_id: string;
  enabled: boolean;
  api_base_url: string;
  api_key_encrypted: string;
  api_key_last4: string;
  webhook_token_encrypted: string;
  webhook_token_hash: string;
  verified_at: string | null;
  updated_at: string;
}

const COLUMNS = 'organization_id, enabled, api_base_url, api_key_encrypted, api_key_last4, webhook_token_encrypted, webhook_token_hash, verified_at, updated_at';

export async function loadDocusealSettings(organizationId: string): Promise<DocusealSettingsRow | null> {
  const { data, error } = await createServiceClient()
    .from('organization_docuseal_settings')
    .select(COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data as DocusealSettingsRow | null) ?? null;
}

export async function loadDocusealSettingsByWebhookToken(token: string): Promise<DocusealSettingsRow | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const { data, error } = await createServiceClient()
    .from('organization_docuseal_settings')
    .select(COLUMNS)
    .eq('webhook_token_hash', sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  return (data as DocusealSettingsRow | null) ?? null;
}

/** Vrai si l'organisation peut envoyer en signature (activée + clé vérifiée). */
export function isSignatureAvailable(settings: DocusealSettingsRow | null): settings is DocusealSettingsRow {
  return !!settings && settings.enabled && !!settings.verified_at;
}

export function credentialsFromSettings(settings: DocusealSettingsRow): DocusealCredentials {
  return { apiBaseUrl: settings.api_base_url, apiKey: decryptSecret(settings.api_key_encrypted, INTEGRATION_KEY_ENV) };
}

export function encryptIntegrationSecret(value: string): string {
  return encryptSecret(value, INTEGRATION_KEY_ENV);
}

export function decryptWebhookToken(settings: DocusealSettingsRow): string {
  return decryptSecret(settings.webhook_token_encrypted, INTEGRATION_KEY_ENV);
}

export function newWebhookToken(): { token: string; encrypted: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, encrypted: encryptIntegrationSecret(token), hash: sha256Hex(token) };
}

export function webhookUrlForToken(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/api/docuseal/webhook/${token}`;
}

/** Origine publique de l'application (pour l'URL de webhook à copier dans DocuSeal). */
export function publicAppOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // valeur invalide : on retombe sur l'URL de la requête
    }
  }
  return new URL(requestUrl).origin;
}
