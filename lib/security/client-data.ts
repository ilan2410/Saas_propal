import type { OrgContext } from '@/lib/auth/org-context';

export const CLIENT_TEMPLATE_COLUMNS = 'id, organization_id, secteur, nom, description, file_url, file_name, file_type, file_size_mb, file_config, champs_actifs, merge_config, statut, test_result, created_at, updated_at';

const ORGANIZATION_FIELDS = ['id', 'nom', 'email', 'secteur', 'champs_defaut', 'logo_url', 'contact_prenom', 'contact_nom', 'telephone_fixe', 'telephone_mobile', 'siret', 'adresse', 'code_postal', 'ville', 'pdf_header_logo_url', 'pdf_footer_text', 'sp_questions', 'note_title_template', 'created_at', 'updated_at', 'onboarding_completed', 'onboarding_completed_at', 'onboarding_tours_seen'];
const BILLING_FIELDS = ['credits', 'tarif_par_proposition', 'tarif_clone_site', 'numero_tva', 'nom_facturation', 'adresse_facturation', 'email_facturation', 'adresse_ligne1_facturation', 'adresse_ligne2_facturation', 'ville_facturation', 'code_postal_facturation', 'pays_facturation', 'telephone_facturation'];

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
