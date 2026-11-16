import type { OrgContext } from '@/lib/auth/org-context';
import type { ClientConfigPermissions } from '@/types';

export const CLIENT_CONFIG_PERMISSION_KEYS: (keyof ClientConfigPermissions)[] = [
  'templates',
  'sp_questions',
  'sp_mode_direct',
  'sp_objectifs',
  'sp_reference',
  'sp_mode_client',
  'sp_apparence',
  'sp_preferences_produits',
  'sp_ordre_categories',
  'sp_libelles',
  'sp_calcul_loyer',
  'sp_calcul_resiliation',
  'sp_remises_operateurs',
  'sp_codes_promo',
];

export const DEFAULT_CLIENT_CONFIG_PERMISSIONS: ClientConfigPermissions = {
  templates: false,
  sp_questions: false,
  sp_mode_direct: false,
  sp_objectifs: false,
  sp_reference: false,
  sp_mode_client: false,
  sp_apparence: false,
  sp_preferences_produits: false,
  sp_ordre_categories: false,
  sp_libelles: false,
  sp_calcul_loyer: false,
  sp_calcul_resiliation: false,
  sp_remises_operateurs: false,
  sp_codes_promo: false,
};

export function resolveClientConfigPermissions(preferences: unknown): ClientConfigPermissions {
  const prefs = isPlainRecord(preferences) ? preferences : {};
  const fallback = prefs.client_config_enabled === true;
  const rawPerms = isPlainRecord(prefs.client_config_permissions) ? prefs.client_config_permissions : {};
  return CLIENT_CONFIG_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = typeof rawPerms[key] === 'boolean' ? rawPerms[key] : fallback;
    return acc;
  }, {} as ClientConfigPermissions);
}

export const CLIENT_TEMPLATE_COLUMNS = 'id, organization_id, secteur, nom, description, file_url, file_name, file_type, file_size_mb, file_config, champs_actifs, merge_config, statut, test_result, created_at, updated_at';

const ORGANIZATION_FIELDS = ['id', 'nom', 'email', 'secteur', 'champs_defaut', 'logo_url', 'contact_prenom', 'contact_nom', 'telephone_fixe', 'telephone_mobile', 'siret', 'adresse', 'code_postal', 'ville', 'pdf_header_logo_url', 'pdf_footer_text', 'sp_questions', 'note_title_template', 'created_at', 'updated_at', 'onboarding_completed', 'onboarding_completed_at', 'onboarding_tours_seen'];
const BILLING_FIELDS = ['credits', 'tarif_par_proposition', 'tarif_clone_site', 'numero_tva', 'nom_facturation', 'adresse_facturation', 'email_facturation', 'adresse_ligne1_facturation', 'adresse_ligne2_facturation', 'ville_facturation', 'code_postal_facturation', 'pays_facturation', 'telephone_facturation'];

const INTERNAL_FILE_CONFIG_KEYS = ['claude_effort'] as const;
const CLIENT_BLOCKING_ISSUE_CODES = new Set([
  'monthly_total_mismatch',
  'invoice_total_mismatch',
  'missing_amount',
  'invalid_period',
  'contract_amount_to_confirm',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function clientPreferences(value: unknown, ctx: OrgContext): Record<string, unknown> {
  const preferences = value && typeof value === 'object' ? { ...value } as Record<string, unknown> : {};
  if (!ctx.permissions.view_credits_billing) delete preferences.recharge_auto;
  return preferences;
}

/** Explicit projection: new database columns are private until deliberately exposed. */
export function clientOrganization(value: Record<string, unknown>, ctx: OrgContext): Record<string, unknown> {
  const fields = [...ORGANIZATION_FIELDS, ...(ctx.permissions.view_credits_billing ? BILLING_FIELDS : [])];
  if (ctx.role === 'owner') fields.push('commercial_default_permissions');
  return { ...Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, value[key]])), preferences: clientPreferences(value.preferences, ctx) };
}

/** Strips admin-only AI knobs from template file_config before exposing to clients. */
export function clientFileConfig(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return {};
  const next = { ...value };
  for (const key of INTERNAL_FILE_CONFIG_KEYS) {
    delete next[key];
  }
  return next;
}

/** Projects a template record for client consumption (hiding internal AI config and token metrics). */
export function clientTemplate<T extends Record<string, unknown>>(template: T): T {
  if (!isPlainRecord(template)) return template;
  const next: Record<string, unknown> = { ...template };
  if ('file_config' in next && isPlainRecord(next.file_config)) {
    next.file_config = clientFileConfig(next.file_config);
  }
  if ('test_result' in next && isPlainRecord(next.test_result)) {
    const rest = { ...next.test_result };
    delete rest.tokensUsed;
    next.test_result = rest;
  }
  return next as T;
}

/**
 * Strips internal multi-stage AI pipeline artifacts (_structured_sa, field_coverage,
 * raw evidence quotes, non-blocking coverage diagnostics) before sending extracted/filled
 * data to the browser, while keeping invoice lines needed for the SA review UI.
 */
export function clientExtractedData(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return {};
  const next: Record<string, unknown> = { ...value };
  delete next._structured_sa;

  if (isPlainRecord(next._invoice_analysis)) {
    const report = { ...next._invoice_analysis };
    report.summary = '';
    report.field_coverage = [];
    if (Array.isArray(report.invoices)) {
      report.invoices = report.invoices.map((inv) => {
        if (!isPlainRecord(inv)) return inv;
        const lines = Array.isArray(inv.lines)
          ? inv.lines.map((line) => (isPlainRecord(line) ? { ...line, evidence: [] } : line))
          : inv.lines;
        return { ...inv, lines };
      });
    }
    next._invoice_analysis = report;
  }

  if (isPlainRecord(next._extraction_control)) {
    const control = { ...next._extraction_control };
    delete control.coverage;
    if (Array.isArray(control.issues)) {
      control.issues = control.issues.filter(
        (issue) => isPlainRecord(issue) && typeof issue.code === 'string' && CLIENT_BLOCKING_ISSUE_CODES.has(issue.code),
      );
    }
    next._extraction_control = control;
  }

  if (isPlainRecord(next.situation_actuelle)) {
    const sa = { ...next.situation_actuelle };
    for (const key of ['abonnements', 'locations', 'charges_variables'] as const) {
      if (Array.isArray(sa[key])) {
        sa[key] = (sa[key] as unknown[]).map((item) => {
          if (!isPlainRecord(item) || !('preuve_source' in item)) return item;
          const copy = { ...item };
          delete copy.preuve_source;
          return copy;
        });
      }
    }
    next.situation_actuelle = sa;
  }

  return next;
}

export function clientProposition<T extends Record<string, unknown>>(proposition: T): T {
  if (!isPlainRecord(proposition)) return proposition;
  const next: Record<string, unknown> = { ...proposition };
  if (isPlainRecord(next.extracted_data)) {
    next.extracted_data = clientExtractedData(next.extracted_data);
  }
  if (isPlainRecord(next.filled_data)) {
    next.filled_data = clientExtractedData(next.filled_data);
  }
  if (isPlainRecord(next.template)) {
    next.template = clientTemplate(next.template);
  }
  return next as T;
}
