import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { loadSpVariant } from '@/lib/propositions/sp-variant-server';
import { applySpVariant, type SpVariant } from '@/lib/propositions/sp-variants';
import { resolveSubTemplateSelection, subTemplateConfig, subTemplatesEnabled, type SubTemplate } from '@/lib/templates/sub-templates';
import type { GenerateOptions } from '@/lib/generators/base-data';
import type { OrgContext } from '@/lib/auth/org-context';
import { preparePropositionGeneration } from '@/lib/generators/prepare-proposition';
import { renderWordPropositionFromTemplate, wordPropositionFileName } from '@/lib/generators/word-proposition';
import { applySignatureTags, type SignaturePlacement } from './signature-tags';

export type SignatureTemplate = GenerateOptions['template'] & { secteur?: 'telephonie' | 'bureautique'; nom?: string };

export interface SignatureAnnex {
  id: string;
  nom: string;
  file_type: 'word' | 'excel';
  /** Annexe sélectionnée pour cette proposition (cochée par défaut). */
  selected: boolean;
  source: SubTemplate;
}

export interface SignatureDocumentContext {
  /** Proposition avec la variante SP appliquée le cas échéant. */
  proposition: Record<string, unknown> & { id: string; template_id: string };
  variant: SpVariant | null;
  template: SignatureTemplate | null;
  annexes: SignatureAnnex[];
}

/**
 * Charge ce qui peut partir en signature : la proposition (ou sa variante SP) et
 * les annexes configurées sur le template, avec la même sélection que le
 * téléchargement. À appeler après l'autorisation de la proposition parente.
 */
export async function loadSignatureDocumentContext(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  parent: Record<string, unknown> & { id: string; template_id: string },
  variantId: string | null,
): Promise<SignatureDocumentContext | 'variant_not_found'> {
  const variant = variantId ? await loadSpVariant(parent.id, organizationId, variantId) : null;
  if (variantId && !variant) return 'variant_not_found';
  const proposition = variant ? applySpVariant(parent, variant) : parent;

  const { data: template } = await supabase
    .from('proposition_templates')
    .select(CLIENT_TEMPLATE_COLUMNS)
    .eq('id', parent.template_id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!template) return { proposition, variant, template: null, annexes: [] };

  const service = createServiceClient();
  const [{ data: children, error }, { data: pref }] = await Promise.all([
    service.from('template_sub_templates').select('*').eq('template_id', template.id).eq('organization_id', organizationId).order('created_at').order('id'),
    service.from('template_generation_preferences').select('mode').eq('user_id', userId).eq('template_id', template.id).maybeSingle(),
  ]);
  if (error) throw error;

  const configured = (children ?? []) as SubTemplate[];
  const enabled = subTemplatesEnabled(template.file_config, configured.length) ? configured : [];
  const selected = resolveSubTemplateSelection(
    enabled.map((c) => c.id),
    pref?.mode ?? 'all',
    (proposition.selected_sub_template_ids as string[] | null | undefined) ?? null,
  );

  return {
    proposition,
    variant,
    template: template as unknown as SignatureTemplate,
    annexes: enabled.map((c) => ({ id: c.id, nom: c.nom, file_type: c.file_type, selected: selected.includes(c.id), source: c })),
  };
}

export interface SignatureDocument {
  /** 'main' pour la proposition, sinon l'id de l'annexe. */
  key: string;
  name: string;
  buffer: Uint8Array;
}

/**
 * Génère les fichiers Word envoyés en signature, exactement comme au téléchargement :
 * la proposition (variante appliquée) avec sa zone de signature, puis les annexes
 * choisies, remplies avec les mêmes données. `only` limite le rendu à un document
 * (aperçu).
 */
export async function renderSignatureDocuments(
  supabase: SupabaseClient,
  ctx: OrgContext,
  context: SignatureDocumentContext & { template: SignatureTemplate },
  annexes: SignatureAnnex[],
  only?: string,
): Promise<{ documents: SignatureDocument[]; placement: SignaturePlacement | null }> {
  const { template } = context;
  const options = await preparePropositionGeneration(supabase, ctx, context.proposition, template);
  if (context.variant) options.variant_name = context.variant.nom;

  const documents: SignatureDocument[] = [];
  let placement: SignaturePlacement | null = null;

  if (!only || only === 'main') {
    const rendered = await renderWordPropositionFromTemplate({ ...options, signatureMode: true });
    const tagged = applySignatureTags(rendered);
    placement = tagged.placement ?? 'placeholder';
    documents.push({ key: 'main', name: wordPropositionFileName(options), buffer: tagged.buffer });
  }

  for (const annex of annexes) {
    if (only && only !== annex.id) continue;
    const annexOptions: GenerateOptions = {
      ...options,
      document_name: annex.nom,
      template: {
        ...options.template,
        id: annex.source.id,
        file_url: annex.source.file_url,
        file_type: annex.source.file_type,
        file_config: subTemplateConfig(template.file_config, annex.source.file_config),
      },
    };
    // Annexes : paraphes (et signature) uniquement si le modèle de l'annexe contient
    // les variables ; jamais de bloc « Bon pour accord » automatique.
    const annexRendered = await renderWordPropositionFromTemplate({ ...annexOptions, signatureMode: true });
    const annexTagged = applySignatureTags(annexRendered, { autoBlock: false });
    documents.push({ key: annex.id, name: wordPropositionFileName(annexOptions), buffer: annexTagged.buffer });
  }

  return { documents, placement };
}
