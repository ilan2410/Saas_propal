import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { extractDataFromDocuments, validateClaudeApiKey } from '@/lib/ai/claude';
import { cleanupOldPropositions } from '@/lib/propositions/cleanup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

    promptToUse = `${promptToUse.trim()}

INSTRUCTION COMPLÉMENTAIRE - RÉSUMÉ:
- Ajoute un champ "resume" (string) dans le JSON retourné.
- Le champ "resume" contient un résumé en français, structuré et lisible (titres + listes), basé uniquement sur les informations trouvées dans les documents.
- N'invente pas d'informations. Si une information est absente, indique "(non trouvé)" ou omets la sous-partie concernée.
- Le résumé doit couvrir au minimum : Informations client, Fournisseur/Opérateur, Lignes/Services, Location/Matériel (si présent), Engagements/Facturation (si présent), puis une Synthèse en 3-5 puces.

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;
    
    console.log('🤖 Modèle utilisé:', modelToUse);
    console.log('📝 Champs à extraire:', template.champs_actifs?.length || 0);

    // Créer OU réutiliser la proposition (draft) en BDD
    type PropositionRow = { id: string } & Record<string, unknown>;
    let proposition: PropositionRow;
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

      proposition = updated as PropositionRow;
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

      proposition = created as PropositionRow;
    }

    console.log('📝 Proposition utilisée:', proposition.id);


    // Limiter automatiquement à 15 propositions (suppression des plus anciennes)
    // Utilisation du helper centralisé
    try {
      // On utilise 15 ici car la proposition courante est déjà créée/mise à jour et incluse dans le compte
      await cleanupOldPropositions(serviceSupabase, user.id, 15);
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
    const ensureBureautiqueArraysCount = (data: unknown, count: number): Record<string, unknown> => {
      const target = Math.max(1, Number(count || 1));
      const base =
        data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
      const next: Record<string, unknown> = { ...base };
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
        const currentRaw = next[k];
        const current = Array.isArray(currentRaw) ? [...currentRaw] : [];
        if (current.length < target) {
          for (let i = current.length; i < target; i += 1) current.push({});
        }
        next[k] = current;
      }

      return next;
    };

    const extractedDataFinal =
      organization.secteur === 'bureautique'
        ? ensureBureautiqueArraysCount(extractedData, copieursCount)
        : extractedData;
    
    console.log('✅ Extraction réussie');

    // Débiter les crédits de l'organisation UNIQUEMENT si l'extraction a réussi
    try {
      // IMPORTANT: utiliser le service role pour bypasser RLS
      const { data: currentOrg, error: currentOrgError } = await serviceSupabase
        .from('organizations')
        .select('credits')
        .eq('id', organization.id)
        .single();

      if (currentOrgError || !currentOrg) {
        await supabase.from('propositions').delete().eq('id', proposition.id);
        return NextResponse.json(
          {
            error: 'Organisation non trouvée lors du débit',
            details: currentOrgError?.message || 'Organisation introuvable',
          },
          { status: 404 }
        );
      }

      const currentCredits = parseFloat(String(currentOrg.credits || 0));
      // Revérification (même si on a vérifié au début, les crédits ont pu changer)
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
        .eq('credits', currentOrg.credits) // Optimistic lock
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
      // Supprimer la proposition si le débit échoue
      await supabase.from('propositions').delete().eq('id', proposition.id);
      return NextResponse.json({ 
        error: 'Erreur lors du débit des crédits', 
        details: debitError instanceof Error ? debitError.message : 'Erreur inconnue'
      }, { status: 500 });
    }

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

    // Récupérer les crédits mis à jour après le débit et les préférences pour la recharge auto
    // IMPORTANT: utiliser le service role pour éviter toute surprise liée à RLS si org.id != auth.uid()
    const { data: updatedOrg } = await serviceSupabase
      .from('organizations')
      .select('credits, preferences')
      .eq('id', organization.id)
      .single();

    // Gestion de la recharge automatique
    if (updatedOrg?.preferences) {
      const prefs = updatedOrg.preferences as unknown;
      const rechargeAuto = isRecord(prefs) ? prefs['recharge_auto'] : null;
      const actif = isRecord(rechargeAuto) ? rechargeAuto['actif'] : null;
      if (actif === true) {
        const seuil = isRecord(rechargeAuto) ? toNumber(rechargeAuto['seuil']) : 0;
        const montant = isRecord(rechargeAuto) ? toNumber(rechargeAuto['montant']) : 0;
        const credits = toNumber(updatedOrg.credits);

        if (seuil > 0 && montant > 0 && credits < seuil) {
          console.log(`[AutoRecharge] Crédits (${credits}€) inférieurs au seuil (${seuil}€). Tentative de recharge de ${montant}€...`);
          try {
            // Import dynamique pour éviter de charger Stripe si non nécessaire
            const { attemptAutoRecharge } = await import('@/lib/stripe/auto-recharge');
            const result = await attemptAutoRecharge(organization.id, montant);
            
            if (result.success && result.creditsAdded) {
              // Mettre à jour la valeur retournée au client
              updatedOrg.credits = (updatedOrg.credits || 0) + result.creditsAdded;
            }
          } catch (rechargeError) {
            console.error('[AutoRecharge] Échec de la tentative:', rechargeError);
            // On ne bloque pas la réponse si la recharge échoue
          }
        }
      }
    }

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
