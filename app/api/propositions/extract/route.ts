import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { extractDataFromDocuments, validateClaudeApiKey } from '@/lib/ai/claude';

function extractStoragePathFromPublicUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rawPath = url.slice(idx + marker.length);
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { template_id, documents_urls, nom_client, proposition_id } = body;
    const copieursCount = Math.max(1, Number(body?.copieurs_count || 1));
    
    console.log('📥 Extraction demandée:', { template_id, documents_urls, nom_client, copieursCount });

    // Validation des entrées
    if (!template_id) {
      return NextResponse.json({ error: 'template_id manquant' }, { status: 400 });
    }
    
    if (!documents_urls || !Array.isArray(documents_urls) || documents_urls.length === 0) {
      return NextResponse.json({ error: 'Aucun document fourni' }, { status: 400 });
    }

    // Vérifier la clé API Claude
    if (!validateClaudeApiKey()) {
      return NextResponse.json({ 
        error: 'Clé API Claude non configurée',
        details: 'La variable ANTHROPIC_API_KEY n\'est pas définie'
      }, { status: 500 });
    }

    // Récupérer le template
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      console.error('Template non trouvé:', templateError);
      return NextResponse.json({ error: 'Template non trouvé', details: templateError?.message }, { status: 404 });
    }
    
    console.log('📋 Template trouvé:', template.nom);

    // Récupérer l'organization
    console.log('🔍 Recherche de l\'organisation avec user.id:', user.id);
    console.log('📧 Email utilisateur:', user.email);
    
    let organization = null;
    let orgError = null;
    
    // Essayer d'abord par ID (méthode normale)
    const resultById = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (resultById.data && !resultById.error) {
      organization = resultById.data;
      console.log('✅ Organisation trouvée par ID');
    } else {
      console.log('❌ Organisation non trouvée par ID, essai par email...');
      
      // Si échec, essayer par email (fallback)
      const resultByEmail = await supabase
        .from('organizations')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (resultByEmail.data && !resultByEmail.error) {
        organization = resultByEmail.data;
        console.log('✅ Organisation trouvée par email, ID:', organization.id);
        
        // Vérifier si les ID correspondent - si non, il y a un problème de cohérence
        if (organization.id !== user.id) {
          console.warn('⚠️ Incohérence détectée: user.id != organization.id', {
            userId: user.id,
            orgId: organization.id
          });
        }
      } else {
        orgError = resultByEmail.error;
        console.log('❌ Organisation non trouvée par email non plus');
      }
    }
      
    console.log('📊 Résultat recherche organisation:', { organization, orgError });
      
    if (!organization || orgError) {
      console.error('❌ Organisation non trouvée ou erreur:', orgError);
      return NextResponse.json({ 
        error: 'Organisation non trouvée', 
        details: `ID utilisateur: ${user.id}, Email: ${user.email}, Erreur: ${orgError?.message || 'Organisation introuvable'}` 
      }, { status: 404 });
    }
    
    console.log('🏢 Organisation:', organization.nom);
    console.log('💰 Crédits actuels:', organization.credits, 'Type:', typeof organization.credits);
    console.log('💳 Tarif par proposition:', organization.tarif_par_proposition, 'Type:', typeof organization.tarif_par_proposition);

    // Convertir en nombres pour éviter les problèmes de type
    const credits = parseFloat(String(organization.credits || 0));
    const tarif = parseFloat(String(organization.tarif_par_proposition || 0));
    
    console.log('💰 Crédits convertis:', credits);
    console.log('💳 Tarif converti:', tarif);
    console.log('🔍 Comparaison:', credits, '<', tarif, '=', credits < tarif);

    // Vérifier que les crédits sont suffisants
    if (credits < tarif) {
      return NextResponse.json({ 
        error: 'Crédits insuffisants',
        details: `Crédits requis: ${tarif}€, Crédits disponibles: ${credits}€`
      }, { status: 402 });
    }

    // Utiliser le prompt du template, sinon celui de l'organisation, sinon le prompt par défaut
    const DEFAULT_PROMPT = `Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "fournisseur": "Nom du fournisseur/distributeur actuel",
  "client": {
    "nom": "Nom du contact",
    "prenom": "Prénom",
    "email": "email@exemple.com",
    "fonction": "Fonction",
    "mobile": "06 XX XX XX XX",
    "fixe": "01 XX XX XX XX",
    "raison_sociale": "Nom de l'entreprise",
    "adresse": "Adresse complète",
    "code_postal": "75001",
    "ville": "Paris",
    "siret": "XXXXXXXXXXXXX",
    "ape": "Code APE",
    "capital": "Capital social",
    "forme_juridique": "SAS/SARL/etc",
    "rcs": "RCS"
  },
  "lignes": [
    {"numero_ligne": "0XXXXXXXXX", "type": "mobile|fixe|internet", "forfait": "Nom forfait", "quantite": "1", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ],
  "location_materiel": [
    {"type": "Location", "quantite": "1", "materiel": "Description", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ]
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide
- Utilise null pour les informations absentes
- Les tarifs sont des nombres (29.99 et non "29,99€")
- Les tableaux peuvent contenir plusieurs éléments
- Extrais TOUTES les lignes trouvées dans le document

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

    let promptToUse = template.prompt_template || organization.prompt_template || DEFAULT_PROMPT;
    const modelToUse = template.claude_model || organization.claude_model || 'claude-3-7-sonnet-20250219';

    // Bureautique : aider l'extraction à produire un nombre cohérent de lignes (si l'utilisateur a indiqué N copieurs)
    if (organization.secteur === 'bureautique' && copieursCount > 1) {
      promptToUse = `${promptToUse.trim()}

