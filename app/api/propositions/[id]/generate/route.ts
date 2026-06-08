import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePropositionFile } from '@/lib/generators';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
import type { CatalogueProduit, SpMateriel, SpMaterielDetail, SpQuestion, SpQuestionReponse, SuggestionsSpCompletes } from '@/types';

type UnknownRecord = Record<string, unknown>;

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function repairMaterialDetailFromQuestionnaire(
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: UnknownRecord,
): SuggestionsSpCompletes | null {
  if (!sp || reponses.length === 0 || questions.length === 0 || catalogue.length === 0) return sp;

  const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites);
  const catalogueMap = new Map<string, CatalogueProduit>();
  for (const item of catalogue) catalogueMap.set(item.id, item);
  const materielCartLines = cart.lines.filter((line) =>
    !['mobile', 'fixe', 'internet', 'cadeau'].includes(line.categorie)
  );

  if (materielCartLines.length === 0) return sp;

  const sp_materiel: SpMateriel[] = materielCartLines.map((line) => {
    const cat = line.produitId ? catalogueMap.get(line.produitId) : undefined;
    return {
      sp_materiel_nom: line.produitNom,
      sp_materiel_ref: undefined,
      sp_materiel_fournisseur: cat?.fournisseur,
      sp_materiel_prix_mensuel: formatEuro(line.prixTotal),
      sp_materiel_duree_engagement: '',
      sp_materiel_commentaire: '',
      sp_materiel_produit_id: line.produitId,
      sp_type_ligne: 'Materiel',
      _prix_mensuel_raw: line.prixTotal,
    };
  });

  const sp_materiel_detail: SpMaterielDetail[] = materielCartLines.map((line) => {
    const isLibre = !line.produitId;
    const cat = !isLibre && line.produitId ? catalogueMap.get(line.produitId) : undefined;
    const freq = isLibre ? 'unique' : (cat?.type_frequence ?? 'mensuel');
    const imageUrl = !isLibre && typeof cat?.image_url === 'string' ? cat.image_url : undefined;
    const description = !isLibre && typeof cat?.description === 'string' ? cat.description : '';
    return {
      sp_matd_nom: line.produitNom,
      sp_matd_ref: undefined,
      sp_matd_fournisseur: cat?.fournisseur,
      sp_matd_quantite: String(line.quantite ?? 1),
      sp_matd_prix_ht: formatEuro(line.prixTotal),
      sp_matd_description: description,
      sp_matd_frequence: freq === 'unique' ? 'Achat unique' : 'Mensuel',
      sp_matd_image_url: imageUrl,
      sp_mat_image_url: imageUrl,
      _prix_raw: line.prixTotal,
    };
  });

  const totalMateriel = sp_materiel.reduce((sum, item) => sum + item._prix_mensuel_raw, 0);

  return {
    ...sp,
    sp_materiel,
    sp_materiel_detail,
    sp_total_materiel_ht: formatEuro(totalMateriel),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer la proposition
    const { data: proposition, error: propError } = await supabase
      .from('propositions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (propError || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    // Récupérer le template
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', proposition.template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

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

    const { data: organization } = await supabase
      .from('organizations')
      .select('sp_questions, credits, tarif_par_proposition')
      .eq('id', user.id)
      .single();

    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${user.id},organization_id.is.null`);

    const allQuestions = Array.isArray(organization?.sp_questions) ? organization.sp_questions as SpQuestion[] : [];
    const templateQuestions = allQuestions.filter((question) => question.template_id === proposition.template_id);
    const spReponses = Array.isArray(proposition.sp_reponses) ? proposition.sp_reponses as SpQuestionReponse[] : [];
    const catalogue = Array.isArray(catalogueRows) ? catalogueRows as CatalogueProduit[] : [];
    const suggestionsSpCompletes = repairMaterialDetailFromQuestionnaire(
      (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null,
      spReponses,
      templateQuestions,
      catalogue,
      donnees as UnknownRecord,
    );

    // Générer le fichier
    const fileUrl = await generatePropositionFile({
      template,
      donnees,
      organization_id: user.id,
      proposition_id: id,
      suggestions_sp_completes: suggestionsSpCompletes,
    });

    // Mettre à jour la proposition avec les bons noms de colonnes
    const { error: updateError } = await supabase
      .from('propositions')
      .update({
        duplicated_template_url: fileUrl,
        statut: 'exported',
        exported_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Déduire les crédits
    if (organization) {
      await supabase
        .from('organizations')
        .update({
          credits: Math.max(0, organization.credits - organization.tarif_par_proposition),
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ success: true, file_url: fileUrl });
  } catch (error) {
    console.error('Error generating proposition:', error);
    
    // Marquer la proposition en erreur
    const { id } = await params;
    const supabase = await createClient();
    await supabase
      .from('propositions')
      .update({ statut: 'error' })
      .eq('id', id);

    return NextResponse.json(
      {
        error: 'Failed to generate proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
