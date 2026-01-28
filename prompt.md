Mission : Intégrer un système de catalogue produits
🎯 Objectif
Créer un catalogue de produits pour permettre aux clients :

D'avoir accès à des produits de base pré-remplis (téléphonie : forfaits mobile, internet, fixe, équipements)
D'ajouter leurs propres produits personnalisés
D'utiliser l'IA pour générer automatiquement des propositions optimisées basées sur le catalogue

📋 Tâches à réaliser
ÉTAPE 1 : Base de données
1.1 Créer le fichier supabase/migrations/add_catalogue_produits.sql
sql-- ==========================================
-- TABLE: catalogues_produits
-- ==========================================
CREATE TABLE IF NOT EXISTS catalogues_produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Type de produit
  categorie VARCHAR(50) NOT NULL CHECK (categorie IN ('mobile', 'internet', 'fixe', 'cloud', 'equipement', 'autre')),
  
  -- Informations produit
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  fournisseur VARCHAR(100),
  
  -- Tarification
  prix_mensuel DECIMAL(10,2) NOT NULL,
  prix_installation DECIMAL(10,2),
  engagement_mois INTEGER,
  
  -- Caractéristiques (JSONB flexible)
  caracteristiques JSONB DEFAULT '{}',
  
  -- Ciblage intelligent
  tags TEXT[],
  
  -- Produit de base (pré-rempli) ou personnalisé
  est_produit_base BOOLEAN DEFAULT false,
  
  -- État
  actif BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_catalogue_org ON catalogues_produits(organization_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_categorie ON catalogues_produits(categorie);
CREATE INDEX IF NOT EXISTS idx_catalogue_actif ON catalogues_produits(actif);
CREATE INDEX IF NOT EXISTS idx_catalogue_base ON catalogues_produits(est_produit_base);

-- RLS Policies
ALTER TABLE catalogues_produits ENABLE ROW LEVEL SECURITY;

-- Les clients peuvent voir les produits de base ET leurs propres produits
CREATE POLICY "Users can view base products and their own"
ON catalogues_produits FOR SELECT
USING (
  est_produit_base = true OR organization_id = auth.uid()
);

-- Les clients peuvent créer/modifier/supprimer uniquement leurs propres produits
CREATE POLICY "Users can manage their own products"
ON catalogues_produits FOR ALL
USING (organization_id = auth.uid())
WITH CHECK (organization_id = auth.uid());
1.2 Créer le fichier supabase/seed-catalogue.sql avec les produits de base
sql-- ==========================================
-- SEED: Catalogue produits de base (Téléphonie)
-- ==========================================

-- Produits Mobile
INSERT INTO catalogues_produits (
  organization_id, categorie, nom, description, fournisseur,
  prix_mensuel, engagement_mois, caracteristiques, tags, est_produit_base, actif
) VALUES
  -- Forfaits Mobile Professionnels
  (NULL, 'mobile', 'Forfait Pro 50Go', 'Forfait mobile professionnel avec 50Go de data', 'Orange Business', 
   19.99, 12, 
   '{"data_go": 50, "appels_illimites": true, "sms_illimites": true, "international": ["Europe", "DOM-TOM"]}'::jsonb,
   ARRAY['professionnel', 'pme', 'economique'], true, true),
   
  (NULL, 'mobile', 'Forfait Pro 100Go', 'Forfait mobile professionnel avec 100Go de data', 'Orange Business',
   29.99, 12,
   '{"data_go": 100, "appels_illimites": true, "sms_illimites": true, "international": ["Europe", "DOM-TOM", "USA"]}'::jsonb,
   ARRAY['professionnel', 'pme', 'premium'], true, true),
   
  (NULL, 'mobile', 'Forfait Pro Illimité', 'Forfait mobile professionnel data illimitée', 'Orange Business',
   39.99, 12,
   '{"data_go": "illimité", "appels_illimites": true, "sms_illimites": true, "international": ["Monde"]}'::jsonb,
   ARRAY['professionnel', 'premium', 'grands-comptes'], true, true),

  (NULL, 'mobile', 'Forfait Essentiel 20Go', 'Forfait économique pour collaborateurs', 'SFR Business',
   14.99, 12,
   '{"data_go": 20, "appels_illimites": true, "sms_illimites": true}'::jsonb,
   ARRAY['professionnel', 'economique', 'tpe'], true, true),

-- Produits Internet
  (NULL, 'internet', 'Fibre Pro 500Mb', 'Connexion fibre optique professionnelle 500Mb/s', 'Orange Pro',
   49.99, 12,
   '{"debit_down_mb": 500, "debit_up_mb": 500, "technologie": "fibre", "ip_fixe": true, "gtie_temps_retablissement": "4h"}'::jsonb,
   ARRAY['professionnel', 'pme', 'performance'], true, true),
   
  (NULL, 'internet', 'Fibre Pro 1Gb', 'Connexion fibre optique professionnelle 1Gb/s symétrique', 'Orange Pro',
   79.99, 12,
   '{"debit_down_mb": 1000, "debit_up_mb": 1000, "technologie": "fibre", "ip_fixe": true, "gtie_temps_retablissement": "4h"}'::jsonb,
   ARRAY['professionnel', 'premium', 'grands-comptes'], true, true),
   
  (NULL, 'internet', 'SDSL 10Mb', 'Connexion SDSL symétrique garantie', 'SFR Business',
   99.99, 24,
   '{"debit_down_mb": 10, "debit_up_mb": 10, "technologie": "sdsl", "debit_garanti": true, "gtie_temps_retablissement": "4h"}'::jsonb,
   ARRAY['professionnel', 'premium', 'critiques'], true, true),

-- Produits Téléphonie Fixe
  (NULL, 'fixe', 'Trunk SIP 10 canaux', 'Trunk SIP professionnel 10 canaux simultanés', 'OVH Telecom',
   29.99, 12,
   '{"canaux_simultanees": 10, "appels_illimites": true, "destinations": ["France", "fixes Europe"], "portabilite_incluse": true}'::jsonb,
   ARRAY['professionnel', 'pme', 'voip'], true, true),
   
  (NULL, 'fixe', 'Trunk SIP 30 canaux', 'Trunk SIP professionnel 30 canaux simultanés', 'OVH Telecom',
   79.99, 12,
   '{"canaux_simultanes": 30, "appels_illimites": true, "destinations": ["France", "Europe", "USA"], "portabilite_incluse": true}'::jsonb,
   ARRAY['professionnel', 'premium', 'callcenter'], true, true),

-- Équipements
  (NULL, 'equipement', 'Téléphone IP Yealink T43U', 'Téléphone IP professionnel écran couleur', 'Yealink',
   8.99, 0,
   '{"type": "telephone_ip", "ecran": "couleur 2.7\"", "nb_comptes_sip": 12, "poe": true}'::jsonb,
   ARRAY['equipement', 'voip', 'bureautique'], true, true),
   
  (NULL, 'equipement', 'Routeur 4G/5G Backup', 'Routeur de secours 4G/5G professionnel', 'Cisco',
   15.99, 0,
   '{"type": "routeur_backup", "connectivite": "4G/5G", "ethernet_ports": 4, "failover_auto": true}'::jsonb,
   ARRAY['equipement', 'backup', 'resilience'], true, true);
ÉTAPE 2 : Types TypeScript
2.1 Ajouter dans types/index.ts
typescript// Catalogue produit
export interface CatalogueProduit {
  id: string;
  organization_id: string | null;
  categorie: 'mobile' | 'internet' | 'fixe' | 'cloud' | 'equipement' | 'autre';
  nom: string;
  description?: string;
  fournisseur?: string;
  prix_mensuel: number;
  prix_installation?: number;
  engagement_mois?: number;
  caracteristiques: Record<string, any>;
  tags: string[];
  est_produit_base: boolean;
  actif: boolean;
  created_at: string;
  updated_at: string;
}
ÉTAPE 3 : API Routes
3.1 Créer app/api/catalogue/route.ts
typescriptimport { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const categorie = searchParams.get('categorie');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let query = supabase
    .from('catalogues_produits')
    .select('*')
    .eq('actif', true)
    .order('est_produit_base', { ascending: false })
    .order('nom', { ascending: true });

  if (categorie && categorie !== 'all') {
    query = query.eq('categorie', categorie);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ produits: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from('catalogues_produits')
    .insert({
      organization_id: user.id,
      ...body,
      est_produit_base: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ produit: data });
}
3.2 Créer app/api/catalogue/[id]/route.ts
typescriptimport { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const { data, error } = await supabase
    .from('catalogues_produits')
    .update(body)
    .eq('id', id)
    .eq('organization_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ produit: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from('catalogues_produits')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
3.3 Créer app/api/propositions/generer-suggestions/route.ts
typescriptimport { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { situation_actuelle, catalogue, preferences } = await request.json();

  const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle du client et propose la meilleure combinaison de produits de notre catalogue.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}

OBJECTIF: ${preferences?.objectif || 'equilibre'}
${preferences?.budget_max ? `BUDGET MAX: ${preferences.budget_max}€/mois` : ''}

INSTRUCTIONS:
1. Pour chaque ligne/service actuel, trouve le produit le plus adapté
2. Privilégie ${
  preferences?.objectif === 'economie' 
    ? 'les économies maximales' 
    : preferences?.objectif === 'performance' 
    ? 'la meilleure performance' 
    : "l'équilibre coût/performance"
}
3. Calcule les économies mensuelles et annuelles
4. Justifie chaque choix

RETOURNE UN JSON:
{
  "suggestions": [
    {
      "ligne_actuelle": {...},
      "produit_propose_id": "uuid",
      "produit_propose_nom": "...",
      "prix_actuel": 0,
      "prix_propose": 0,
      "economie_mensuelle": 0,
      "justification": "..."
    }
  ],
  "synthese": {
    "cout_total_actuel": 0,
    "cout_total_propose": 0,
    "economie_mensuelle": 0,
    "economie_annuelle": 0,
    "ameliorations": ["..."]
  }
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur génération suggestions:', error);
    return NextResponse.json(
      { error: 'Erreur génération suggestions' },
      { status: 500 }
    );
  }
}
ÉTAPE 4 : Interface utilisateur
4.1 Créer app/(auth)/catalogue/page.tsx - Interface principale de gestion du catalogue (voir le code complet dans ma réponse précédente)
4.2 Créer app/(auth)/catalogue/new/page.tsx - Formulaire d'ajout de produit
4.3 Créer app/(auth)/catalogue/[id]/page.tsx - Formulaire d'édition de produit
4.4 Modifier components/propositions/Step4Edit.tsx - Ajouter le bouton "Générer proposition optimisée"
Ajoute dans le composant :
typescriptconst [suggestions, setSuggestions] = useState<any>(null);
const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

const handleGenererSuggestions = async () => {
  setIsLoadingSuggestions(true);
  try {
    const catalogueRes = await fetch('/api/catalogue');
    const { produits } = await catalogueRes.json();
    
    const res = await fetch('/api/propositions/generer-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        situation_actuelle: propositionData.donnees_extraites,
        catalogue: produits,
        preferences: { objectif: 'equilibre' },
      }),
    });
    
    const result = await res.json();
    setSuggestions(result);
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    setIsLoadingSuggestions(false);
  }
};
ÉTAPE 5 : Navigation
5.1 Ajouter le lien dans la navigation
Modifier le fichier de navigation pour ajouter :
typescript{
  name: 'Catalogue',
  href: '/catalogue',
  icon: Package, // depuis lucide-react
}
✅ Checklist de validation
Après implémentation, vérifie que :

 La table catalogues_produits est créée dans Supabase
 Les produits de base sont insérés (seed)
 Les policies RLS fonctionnent (les clients voient les produits de base + leurs produits)
 L'API GET /api/catalogue retourne les produits
 L'API POST /api/catalogue permet de créer un produit
 L'interface /catalogue affiche les produits de base et personnalisés
 On peut ajouter un nouveau produit via /catalogue/new
 On peut éditer un produit existant
 On peut dupliquer un produit de base pour le personnaliser
 L'API /api/propositions/generer-suggestions fonctionne avec Claude
 Le bouton "Générer proposition optimisée" appelle l'IA correctement

🎯 Priorité d'implémentation

Base de données (migrations + seed)
Types TypeScript
API Routes (GET, POST, PATCH, DELETE catalogue)
Interface catalogue (liste + formulaires)
Intégration IA (génération suggestions)
Navigation (ajouter le lien)

📝 Notes importantes

Utilise le middleware Supabase existant pour l'authentification
Respecte la structure de routing Next.js App Router déjà en place
Utilise les composants shadcn/ui déjà installés (Button, Input, Card, etc.)
Suis le pattern des autres API routes pour la cohérence
Les produits de base ont organization_id = NULL et est_produit_base = true
Les produits personnalisés ont organization_id = user.id et est_produit_base = false

Commence par l'ÉTAPE 1, puis valide avant de passer à la suivante. Bonne chance 