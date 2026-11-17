import 'server-only';
import { isIP } from 'node:net';

// Client minimal pour l'API DocuSeal (https://www.docuseal.com/docs/api).
// Chaque organisation utilise sa propre clé API (header X-Auth-Token) et son
// région (cloud EU docuseal.eu ou cloud US docuseal.com : comptes distincts).

export const DOCUSEAL_HOSTS = {
  eu: 'https://api.docuseal.eu',
  us: 'https://api.docuseal.com',
} as const;

export type DocusealRegion = keyof typeof DOCUSEAL_HOSTS;

/** Rôle du signataire, identique dans les balises du document et dans `submitters`. */
export const DOCUSEAL_SIGNER_ROLE = 'Client';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;

export interface DocusealCredentials {
  apiBaseUrl: string;
  apiKey: string;
}

export class DocusealError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: 'unauthorized' | 'not_found' | 'invalid_request' | 'network' | 'server') {
    super(message);
    this.name = 'DocusealError';
  }
}

export interface DocusealSubmitter {
  id: number;
  submission_id?: number;
  email: string | null;
  name?: string | null;
  slug?: string;
  status?: string;
  external_id?: string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
  documents?: { name: string; url: string }[];
}

export interface DocusealSubmission {
  id: number;
  status?: string;
  expire_at?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  audit_log_url?: string | null;
  combined_document_url?: string | null;
  documents?: { name: string; url: string }[];
  submitters: DocusealSubmitter[];
}

function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * URL https publique (pas d'identifiants, pas d'IP privée / localhost). Protection
 * SSRF basique pour les liens de documents renvoyés par DocuSeal.
 */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) return false;
  if (ipVersion === 6) return false;
  return true;
}

export function isDocusealRegion(value: unknown): value is DocusealRegion {
  return value === 'eu' || value === 'us';
}

export function regionFromBaseUrl(apiBaseUrl: string): DocusealRegion {
  return apiBaseUrl === DOCUSEAL_HOSTS.us ? 'us' : 'eu';
}

export const REGION_LABELS: Record<DocusealRegion, string> = {
  eu: 'DocuSeal Europe (docuseal.eu)',
  us: 'DocuSeal US (docuseal.com)',
};

/**
 * Vérifie la clé sur la région choisie ; si elle y est refusée, essaie l'autre
 * région (un compte docuseal.eu et un compte docuseal.com sont distincts).
 * Renvoie la région où la clé est valide.
 */
export async function verifyDocusealKeyWithRegionFallback(region: DocusealRegion, apiKey: string): Promise<DocusealRegion> {
  try {
    await verifyDocusealCredentials({ apiBaseUrl: DOCUSEAL_HOSTS[region], apiKey });
    return region;
  } catch (error) {
    if (!(error instanceof DocusealError && error.code === 'unauthorized')) throw error;
    const other: DocusealRegion = region === 'eu' ? 'us' : 'eu';
    try {
      await verifyDocusealCredentials({ apiBaseUrl: DOCUSEAL_HOSTS[other], apiKey });
      return other;
    } catch {
      throw error;
    }
  }
}

async function docusealFetch<T>(credentials: DocusealCredentials, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${credentials.apiBaseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'X-Auth-Token': credentials.apiKey,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new DocusealError('DocuSeal est injoignable. Vérifiez l’URL de l’API.', null, 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Le corps d'erreur DocuSeal est de la forme { error: "..." } ; on ne remonte
    // qu'un message court, jamais la clé.
    let detail = '';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === 'string') detail = body.error.slice(0, 300);
    } catch {
      // corps non JSON
    }
    if (response.status === 401 || response.status === 403) {
      throw new DocusealError('Clé API DocuSeal refusée (vérifiez la clé et votre abonnement Pro).', response.status, 'unauthorized');
    }
    if (response.status === 404) throw new DocusealError(detail || 'Ressource DocuSeal introuvable.', 404, 'not_found');
    if (response.status >= 400 && response.status < 500) {
      throw new DocusealError(detail || `Requête refusée par DocuSeal (${response.status}).`, response.status, 'invalid_request');
    }
    throw new DocusealError(`Erreur DocuSeal (${response.status}).`, response.status, 'server');
  }

  return (await response.json()) as T;
}

/** Vérifie la clé avec un appel peu coûteux. */
export async function verifyDocusealCredentials(credentials: DocusealCredentials): Promise<void> {
  await docusealFetch(credentials, '/templates?limit=1');
}

export interface CreateDocxSubmissionInput {
  name: string;
  /** Fichiers Word envoyés, dans l'ordre (proposition puis annexes). */
  documents: { name: string; docxBase64: string }[];
  signer: { name: string; email: string; externalId: string };
  /** Valeurs pré-remplies, par nom de champ (uniquement des champs présents dans le document). */
  values?: Record<string, string>;
  message?: { subject: string; body: string };
  expireAt?: Date | null;
}

function formatExpireAt(date: Date): string {
  // Format documenté : "2024-09-01 12:00:00 UTC"
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export async function createDocxSubmission(credentials: DocusealCredentials, input: CreateDocxSubmissionInput): Promise<DocusealSubmission> {
  return docusealFetch<DocusealSubmission>(credentials, '/submissions/docx', {
    method: 'POST',
    body: {
      name: input.name,
      send_email: true,
      remove_tags: true,
      ...(input.expireAt ? { expire_at: formatExpireAt(input.expireAt) } : {}),
      ...(input.message ? { message: input.message } : {}),
      // Plusieurs fichiers Word : DocuSeal les convertit et renvoie un seul PDF signé.
      ...(input.documents.length > 1 ? { merge_documents: true } : {}),
      documents: input.documents.map((doc, position) => ({ name: doc.name, file: doc.docxBase64, position })),
      submitters: [
        {
          role: DOCUSEAL_SIGNER_ROLE,
          name: input.signer.name,
          email: input.signer.email,
          external_id: input.signer.externalId,
          send_email: true,
          ...(input.values && Object.keys(input.values).length ? { values: input.values } : {}),
        },
      ],
    },
  });
}

export async function getDocusealSubmission(credentials: DocusealCredentials, submissionId: number): Promise<DocusealSubmission> {
  return docusealFetch<DocusealSubmission>(credentials, `/submissions/${encodeURIComponent(String(submissionId))}`);
}

export async function archiveDocusealSubmission(credentials: DocusealCredentials, submissionId: number): Promise<void> {
  await docusealFetch(credentials, `/submissions/${encodeURIComponent(String(submissionId))}`, { method: 'DELETE' });
}

/** Télécharge un fichier signé (lien DocuSeal valable ~40 min). */
export async function downloadDocusealFile(url: string): Promise<Uint8Array> {
  if (!isPublicHttpsUrl(url)) throw new DocusealError('URL de document DocuSeal refusée.', null, 'invalid_request');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Les liens de fichiers DocuSeal redirigent vers le stockage objet : on suit
    // la redirection mais on re-valide l'URL finale.
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new DocusealError(`Téléchargement du document signé impossible (${response.status}).`, response.status, 'server');
    if (!isPublicHttpsUrl(response.url || url)) throw new DocusealError('Redirection de document refusée.', null, 'invalid_request');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) throw new DocusealError('Document signé trop volumineux.', null, 'invalid_request');
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new DocusealError('Document signé trop volumineux.', null, 'invalid_request');
    return buffer;
  } catch (error) {
    if (error instanceof DocusealError) throw error;
    throw new DocusealError('Téléchargement du document signé impossible.', null, 'network');
  } finally {
    clearTimeout(timer);
  }
}