CONTRAINTE BUREAUTIQUE - NOMBRE DE COPIEURS:
- L'utilisateur indique qu'il y a ${copieursCount} copieur(s).
- Assure-toi que les tableaux suivants contiennent AU MOINS ${copieursCount} élément(s) : materiels, locations, maintenance, facturation_clics, releves_compteurs, options, engagements.
- Si le document ne permet pas de remplir certains éléments, ajoute quand même des objets vides {} ou des valeurs null pour atteindre ${copieursCount} élément(s).
`;
    }
    
    console.log('🤖 Modèle utilisé:', modelToUse);
    console.log('📝 Champs à extraire:', template.champs_actifs?.length || 0);

    // Créer OU réutiliser la proposition (draft) en BDD
    let proposition: any = null;
    if (typeof proposition_id === 'string' && proposition_id) {
      const { data: existingProp, error: existingError } = await supabase
        .from('propositions')
        .select('*')
        .eq('id', proposition_id)
        .eq('organization_id', user.id)
        .single();

      if (existingError || !existingProp) {
        return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
      }

      const { data: updated, error: updateDraftError } = await supabase
        .from('propositions')
        .update({
          template_id: template_id,
          nom_client: nom_client || null,
          source_documents: documents_urls,
          statut: 'processing',
          current_step: 3,
        })
        .eq('id', proposition_id)
        .eq('organization_id', user.id)
        .select('*')
        .single();

      if (updateDraftError || !updated) {
        return NextResponse.json(
          {
            error: 'Erreur mise à jour proposition',
            details: updateDraftError?.message || 'Unknown error',
          },
          { status: 500 }
        );
      }

      proposition = updated;
    } else {
      const { data: created, error: propError } = await supabase
        .from('propositions')
        .insert({
          organization_id: user.id,
          template_id: template_id,
          nom_client: nom_client || null,
          source_documents: documents_urls, // JSONB array
          statut: 'processing',
          current_step: 3,
        })
        .select()
        .single();

      if (propError || !created) {
        console.error('Erreur création proposition:', propError);
        return NextResponse.json({
          error: 'Erreur création proposition',
          details: propError?.message || 'Erreur inconnue',
        }, { status: 500 });
      }

      proposition = created;
    }

    console.log('📝 Proposition utilisée:', proposition.id);

    // Débiter les crédits de l'organisation
    try {
      // IMPORTANT: utiliser le service role pour bypasser RLS (les clients ne peuvent pas UPDATE organizations)
      // On évite aussi la dépendance à une fonction SQL potentiellement non déployée / pas à jour.

      const { data: currentOrg, error: currentOrgError } = await serviceSupabase
        .from('organizations')
        .select('credits')
        .eq('id', organization.id)
        .single();

      if (currentOrgError || !currentOrg) {
        await supabase.from('propositions').delete().eq('id', proposition.id);
        return NextResponse.json(
          {
            error: 'Organisation non trouvée',
            details: currentOrgError?.message || 'Organisation introuvable',
          },
          { status: 404 }
        );
      }

      const currentCredits = parseFloat(String(currentOrg.credits || 0));
      if (currentCredits < tarif) {
        await supabase.from('propositions').delete().eq('id', proposition.id);
        return NextResponse.json(
          {
            error: 'Crédits insuffisants',
            details: `Crédits requis: ${tarif}€, Crédits disponibles: ${currentCredits}€`,
          },
          { status: 402 }
        );
      }

      const newCredits = Math.round((currentCredits - tarif) * 100) / 100;

      const { data: updatedOrgRow, error: updateCreditsError } = await serviceSupabase
        .from('organizations')
        .update({ credits: newCredits })
        .eq('id', organization.id)
        // Optimistic lock: si les crédits ont changé entre-temps, l'update n'affectera aucune ligne
        .eq('credits', currentOrg.credits)
        .select('credits')
        .single();

      if (updateCreditsError || !updatedOrgRow) {
        await supabase.from('propositions').delete().eq('id', proposition.id);
        return NextResponse.json(
          {
            error: 'Erreur lors du débit des crédits',
            details: updateCreditsError?.message || 'Conflit lors de la mise à jour des crédits',
          },
          { status: 500 }
        );
      }

      console.log(`💳 Crédits débités: ${tarif}€ | ${currentCredits}€ -> ${updatedOrgRow.credits}€ | org=${organization.id}`);
    } catch (debitError) {
      console.error('Exception lors du débit des crédits:', debitError);
      return NextResponse.json({ 
        error: 'Erreur lors du débit des crédits', 
        details: debitError instanceof Error ? debitError.message : 'Erreur inconnue'
      }, { status: 500 });
    }

    // Limiter automatiquement à 15 propositions (suppression des plus anciennes)
    try {
      const { data: allProps, error: listError } = await supabase
        .from('propositions')
        .select('id, created_at, source_documents, documents_urls, documents_sources_urls, duplicated_template_url, fichier_genere_url')
        .eq('organization_id', user.id)
        .order('created_at', { ascending: false });

      if (!listError && allProps && allProps.length > 15) {
        const toDelete = allProps.slice(15);

        for (const p of toDelete) {
          const urls: string[] = [];
          const sourceDocs = (p.source_documents || p.documents_urls || p.documents_sources_urls) as any;
          if (Array.isArray(sourceDocs)) {
            urls.push(...sourceDocs.filter(Boolean));
          }
          const generatedUrl = (p.duplicated_template_url || p.fichier_genere_url) as any;
          if (typeof generatedUrl === 'string' && generatedUrl) {
            urls.push(generatedUrl);
          }

          const documentsPaths = urls
            .map((u) => extractStoragePathFromPublicUrl(u, 'documents'))
            .filter(Boolean) as string[];

          const templatesPaths = urls
            .map((u) => extractStoragePathFromPublicUrl(u, 'templates'))
            .filter(Boolean) as string[];

          const propositionsPaths = urls
            .map((u) => extractStoragePathFromPublicUrl(u, 'propositions'))
            .filter(Boolean) as string[];

          if (documentsPaths.length > 0) {
            const { error: storageError } = await serviceSupabase.storage.from('documents').remove(documentsPaths);
            if (storageError) console.error('Erreur suppression documents (trim):', storageError);
          }

          if (templatesPaths.length > 0) {
            const { error: storageError } = await serviceSupabase.storage.from('templates').remove(templatesPaths);
            if (storageError) console.error('Erreur suppression templates (trim):', storageError);
          }

          if (propositionsPaths.length > 0) {
            const { error: storageError } = await serviceSupabase.storage.from('propositions').remove(propositionsPaths);
            if (storageError) console.error('Erreur suppression propositions bucket (trim):', storageError);
          }

          const { error: deleteError } = await supabase
            .from('propositions')
            .delete()
            .eq('id', p.id)
            .eq('organization_id', user.id);
          if (deleteError) console.error('Erreur suppression proposition (trim):', deleteError);
        }
      }
    } catch (trimError) {
      console.error('Erreur lors du trim à 15 propositions:', trimError);
    }

    // Extraire les données avec Claude
    console.log('🤖 Lancement extraction Claude...');
    const extractedData = await extractDataFromDocuments({
      documents_urls,
      champs_actifs: template.champs_actifs || [],
      prompt_template: promptToUse,
      claude_model: modelToUse,
    });

    // Post-traitement bureautique : garantir des arrays d'au moins N éléments
    const ensureBureautiqueArraysCount = (data: any, count: number): any => {
      const target = Math.max(1, Number(count || 1));
      const next = (data && typeof data === 'object') ? { ...data } : {};
      const keys = [
        'materiels',
        'locations',
        'maintenance',
        'facturation_clics',
        'releves_compteurs',
        'options',
        'engagements',
      ];

      for (const k of keys) {
        const current = Array.isArray((next as any)[k]) ? [...(next as any)[k]] : [];
        if (current.length < target) {
          for (let i = current.length; i < target; i += 1) current.push({});
        }
        (next as any)[k] = current;
      }

      return next;
    };

    const extractedDataFinal =
      organization.secteur === 'bureautique'
        ? ensureBureautiqueArraysCount(extractedData, copieursCount)
        : extractedData;
    
    console.log('✅ Extraction réussie');

    // Mettre à jour la proposition avec les données extraites
    const { error: updateError } = await supabase
      .from('propositions')
      .update({
        extracted_data: extractedDataFinal,
        statut: 'ready',
        current_step: 4,
      })
      .eq('id', proposition.id);

    if (updateError) {
      console.error('Erreur mise à jour proposition:', updateError);
    }

    // Récupérer les crédits mis à jour après le débit
    // IMPORTANT: utiliser le service role pour éviter toute surprise liée à RLS si org.id != auth.uid()
    const { data: updatedOrg } = await serviceSupabase
      .from('organizations')
      .select('credits')
      .eq('id', organization.id)
      .single();

    return NextResponse.json({
      success: true,
      proposition_id: proposition.id,
      donnees_extraites: extractedDataFinal,
      credits_restants: updatedOrg?.credits || 0,
      montant_debite: tarif,
    });
  } catch (error) {
    console.error('❌ Error extracting data:', error);
    return NextResponse.json(
      {
        error: 'Échec de l\'extraction',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
