import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TemplateWizard } from '@/components/templates/TemplateWizard';

export const revalidate = 0;

export default async function NewTemplatePage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Récupérer l'organisation avec ses champs par défaut
  const { data: organization } = await supabase
    .from('organizations')
    .select('champs_defaut, secteur')
    .eq('id', user.id)
    .single();

  const { count: templatesCount } = await supabase
    .from('proposition_templates')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.id);

  if ((templatesCount || 0) >= 3) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux templates
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Limite atteinte</h1>
          <p className="text-gray-600 mt-2">
            Vous avez déjà 3 templates. Supprimez-en un avant d&apos;en créer un nouveau.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Voir mes templates
          </Link>
        </div>
      </div>
    );
  }

  const NEW_DEFAULT_PROMPT = `Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

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

  const secteur = organization?.secteur || 'telephonie';
  const { data: promptDefault } = await supabase
    .from('prompt_defaults')
    .select('prompt_template')
    .eq('secteur', secteur)
    .single();

  const promptForNewTemplate = (promptDefault?.prompt_template || '').trim() || NEW_DEFAULT_PROMPT;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/templates"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux templates
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Nouveau Template</h1>
        <p className="text-gray-600 mt-2">
          Créez un template en 3 étapes simples
        </p>
      </div>

      {/* Wizard */}
      <TemplateWizard 
        defaultFields={organization?.champs_defaut || []}
        secteur={secteur}
        initialTemplate={{ prompt_template: promptForNewTemplate }}
      />
    </div>
  );
}
