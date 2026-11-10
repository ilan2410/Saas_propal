import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { buildPropositionAuthorProfile, type OrgContext } from '@/lib/auth/org-context';
import type { GenerateOptions } from './base-data';
import { renderClauses } from '@/lib/sp/renderClauses';
import { buildSpReference } from '@/lib/sp/buildReference';
import { repairSpCompletesFromQuestionnaire } from '@/lib/sp/repairSpCompletes';
import type { CatalogueProduit, SpClauseConditionnelle, SpQuestion, SpQuestionReponse, SuggestionsSpCompletes, SpPreferencesProduits, SpConfigLoyer, SpConfigResumeRef, OrganizationPreferences, SpTableProductOrders } from '@/types';
import { catalogueForSecteur } from '@/lib/sectors';
type UnknownRecord = Record<string, unknown>;
export async function preparePropositionGeneration(
 supabase: SupabaseClient, ctx: OrgContext,
 proposition: Record<string, unknown>, template: GenerateOptions['template'] & { secteur?: 'telephonie' | 'bureautique' },
): Promise<GenerateOptions> {
    // Fusionner extracted_data + filled_data pour conserver les champs SA riches
    // tout en laissant les éventuelles corrections utilisateur prendre la priorité.
    const extracted =
      proposition.extracted_data && typeof proposition.extracted_data === 'object'
        ? proposition.extracted_data
        : {};
    const filled =
      proposition.filled_data && typeof proposition.filled_data === 'object'
        ? proposition.filled_data
        : {};
    const donnees = { ...extracted, ...filled };

    const { data: organization } = await createServiceClient().from('organizations')
      .select('nom, email, secteur, siret, adresse, code_postal, ville, telephone_fixe, telephone_mobile, contact_prenom, contact_nom, logo_url, sp_questions, credits, tarif_par_proposition, preferences')
      .eq('id', ctx.organizationId)
      .single();

    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .eq('organization_id', ctx.organizationId);

    const allQuestions = Array.isArray(organization?.sp_questions) ? organization.sp_questions as SpQuestion[] : [];
    const templateQuestions = allQuestions.filter((question) => question.template_id === proposition.template_id);
    const spReponses = Array.isArray(proposition.sp_reponses) ? proposition.sp_reponses as SpQuestionReponse[] : [];
    const catalogue = catalogueForSecteur(Array.isArray(catalogueRows) ? catalogueRows as CatalogueProduit[] : [], template.secteur ?? 'telephonie');
    const templateFileCfg = typeof template.file_config === 'object' && template.file_config !== null ? template.file_config as UnknownRecord : {};
    const spPreferencesProduits = typeof templateFileCfg.sp_preferences_produits === 'object' && templateFileCfg.sp_preferences_produits !== null
      ? templateFileCfg.sp_preferences_produits as SpPreferencesProduits
      : undefined;

    // Config loyer / mois offerts : même source que l'aperçu Word, pour garantir des
    // montants identiques entre l'aperçu et le document Word généré.
    const orgPreferences = (typeof organization?.preferences === 'object' && organization.preferences !== null
      ? organization.preferences
      : {}) as OrganizationPreferences;
    const spConfigLoyer = (templateFileCfg.sp_config_loyer as SpConfigLoyer | undefined)?.baremes
      ? (templateFileCfg.sp_config_loyer as SpConfigLoyer)
      : undefined;
    const spConfigMoisOfferts = orgPreferences.sp_config_mois_offerts;

    const isModeDirect = Boolean(
      (templateFileCfg.sp_config_mode_direct as { actif?: boolean } | undefined)?.actif,
    );

    const suggestionsSpCompletes = repairSpCompletesFromQuestionnaire(
      (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null,
      spReponses,
      templateQuestions,
      catalogue,
      donnees as UnknownRecord,
      spConfigLoyer,
      spConfigMoisOfferts,
      spPreferencesProduits,
      orgPreferences.sp_categories_order,
      templateFileCfg.sp_table_product_orders as SpTableProductOrders | undefined,
      isModeDirect ? { allowEmptyCart: true } : undefined,
    );

    // Clauses conditionnelles → variables Word {{sp_clause_<cle>}}
    const clauses = Array.isArray(templateFileCfg.spClausesConditionnelles)
      ? templateFileCfg.spClausesConditionnelles as unknown as SpClauseConditionnelle[]
      : [];
    const sp_clauses_rendered = renderClauses(
      clauses,
      suggestionsSpCompletes,
      spReponses,
      donnees as UnknownRecord,
      catalogue,
    );

    // Référence proposition → variable Word {{sp_reference}}
    // Loyer évalué sur l'état FINAL des réponses (cf. config résumé/réf du template).
    const spConfigResumeRef = templateFileCfg.sp_config_resume_ref as SpConfigResumeRef | undefined;
    const sp_reference = buildSpReference(
      spConfigResumeRef,
      spReponses,
      templateQuestions,
      catalogue,
      donnees as UnknownRecord,
      spConfigLoyer,
      spConfigMoisOfferts,
      spPreferencesProduits,
    );

    // Profil entreprise transmis au générateur : champs société inchangés, mais
    // contact_prenom/contact_nom/telephone_fixe/telephone_mobile proviennent de
    // l'utilisateur agissant (le commercial lui-même pour un sous-compte).
    const organizationProfile = organization
      ? await buildPropositionAuthorProfile(supabase, organization, ctx, proposition.created_by as string | null)
      : organization;


 return { template, donnees, organization_id: ctx.organizationId, proposition_id: String(proposition.id),
 proposition_created_at: proposition.created_at as string, suggestions_sp_completes: suggestionsSpCompletes,
 sp_clauses_rendered, sp_reference, organization_profile: organizationProfile };
}
