Prompt complet pour développeur IA - Version finale
🎯 Contexte du projet
Créer une plateforme SaaS multi-tenant pour automatiser la génération de propositions commerciales dans les secteurs de la téléphonie et de la bureautique (location de copieurs).
La plateforme utilise Claude AI (Anthropic) pour extraire automatiquement les données des documents clients (factures, contrats) et remplir des templates de propositions commerciales en dupliquant et modifiant directement le fichier template pour préserver parfaitement la mise en forme originale.

🏗️ Architecture technique
Stack recommandé

Frontend + Backend : Next.js 14+ (App Router)
Base de données : Supabase (PostgreSQL + Storage + Auth)
IA : Anthropic Claude API (SDK officiel @anthropic-ai/sdk)
Paiement : Stripe (pour recharge de crédits)
Parsing et génération documents :

mammoth pour lire Word (.docx)
docxtemplater pour modifier Word (.docx) - MODIFICATION DIRECTE
pizzip pour manipuler les archives ZIP des fichiers Office
docxtemplater-image-module pour gérer les images dans Word
exceljs pour lire et modifier Excel (.xlsx) - MODIFICATION DIRECTE
pdf-parse pour lire PDF
pdf-lib pour modifier PDF - MODIFICATION DIRECTE


Hébergement : Vps Hostiger (Next.js) + Supabase auto hébergé

Packages npm essentiels
bashnpm install @anthropic-ai/sdk
npm install @supabase/supabase-js
npm install stripe @stripe/stripe-js
npm install docxtemplater pizzip docxtemplater-image-module
npm install exceljs
npm install pdf-parse pdf-lib
npm install mammoth
npm install @tanstack/react-query
npm install zod react-hook-form
npm install tailwindcss
npm install sonner # Pour les toasts
npm install lucide-react # Pour les icônes
Installation de shadcn/ui (composants UI)
bashnpx shadcn-ui@latest init
npx shadcn-ui@latest add button input select checkbox label card toast

📊 Schéma de base de données (PostgreSQL via Supabase)
sql-- ==========================================
-- TABLE: organizations (Clients de la plateforme)
-- ==========================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  secteur VARCHAR(100) CHECK (secteur IN ('telephonie', 'bureautique', 'mixte')),
  
  -- Configuration IA
  claude_model VARCHAR(50) DEFAULT 'claude-3-5-sonnet-20241022',
  prompt_template TEXT NOT NULL, -- Prompt personnalisé par client
  prompt_version INTEGER DEFAULT 1,
  
  -- Champs par défaut (sélectionnables par le client)
  champs_defaut JSONB NOT NULL DEFAULT '[]',
  -- Exemple: ["nom_entreprise", "adresse", "contact_email", "equipements_actuels", "volumes_mensuels", "cout_actuel"]
  
  -- Tarification et crédits
  tarif_par_proposition DECIMAL(10,2) NOT NULL DEFAULT 5.00, -- En euros
  credits DECIMAL(10,2) DEFAULT 0.00, -- Solde de crédits disponibles
  
  -- Quotas (valeurs par défaut au maximum)
  quotas JSONB DEFAULT '{
    "tailleMaxDocumentMB": 50,
    "nombreMaxDocumentsParProposition": 10,
    "tokensMaxParProposition": 200000
  }',
  
  -- Stripe
  stripe_customer_id VARCHAR(255), -- ID client Stripe
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_organizations_email ON organizations(email);
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id);

-- ==========================================
-- TABLE: proposition_templates
-- ==========================================
CREATE TABLE proposition_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Métadonnées
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Fichier template MASTER (jamais modifié)
  file_url TEXT NOT NULL, -- URL Supabase Storage du template original
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(20) CHECK (file_type IN ('excel', 'word', 'pdf')),
  file_size_mb DECIMAL(10,2),
  
  -- Configuration spécifique au format
  file_config JSONB,
  -- Pour Excel: {
  --   "feuilleCiblee": "Proposition",
  --   "cellMappings": {"B5": "nom_entreprise", "D10": "cout_mensuel"},
  --   "preserverFormules": true,
  --   "cellulesAvecFormules": ["D15", "G20"],
  --   "tableauxDynamiques": [...]
  -- }
  -- Pour Word: {
  --   "formatVariables": "{{var}}",
  --   "fieldMappings": {"{{nom_entreprise}}": "nom_entreprise_client"},
  --   "tableauxDynamiques": [...],
  --   "imagesARemplacer": {...}
  -- }
  -- Pour PDF: {
  --   "type": "formulaire_remplissable",
  --   "champsFormulaire": {"field_name": "data_key"}
  -- }
  
  -- Champs sélectionnés par le client
  champs_actifs JSONB NOT NULL DEFAULT '[]',
  -- Exemple: ["nom_entreprise", "adresse", "equipements_actuels", "cout_actuel"]
  
  -- Statut du template
  statut VARCHAR(20) DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'teste', 'actif')),
  
  -- Résultat du test (étape 4)
  test_result JSONB,
  -- Structure: {
  --   "extraction": {...},
  --   "preview": {...},
  --   "validation": {...}
  -- }
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_templates_org ON proposition_templates(organization_id);
CREATE INDEX idx_templates_statut ON proposition_templates(statut);

-- ==========================================
-- TABLE: propositions (Propositions générées)
-- ==========================================
CREATE TABLE propositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES proposition_templates(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Métadonnées client final
  nom_client VARCHAR(255),
  
  -- Documents source uploadés
  source_documents JSONB,
  -- Exemple: [
  --   {"url": "...", "name": "facture.pdf", "type": "application/pdf"},
  --   {"url": "...", "name": "contrat.pdf", "type": "application/pdf"}
  -- ]
  
  -- Données extraites par Claude
  extracted_data JSONB,
  extraction_confidence JSONB, -- Score de confiance par champ (0-100)
  
  -- Données après édition manuelle par le client
  filled_data JSONB,
  
  -- Fichiers générés (duplication + modification du template)
  original_template_url TEXT, -- URL du template master utilisé (pour traçabilité)
  duplicated_template_url TEXT, -- URL du fichier dupliqué et modifié (résultat final)
  generated_file_name VARCHAR(255),
  
  -- Métriques IA
  tokens_used JSONB, -- {"input": 15000, "output": 2000, "total": 17000}
  processing_time_ms INTEGER,
  cout_ia DECIMAL(10,4), -- Coût réel de l'appel Claude
  
  -- Éditions manuelles (pour analytics)
  champs_modifies JSONB, -- Liste des champs modifiés par l'utilisateur
  
  -- Statut
  statut VARCHAR(20) DEFAULT 'processing' CHECK (statut IN ('processing', 'ready', 'exported', 'error')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  exported_at TIMESTAMP
);

CREATE INDEX idx_propositions_org ON propositions(organization_id);
CREATE INDEX idx_propositions_template ON propositions(template_id);
CREATE INDEX idx_propositions_statut ON propositions(statut);
CREATE INDEX idx_propositions_created ON propositions(created_at DESC);

-- ==========================================
-- TABLE: usage_analytics (Métriques par client)
-- ==========================================
CREATE TABLE usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  periode VARCHAR(7) NOT NULL, -- Format: 'YYYY-MM'
  
  -- Compteurs
  propositions_count INTEGER DEFAULT 0,
  tokens_total JSONB DEFAULT '{"input": 0, "output": 0, "total": 0}',
  cout_total DECIMAL(10,2) DEFAULT 0.00, -- Coût facturé au client
  cout_ia_total DECIMAL(10,2) DEFAULT 0.00, -- Coût réel Claude API
  
  -- Performance
  taux_succes DECIMAL(5,2), -- % propositions sans erreur
  temps_moyen_ms INTEGER,
  
  -- Qualité
  taux_modification DECIMAL(5,2), -- % champs modifiés manuellement
  champs_plus_modifies JSONB, -- Top 10 des champs les plus modifiés
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(organization_id, periode)
);

CREATE INDEX idx_analytics_org_periode ON usage_analytics(organization_id, periode);

-- ==========================================
-- TABLE: stripe_transactions (Historique de paiements)
-- ==========================================
CREATE TABLE stripe_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_session_id VARCHAR(255),
  
  -- Montants
  montant DECIMAL(10,2) NOT NULL, -- Montant payé
  credits_ajoutes DECIMAL(10,2) NOT NULL, -- Crédits ajoutés au compte
  
  -- Statut
  statut VARCHAR(20) CHECK (statut IN ('pending', 'succeeded', 'failed', 'refunded')),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_org ON stripe_transactions(organization_id);
CREATE INDEX idx_transactions_stripe_intent ON stripe_transactions(stripe_payment_intent_id);

-- ==========================================
-- FUNCTIONS & TRIGGERS
-- ==========================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur organizations et proposition_templates
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON proposition_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour ajouter des crédits
CREATE OR REPLACE FUNCTION add_credits(org_id UUID, amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits = credits + amount,
      updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour débiter des crédits
CREATE OR REPLACE FUNCTION debit_credits(org_id UUID, amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits = credits - amount,
      updated_at = NOW()
  WHERE id = org_id AND credits >= amount;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crédits insuffisants';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour les analytics
CREATE OR REPLACE FUNCTION update_analytics(org_id UUID, proposition_id UUID)
RETURNS void AS $$
DECLARE
  current_periode VARCHAR(7);
  prop_tokens JSONB;
  prop_cout DECIMAL(10,2);
BEGIN
  current_periode := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Récupérer les données de la proposition
  SELECT tokens_used, cout_ia
  INTO prop_tokens, prop_cout
  FROM propositions
  WHERE id = proposition_id;
  
  -- Insert or update analytics
  INSERT INTO usage_analytics (organization_id, periode, propositions_count, tokens_total, cout_ia_total)
  VALUES (org_id, current_periode, 1, prop_tokens, prop_cout)
  ON CONFLICT (organization_id, periode)
  DO UPDATE SET
    propositions_count = usage_analytics.propositions_count + 1,
    tokens_total = jsonb_build_object(
      'input', (usage_analytics.tokens_total->>'input')::int + (prop_tokens->>'input')::int,
      'output', (usage_analytics.tokens_total->>'output')::int + (prop_tokens->>'output')::int,
      'total', (usage_analytics.tokens_total->>'total')::int + (prop_tokens->>'total')::int
    ),
    cout_ia_total = usage_analytics.cout_ia_total + prop_cout;
END;
$$ LANGUAGE plpgsql;
```

---

## 🎨 Structure de l'application
```
/app
  /api
    /admin
      /organizations
        /create          # POST - Créer un client
        /[id]
          /update        # PATCH - Modifier config client
          /analytics     # GET - Stats du client
      /analytics
        /global          # GET - Stats globales tous clients
    
    /organizations (Routes client)
      /templates
        /upload          # POST - Upload template master
        /parse           # POST - Parse template pour détecter champs
        /test            # POST - Test avec vrais documents
        /[id]
          /update        # PATCH - Modifier template
      /propositions
        /create          # POST - Créer nouvelle proposition
        /upload-documents # POST - Upload documents source
        /[id]
          /extract       # POST - Extraction avec Claude
          /update        # PATCH - Modifier données extraites
          /generate      # POST - Dupliquer et modifier le template
    
    /stripe
      /create-checkout   # POST - Créer session Stripe
      /webhook           # POST - Webhook Stripe events
    
    /claude
      /extract           # POST - Appel Claude pour extraction

  /admin (Interface admin)
    /dashboard           # Vue globale
    /clients             # Liste et gestion clients
      /new               # Créer un nouveau client
      /[id]              # Détail + config client
    /analytics           # Analytics globales
  
  /(auth) (Interface client authentifiée)
    /dashboard           # Dashboard client
    /templates           # Gestion templates
      /new               # Wizard création template
        /step-1          # Sélection champs
        /step-2          # Upload template
        /step-3          # Mapping
        /step-4          # Test
        /step-5          # Validation
      /[id]              # Éditer template existant
    /propositions        # Liste propositions
      /new               # Créer proposition
      /[id]              # Détail proposition
    /credits             # Recharger crédits
    /settings            # Paramètres compte

/lib
  /ai
    /claude.ts           # Client Claude + fonctions extraction
  /stripe
    /client.ts           # Client Stripe
  /parsers
    /pdf.ts              # Parser PDF
    /word.ts             # Parser Word
    /excel.ts            # Parser Excel
  /generators (MODIFICATION DIRECTE DES TEMPLATES)
    /word.ts             # Dupliquer et modifier Word
    /excel.ts            # Dupliquer et modifier Excel
    /pdf.ts              # Dupliquer et modifier PDF
  /supabase
    /client.ts           # Client Supabase
    /server.ts           # Server client Supabase
  /utils
    /validation.ts       # Schémas Zod
    /formatting.ts       # Helpers formatage

/components
  /admin
    /OrganizationForm    # Formulaire création client
    /AnalyticsDashboard  # Dashboard analytics
    /ClientList          # Liste clients
  /client
    /TemplateWizard      # Wizard création template
    /PropositionEditor   # Éditeur proposition
    /CreditRecharge      # Interface recharge crédits
  /ui                    # Composants shadcn/ui

🔐 Authentification et sécurité
Supabase Auth

Admin : Email/password avec rôle admin dans la table auth.users metadata
Clients : Email/password avec organization_id dans metadata
Row Level Security (RLS) :

sql  -- Exemple: Les clients ne voient que leurs propres données
  CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'admin');
  
  CREATE POLICY "Users can view their own templates"
  ON proposition_templates FOR SELECT
  USING (
    organization_id = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );
  
  CREATE POLICY "Users can view their own propositions"
  ON propositions FOR SELECT
  USING (
    organization_id = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );

🔄 Workflows détaillés
1️⃣ WORKFLOW ADMIN : Création d'un client
Interface : /admin/clients/new
Formulaire :
typescriptinterface OrganizationForm {
  nom: string;
  email: string;
  password: string; // Généré ou saisi
  secteur: 'telephonie' | 'bureautique' | 'mixte';
  
  // Configuration IA
  claude_model: string; // Par défaut: 'claude-3-5-sonnet-20241022'
  prompt_template: string; // Textarea grande
  
  // Champs par défaut (multi-select)
  champs_defaut: string[]; // Liste prédéfinie + option "Ajouter custom"
  
  // Tarification
  tarif_par_proposition: number; // En euros
}
Champs par défaut suggérés :
typescriptconst DEFAULT_FIELDS = [
  // Informations client
  'nom_entreprise',
  'raison_sociale',
  'siret',
  'adresse_complete',
  'code_postal',
  'ville',
  'contact_nom',
  'contact_prenom',
  'contact_fonction',
  'contact_email',
  'contact_telephone',
  
  // Équipements
  'equipements_actuels',
  'marques_modeles',
  'quantites',
  'dates_installation',
  'etat_propriete', // Location ou propriété
  
  // Volumes et usage
  'volumes_mensuels_nb',
  'volumes_mensuels_couleur',
  'nombre_lignes_telephoniques',
  'minutes_communication',
  'data_mobile_go',
  
  // Contractuel
  'fournisseur_actuel',
  'date_debut_contrat',
  'date_fin_contrat',
  'duree_engagement_restante',
  'preavis',
  
  // Coûts
  'loyer_mensuel',
  'abonnements_telecoms',
  'cout_clic_page',
  'couts_communications',
  'total_mensuel_ht',
  'total_mensuel_ttc',
  'total_annuel',
  
  // Problématiques
  'points_douleur',
  'insatisfactions',
  'besoins_exprimes'
];
```

**Prompt template exemple** :
```
Tu es un expert en analyse de documents commerciaux du secteur {secteur}.

Analyse ce(s) document(s) et extrais les informations suivantes en JSON :

INFORMATIONS À EXTRAIRE:
{liste_champs_actifs}

INSTRUCTIONS CRITIQUES:
- Sois extrêmement précis sur les chiffres et montants
- Pour les montants, inclus toujours la devise (€)
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Si une information n'est pas présente, mets null (pas de string vide)
- Extrais TOUS les équipements/services listés dans le document
- Pour les tableaux, structure bien en array d'objets

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec un JSON valide et structuré, sans markdown ni texte supplémentaire.
API Route : /api/admin/organizations/create
typescript// app/api/admin/organizations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Vérifier que l'utilisateur est admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const body = await request.json();
    
    // 1. Créer le compte Auth Supabase pour le client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        role: 'client',
        organization_name: body.nom
      }
    });
    
    if (authError) throw authError;
    
    // 2. Créer le client Stripe
    const stripeCustomer = await stripe.customers.create({
      email: body.email,
      name: body.nom,
      metadata: {
        supabase_user_id: authData.user.id
      }
    });
    
    // 3. Créer l'organization dans la BDD
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: authData.user.id, // Même ID que le user Auth
        nom: body.nom,
        email: body.email,
        secteur: body.secteur,
        claude_model: body.claude_model || 'claude-3-5-sonnet-20241022',
        prompt_template: body.prompt_template,
        champs_defaut: body.champs_defaut,
        tarif_par_proposition: body.tarif_par_proposition,
        stripe_customer_id: stripeCustomer.id,
        credits: 0,
        quotas: {
          tailleMaxDocumentMB: 50,
          nombreMaxDocumentsParProposition: 10,
          tokensMaxParProposition: 200000
        }
      })
      .select()
      .single();
    
    if (orgError) throw orgError;
    
    return NextResponse.json({ success: true, organization: org });
    
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}

2️⃣ WORKFLOW CLIENT : Création d'un template de proposition (4 étapes)
ÉTAPE 1 : Sélection des champs
Interface : /templates/new/step-1
typescriptinterface Step1Form {
  nom_template: string; // "Proposition standard copieurs"
  description?: string;
  champs_actifs: string[]; // Sélection depuis champs_defaut + custom
}
Composant :
tsx// components/client/TemplateWizard/Step1.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Step1({ organization }) {
  const router = useRouter();
  const [nomTemplate, setNomTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  
  // Grouper les champs par catégorie
  const fieldCategories = {
    'Informations client': ['nom_entreprise', 'adresse_complete', 'contact_email', 'contact_telephone'],
    'Équipements': ['equipements_actuels', 'marques_modeles', 'quantites'],
    'Volumes': ['volumes_mensuels_nb', 'volumes_mensuels_couleur'],
    'Coûts': ['total_mensuel_ht', 'total_mensuel_ttc', 'total_annuel']
  };
  
  const handleNext = async () => {
    // Sauvegarder temporairement dans localStorage
    const templateDraft = {
      step: 1,
      nom_template: nomTemplate,
      description,
      champs_actifs: [...selectedFields, ...customFields.filter(f => f.trim())]
    };
    localStorage.setItem('template_draft', JSON.stringify(templateDraft));
    router.push('/templates/new/step-2');
  };
  
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Étape 1 : Configuration du template</h1>
      
      <div className="mb-8">
        <label className="block mb-2 font-semibold">Nom du template</label>
        <Input
          value={nomTemplate}
          onChange={(e) => setNomTemplate(e.target.value)}
          placeholder="Ex: Proposition standard copieurs"
          className="mb-4"
        />
        
        <label className="block mb-2 font-semibold">Description (optionnel)</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Pour les clients bureautique avec parc < 10 machines"
        />
      </div>
      
      <h2 className="text-xl font-semibold mb-4">Sélectionnez les champs à extraire</h2>
      
      {Object.entries(fieldCategories).map(([category, fields]) => (
        <div key={category} className="mb-6">
          <h3 className="font-semibold mb-3 text-blue-600">{category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(field => (
              <div key={field} className="flex items-center space-x-2">
                <Checkbox
                  id={field}
                  checked={selectedFields.includes(field)}
                  onCheckedChange={(checked) => {
                    setSelectedFields(prev =>
                      checked
                        ? [...prev, field]
                        : prev.filter(f => f !== field)
                    );
                  }}
                />
                <label htmlFor={field} className="cursor-pointer">{field}</label>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {/* Champs custom */}
      <div className="mt-8 p-4 border rounded-lg bg-gray-50">
        <h3 className="font-semibold mb-3">Champs personnalisés</h3>
        {customFields.map((field, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <Input
              value={field}
              onChange={(e) => {
                const newCustomFields = [...customFields];
                newCustomFields[index] = e.target.value;
                setCustomFields(newCustomFields);
              }}
              placeholder="Nom du champ personnalisé"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomFields(customFields.filter((_, i) => i !== index));
              }}
            >
              Supprimer
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => setCustomFields([...customFields, ''])}
          className="mt-2"
        >
          + Ajouter un champ
        </Button>
      </div>
      
      <div className="mt-8 flex justify-end">
        <Button 
          onClick={handleNext} 
          disabled={!nomTemplate || selectedFields.length === 0}
        >
          Suivant →
        </Button>
      </div>
    </div>
  );
}

ÉTAPE 2 : Upload du template master
Interface : /templates/new/step-2
typescriptinterface Step2Form {
  file: File; // Excel, Word, ou PDF
  file_config?: object; // Selon le type de fichier
}
Composant avec détection de format :
tsx// components/client/TemplateWizard/Step2.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

export function Step2() {
  const router = useRouter();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileStructure, setFileStructure] = useState<any>(null);
  const [fileConfig, setFileConfig] = useState<any>({});
  const [preview, setPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      
      setUploadedFile(file);
      setIsLoading(true);
      
      // Parser le fichier pour preview
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('/api/organizations/templates/parse', {
          method: 'POST',
          body: formData
        });
        
        const { structure, preview } = await response.json();
        setFileStructure(structure);
        setPreview(preview);
        
        // Configuration par défaut selon le type
        if (file.name.endsWith('.xlsx') && structure.sheets) {
          setFileConfig({
            feuilleCiblee: structure.sheets[0],
            preserverFormules: true,
            cellMappings: {},
            cellulesAvecFormules: []
          });
        } else if (file.name.endsWith('.docx')) {
          setFileConfig({
            formatVariables: '{{var}}',
            fieldMappings: {},
            tableauxDynamiques: []
          });
        } else if (file.name.endsWith('.pdf')) {
          setFileConfig({
            type: 'formulaire_remplissable',
            champsFormulaire: {}
          });
        }
      } catch (error) {
        console.error('Erreur parsing:', error);
        alert('Erreur lors de l\'analyse du fichier');
      } finally {
        setIsLoading(false);
      }
    }
  });
  
  const handleNext = async () => {
    if (!uploadedFile) return;
    
    setIsLoading(true);
    
    try {
      // Upload vers Supabase Storage
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('config', JSON.stringify(fileConfig));
      
      const response = await fetch('/api/organizations/templates/upload', {
        method: 'POST',
        body: formData
      });
      
      const { file_url, file_type } = await response.json();
      
      // Mettre à jour le draft
      const draft = JSON.parse(localStorage.getItem('template_draft') || '{}');
      draft.step = 2;
      draft.file_url = file_url;
      draft.file_name = uploadedFile.name;
      draft.file_type = file_type;
      draft.file_config = fileConfig;
      draft.file_structure = fileStructure;
      localStorage.setItem('template_draft', JSON.stringify(draft));
      
      router.push('/templates/new/step-3');
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Étape 2 : Uploadez votre template</h1>
      
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed p-12 text-center cursor-pointer rounded-lg transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-6xl mb-4">📄</div>
        {isDragActive ? (
          <p className="text-lg">Déposez le fichier ici...</p>
        ) : (
          <>
            <p className="text-lg mb-2">Glissez votre fichier ici ou cliquez pour sélectionner</p>
            <p className="text-sm text-gray-500">Excel (.xlsx), Word (.docx) ou PDF (max 50MB)</p>
          </>
        )}
      </div>
      
      {isLoading && (
        <div className="mt-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2">Analyse du fichier...</p>
        </div>
      )}
      
      {uploadedFile && !isLoading && (
        <div className="mt-8">
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              ✅ Fichier chargé : {uploadedFile.name}
            </h3>
            <p className="text-sm text-gray-600">
              Taille : {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          
          {/* Configuration spécifique Excel */}
          {uploadedFile.name.endsWith('.xlsx') && fileStructure?.sheets && (
            <div className="mb-6 p-4 border rounded-lg">
              <label className="block mb-2 font-semibold">
                Sélectionnez la feuille à remplir automatiquement :
              </label>
              <select
                className="w-full border p-2 rounded"
                value={fileConfig.feuilleCiblee}
                onChange={(e) => setFileConfig({ ...fileConfig, feuilleCiblee: e.target.value })}
              >
                {fileStructure.sheets.map((sheet: string) => (
                  <option key={sheet} value={sheet}>{sheet}</option>
                ))}
              </select>
              
              <div className="mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fileConfig.preserverFormules}
                    onChange={(e) => setFileConfig({ 
                      ...fileConfig, 
                      preserverFormules: e.target.checked 
                    })}
                  />
                  <span>Préserver les formules Excel</span>
                </label>
              </div>
            </div>
          )}
          
          {/* Configuration spécifique Word */}
          {uploadedFile.name.endsWith('.docx') && (
            <div className="mb-6 p-4 border rounded-lg">
              <label className="block mb-2 font-semibold">
                Format des variables détectées :
              </label>
              <p className="text-sm text-gray-600 mb-2">
                Variables trouvées : {fileStructure?.variables?.length || 0}
              </p>
              {fileStructure?.variables && fileStructure.variables.length > 0 && (
                <div className="bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                  {fileStructure.variables.map((v: string, i: number) => (
                    <div key={i} className="text-sm font-mono">{`{{${v}}}`}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Preview */}
          {preview && (
            <div className="border p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">Prévisualisation</h4>
              <div 
                className="max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: preview }} 
              />
            </div>
          )}
        </div>
      )}
      
      <div className="mt-8 flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => router.back()}
        >
          ← Retour
        </Button>
        <Button 
          onClick={handleNext} 
          disabled={!uploadedFile || isLoading}
        >
          Suivant →
        </Button>
      </div>
    </div>
  );
}
API Route : /api/organizations/templates/parse
typescript// app/api/organizations/templates/parse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    const buffer = await file.arrayBuffer();
    const fileName = file.name;
    
    let structure: any = {};
    let preview = '';
    
    if (fileName.endsWith('.xlsx')) {
      // Parser Excel
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      
      structure.sheets = workbook.worksheets.map(ws => ws.name);
      
      // Preview de la première feuille (10 premières lignes)
      const firstSheet = workbook.worksheets[0];
      preview = '<table class="border-collapse border border-gray-300">';
      let rowCount = 0;
      firstSheet.eachRow((row, rowNumber) => {
        if (rowCount < 10) {
          preview += '<tr>';
          row.eachCell((cell, colNumber) => {
            if (colNumber <= 10) { // Limiter à 10 colonnes
              preview += `<td class="border border-gray-300 p-2">${cell.value || ''}</td>`;
            }
          });
          preview += '</tr>';
          rowCount++;
        }
      });
      preview += '</table>';
      
    } else if (fileName.endsWith('.docx')) {
      // Parser Word
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
      preview = result.value.substring(0, 5000); // Preview premiers 5000 chars
      
      // Détecter les variables (format {{variable}})
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const variables: string[] = [];
      let match;
      while ((match = variableRegex.exec(result.value)) !== null) {
        variables.push(match[1]);
      }
      structure.variables = [...new Set(variables)]; // Dédupliquer
      
    } else if (fileName.endsWith('.pdf')) {
      // Parser PDF
      const pdfData = await pdfParse(Buffer.from(buffer));
      preview = `<pre class="whitespace-pre-wrap">${pdfData.text.substring(0, 5000)}</pre>`;
      structure.pages = pdfData.numpages;
    }
    
    return NextResponse.json({ structure, preview });
    
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse file', details: error.message },
      { status: 500 }
    );
  }
}
API Route : /api/organizations/templates/upload
typescript// app/api/organizations/templates/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Vérifier l'authentification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Déterminer le type de fichier
    const fileName = file.name;
    let fileType: string;
    if (fileName.endsWith('.xlsx')) {
      fileType = 'excel';
    } else if (fileName.endsWith('.docx')) {
      fileType = 'word';
    } else if (fileName.endsWith('.pdf')) {
      fileType = 'pdf';
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }
    
    // Upload vers Supabase Storage dans le dossier de l'organisation
    const buffer = await file.arrayBuffer();
    const storagePath = `${user.id}/${Date.now()}-${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('templates')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    // Obtenir l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('templates')
      .getPublicUrl(storagePath);
    
    return NextResponse.json({
      success: true,
      file_url: publicUrl,
      file_type: fileType,
      storage_path: storagePath
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    );
  }
}

ÉTAPE 3 : Mapping intelligent des champs
Interface : /templates/new/step-3
tsx// components/client/TemplateWizard/Step3.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function Step3() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [templateFields, setTemplateFields] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, any>>({});
  
  useEffect(() => {
    // Charger le draft
    const draftStr = localStorage.getItem('template_draft');
    if (!draftStr) {
      router.push('/templates/new/step-1');
      return;
    }
    
    const parsedDraft = JSON.parse(draftStr);
    setDraft(parsedDraft);
    
    // Extraire les champs du template selon le type
    let fields: string[] = [];
    
    if (parsedDraft.file_type === 'word' && parsedDraft.file_structure?.variables) {
      // Pour Word : les variables détectées
      fields = parsedDraft.file_structure.variables.map((v: string) => `{{${v}}}`);
    } else if (parsedDraft.file_type === 'excel') {
      // Pour Excel : demander à l'utilisateur de définir les cellules
      // Pour l'instant, on laisse vide - l'utilisateur ajoutera manuellement
      fields = [];
    } else if (parsedDraft.file_type === 'pdf') {
      // Pour PDF : les champs de formulaire (si disponible)
      fields = [];
    }
    
    setTemplateFields(fields);
    
    // Générer des suggestions intelligentes
    const suggestions = generateSmartMappings(fields, parsedDraft.champs_actifs);
    setSuggestedMappings(suggestions);
    
    // Appliquer automatiquement les suggestions avec confiance > 80%
    const autoMappings: Record<string, string> = {};
    for (const [field, suggestion] of Object.entries(suggestions)) {
      if (suggestion.confidence >= 80) {
        autoMappings[field] = suggestion.suggested;
      }
    }
    setMappings(autoMappings);
    
  }, [router]);
  
  const generateSmartMappings = (
    templateFields: string[],
    extractionFields: string[]
  ): Record<string, any> => {
    const suggestions: Record<string, any> = {};
    
    for (const templateField of templateFields) {
      const normalized = templateField
        .toLowerCase()
        .replace(/[{}\s_-]/g, '');
      
      const matches = extractionFields
        .map(field => ({
          field,
          score: calculateSimilarity(normalized, field.toLowerCase().replace(/[_-]/g, ''))
        }))
        .filter(m => m.score > 0.3)
        .sort((a, b) => b.score - a.score);
      
      if (matches.length > 0) {
        suggestions[templateField] = {
          suggested: matches[0].field,
          confidence: Math.round(matches[0].score * 100),
          alternatives: matches.slice(1, 3).map(m => m.field)
        };
      }
    }
    
    return suggestions;
  };
  
  // Similarité simple basée sur la distance de Levenshtein
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };
  
  const handleNext = () => {
    // Construire la configuration finale selon le type de fichier
    let finalConfig = { ...draft.file_config };
    
    if (draft.file_type === 'word') {
      finalConfig.fieldMappings = mappings;
    } else if (draft.file_type === 'excel') {
      finalConfig.cellMappings = mappings;
    } else if (draft.file_type === 'pdf') {
      finalConfig.champsFormulaire = mappings;
    }
    
    // Mettre à jour le draft
    draft.step = 3;
    draft.file_config = finalConfig;
    localStorage.setItem('template_draft', JSON.stringify(draft));
    
    router.push('/templates/new/step-4');
  };
  
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  
  const addManualMapping = () => {
    if (newFieldKey && newFieldValue) {
      setMappings({ ...mappings, [newFieldKey]: newFieldValue });
      setTemplateFields([...templateFields, newFieldKey]);
      setNewFieldKey('');
      setNewFieldValue('');
    }
  };
  
  if (!draft) return <div>Chargement...</div>;
  
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Étape 3 : Mappez les champs</h1>
      
      <div className="grid grid-cols-2 gap-8">
        {/* Colonne gauche : Champs du template */}
        <div>
          <h3 className="font-semibold text-lg mb-4 text-blue-600">
            Champs du template
          </h3>
          
          {templateFields.length === 0 && draft.file_type === 'excel' && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
              <p className="text-sm">
                Pour Excel, vous devez ajouter manuellement les cellules à remplir (ex: B5, D10, etc.)
              </p>
            </div>
          )}
          
          {templateFields.map((field, index) => (
            <div key={index} className="mb-4 p-4 border rounded-lg bg-white shadow-sm">
              <div className="font-mono text-sm mb-2 font-semibold">{field}</div>
              
              {suggestedMappings[field] && (
                <div className="bg-blue-50 border border-blue-200 p-2 rounded mb-2 text-sm">
                  <span className="text-blue-700">
                    🤖 Suggestion ({suggestedMappings[field].confidence}%) :
                  </span>
                  <strong className="ml-1">{suggestedMappings[field].suggested}</strong>
                </div>
              )}
              
              <Select
                value={mappings[field] || ''}
                onValueChange={(value) => setMappings({ ...mappings, [field]: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="-- Sélectionner un champ --" />
                </SelectTrigger>
                <SelectContent>
                  {draft.champs_actifs.map((extractionField: string) => (
                    <SelectItem key={extractionField} value={extractionField}>
                      {extractionField}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {suggestedMappings[field]?.alternatives && (
                <div className="mt-2 text-xs text-gray-500">
                  Alternatives : {suggestedMappings[field].alternatives.join(', ')}
                </div>
              )}
            </div>
          ))}
          
          {/* Ajouter un mapping manuel */}
          <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <h4 className="font-semibold mb-3">Ajouter un mapping manuel</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder={draft.file_type === 'excel' ? "Cellule (ex: B5)" : "Champ template"}
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                className="border p-2 rounded"
              />
              <Select value={newFieldValue} onValueChange={setNewFieldValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Champ d'extraction" />
                </SelectTrigger>
                <SelectContent>
                  {draft.champs_actifs.map((field: string) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addManualMapping} variant="outline" size="sm">
              + Ajouter
            </Button>
          </div>
        </div>
        
        {/* Colonne droite : Champs d'extraction disponibles */}
        <div>
          <h3 className="font-semibold text-lg mb-4 text-green-600">
            Champs d'extraction disponibles
          </h3>
          <div className="border p-4 rounded-lg bg-gray-50 sticky top-4">
            {draft.champs_actifs.map((field: string) => {
              const isMapped = Object.values(mappings).includes(field);
              return (
                <div
                  key={field}
                  className={`py-2 px-3 mb-1 rounded ${
                    isMapped ? 'bg-green-100 text-green-800' : 'bg-white'
                  }`}
                >
                  {isMapped && <span className="mr-2">✓</span>}
                  {field}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
            <strong>Astuce :</strong> Les champs avec ✓ sont déjà mappés à un champ du template.
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          ← Retour
        </Button>
        <Button onClick={handleNext}>
          Suivant →
        </Button>
      </div>
    </div>
  );
}

ÉTAPE 4 : Test avec vrais documents
Interface : /templates/new/step-4
tsx// components/client/TemplateWizard/Step4.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';

export function Step4() {
  const router = useRouter();
  const [draft, setDraft] = useState<any>(null);
  const [testDocuments, setTestDocuments] = useState<File[]>([]);
  const [testResult, setTestResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  useEffect(() => {
    const draftStr = localStorage.getItem('template_draft');
    if (!draftStr) {
      router.push('/templates/new/step-1');
      return;
    }
    setDraft(JSON.parse(draftStr));
  }, [router]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png']
    },
    maxFiles: 5,
    onDrop: (files) => setTestDocuments(files)
  });
  
  const runTest = async () => {
    if (!draft || testDocuments.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      testDocuments.forEach(doc => formData.append('documents', doc));
      formData.append('champs_actifs', JSON.stringify(draft.champs_actifs));
      formData.append('file_config', JSON.stringify(draft.file_config));
      formData.append('file_url', draft.file_url);
      formData.append('file_type', draft.file_type);
      
      const response = await fetch('/api/organizations/templates/test', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      console.error('Test error:', error);
      alert('Erreur lors du test');
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleSaveTemplate = async () => {
    if (!draft || !testResult) return;
    
    try {
      // Créer le template en BDD
      const response = await fetch('/api/organizations/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: draft.nom_template,
          description: draft.description,
          file_url: draft.file_url,
          file_name: draft.file_name,
          file_type: draft.file_type,
          file_config: draft.file_config,
          champs_actifs: draft.champs_actifs,
          statut: 'actif',
          test_result: testResult
        })
      });
      
      const { template_id } = await response.json();
      
      // Nettoyer le draft
      localStorage.removeItem('template_draft');
      
      // Rediriger vers la liste des templates
      router.push(`/templates/${template_id}`);
    } catch (error) {
      console.error('Save error:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };
  
  if (!draft) return <div>Chargement...</div>;
  
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Étape 4 : Testez l'extraction</h1>
      
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed p-8 mb-8 rounded-lg text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-5xl mb-2">📎</div>
        {isDragActive ? (
          <p>Déposez les documents ici...</p>
        ) : (
          <>
            <p className="text-lg mb-1">Uploadez des documents clients pour tester l'extraction</p>
            <p className="text-sm text-gray-500">PDF ou images (max 5 fichiers)</p>
          </>
        )}
      </div>
      
      {testDocuments.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold mb-2">Documents uploadés :</h3>
          <div className="grid grid-cols-2 gap-2">
            {testDocuments.map((doc, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span>📄</span>
                <span className="text-sm truncate">{doc.name}</span>
                <span className="text-xs text-gray-500">
                  ({(doc.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ))}
          </div>
          
          <Button 
            onClick={runTest} 
            disabled={isProcessing} 
            className="mt-4"
            size="lg"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Extraction en cours...
              </>
            ) : (
              '🚀 Lancer le test'
            )}
          </Button>
        </div>
      )}
      
      {testResult && (
        <div className="space-y-8">
          {/* Données extraites */}
          <div className="border rounded-lg p-6 bg-white shadow">
            <h3 className="font-semibold text-xl mb-4 flex items-center gap-2">
              <span>✅</span> Données extraites
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(testResult.extraction.champsExtraits).map(([key, value]: [string, any]) => (
                <div key={key} className="border p-3 rounded bg-gray-50">
                  <div className="text-sm text-gray-600 mb-1">{key}</div>
                  <div className="font-semibold">{String(value) || 'N/A'}</div>
                  <div className="text-xs mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded ${
                      testResult.extraction.confiance[key] >= 80 
                        ? 'bg-green-100 text-green-700'
                        : testResult.extraction.confiance[key] >= 60
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      Confiance: {testResult.extraction.confiance[key]}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Preview avant/après */}
          <div className="border rounded-lg p-6 bg-white shadow">
            <h3 className="font-semibold text-xl mb-4 flex items-center gap-2">
              <span>👁️</span> Prévisualisation
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2 text-gray-600">Avant (template vide)</h4>
                <div 
                  className="border p-4 rounded bg-gray-50 max-h-96 overflow-y-auto" 
                  dangerouslySetInnerHTML={{ __html: testResult.preview.before }} 
                />
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-green-600">Après remplissage</h4>
                <div 
                  className="border p-4 rounded bg-green-50 max-h-96 overflow-y-auto" 
                  dangerouslySetInnerHTML={{ __html: testResult.preview.after }} 
                />
              </div>
            </div>
          </div>
          
          {/* Warnings */}
          {(testResult.validation.champsManquants.length > 0 || 
            testResult.validation.valeursIncertaines.length > 0) && (
            <div className="space-y-4">
              {testResult.validation.champsManquants.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-300 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <span>⚠️</span> Champs non extraits
                  </h4>
                  <ul className="list-disc list-inside">
                    {testResult.validation.champsManquants.map((champ: string, i: number) => (
                      <li key={i} className="text-sm">{champ}</li>
                    ))}
                  </ul>
                  <p className="text-sm mt-2 text-gray-600">
                    Ces champs n'ont pas pu être extraits des documents. 
                    Vérifiez que les informations sont présentes dans les documents sources.
                  </p>
                </div>
              )}
              
              {testResult.validation.valeursIncertaines.length > 0 && (
                <div className="bg-orange-50 border border-orange-300 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <span>🤔</span> Valeurs incertaines (confiance &lt; 80%)
                  </h4>
                  {testResult.validation.valeursIncertaines.map((item: any, i: number) => (
                    <div key={i} className="mb-2 text-sm">
                      <strong>{item.champ}</strong>: {item.valeur} 
                      <span className="text-orange-600 ml-2">
                        (confiance: {item.confiance}%)
                      </span>
                    </div>
                  ))}
                  <p className="text-sm mt-2 text-gray-600">
                    Ces valeurs ont été extraites avec une confiance faible. 
                    Vous pourrez les corriger manuellement lors de la génération.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          ← Retour
        </Button>
        <Button 
          onClick={handleSaveTemplate} 
          disabled={!testResult}
          size="lg"
        >
          ✅ Valider et sauvegarder le template
        </Button>
      </div>
    </div>
  );
}
API Route : /api/organizations/templates/test
typescript// app/api/organizations/templates/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractWithClaude } from '@/lib/ai/claude';
import { generatePreview } from '@/lib/generators/preview';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];
  
  try {
    const supabase = createClient();
    
    // Vérifier l'authentification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Récupérer l'organization
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.id)
      .single();
    
    const formData = await request.formData();
    const documents = formData.getAll('documents') as File[];
    const champsActifs = JSON.parse(formData.get('champs_actifs') as string);
    const fileConfig = JSON.parse(formData.get('file_config') as string);
    const fileUrl = formData.get('file_url') as string;
    const fileType = formData.get('file_type') as string;
    
    if (documents.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }
    
    // 1. Sauvegarder temporairement les documents uploadés
    const documentPaths: Array<{path: string, type: string}> = [];
    
    for (const doc of documents) {
      const buffer = await doc.arrayBuffer();
      const tempPath = path.join(os.tmpdir(), `${Date.now()}-${doc.name}`);
      await fs.promises.writeFile(tempPath, Buffer.from(buffer));
      tempFiles.push(tempPath);
      documentPaths.push({ path: tempPath, type: doc.type });
    }
    
    // 2. Extraire avec Claude
    const extractionResult = await extractWithClaude(
      documentPaths,
      champsActifs,
      org.prompt_template
    );
    
    // 3. Appliquer le mapping selon le type de fichier
    const mappedData: Record<string, any> = {};
    
    if (fileType === 'word' && fileConfig.fieldMappings) {
      for (const [templateVar, dataKey] of Object.entries(fileConfig.fieldMappings)) {
        mappedData[templateVar] = extractionResult.data[dataKey as string];
      }
    } else if (fileType === 'excel' && fileConfig.cellMappings) {
      for (const [cellAddress, dataKey] of Object.entries(fileConfig.cellMappings)) {
        mappedData[cellAddress] = extractionResult.data[dataKey as string];
      }
    } else if (fileType === 'pdf' && fileConfig.champsFormulaire) {
      for (const [pdfField, dataKey] of Object.entries(fileConfig.champsFormulaire)) {
        mappedData[pdfField] = extractionResult.data[dataKey as string];
      }
    }
    
    // 4. Générer les previews avant/après
    const preview = await generatePreview(
      fileUrl,
      fileType,
      mappedData,
      fileConfig
    );
    
    // 5. Validation des résultats
    const champsManquants = champsActifs.filter(
      (champ: string) => !extractionResult.data[champ] || extractionResult.data[champ] === null
    );
    
    const valeursIncertaines = Object.entries(extractionResult.confidence)
      .filter(([_, confidence]) => confidence < 80)
      .map(([champ, confidence]) => ({
        champ,
        valeur: extractionResult.data[champ],
        confiance: confidence
      }));
    
    return NextResponse.json({
      extraction: {
        champsExtraits: extractionResult.data,
        confiance: extractionResult.confidence
      },
      preview,
      validation: {
        champsManquants,
        valeursIncertaines
      },
      tokensUsed: extractionResult.tokensUsed,
      cost: extractionResult.cost
    });
    
  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error.message },
      { status: 500 }
    );
  } finally {
    // Nettoyer les fichiers temporaires
    for (const tempFile of tempFiles) {
      try {
        await fs.promises.unlink(tempFile);
      } catch (err) {
        console.error('Failed to delete temp file:', tempFile, err);
      }
    }
  }
}

3️⃣ GÉNÉRATION DE FICHIERS (Duplication + Modification)
Générateur Word
typescript// lib/generators/word.ts
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { createClient } from '@/lib/supabase/server';

export async function fillWordTemplate(
  templateUrl: string,
  data: Record<string, any>,
  fileConfig: {
    fieldMappings: Record<string, string>; // {{template_var}}: "data_key"
    formatVariables?: string; // Format des variables (défaut: {{var}})
  }
): Promise<string> {
  
  const supabase = createClient();
  
  // 1. Télécharger le template master
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch template');
  }
  const templateBuffer = await response.arrayBuffer();
  
  // 2. Charger le template avec PizZip
  const zip = new PizZip(Buffer.from(templateBuffer));
  
  // 3. Initialiser Docxtemplater
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: '{{',
      end: '}}'
    }
  });
  
  // 4. Préparer les données selon le mapping
  const mappedData: Record<string, any> = {};
  
  for (const [templateVar, dataKey] of Object.entries(fileConfig.fieldMappings)) {
    // Nettoyer le nom de variable (enlever {{ }})
    const cleanVar = templateVar.replace(/[{}]/g, '');
    mappedData[cleanVar] = data[dataKey] || '';
  }
  
  // 5. Remplir le template (MODIFICATION DIRECTE)
  doc.render(mappedData);
  
  // 6. Générer le buffer du fichier modifié
  const filledBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  
  // 7. Upload du fichier dupliqué et modifié vers Supabase Storage
  const fileName = `proposition-${Date.now()}.docx`;
  const { error } = await supabase.storage
    .from('propositions')
    .upload(fileName, filledBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false
    });
  
  if (error) throw error;
  
  // 8. Obtenir l'URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('propositions')
    .getPublicUrl(fileName);
  
  return publicUrl;
}
Générateur Excel
typescript// lib/generators/excel.ts
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';

export async function fillExcelTemplate(
  templateUrl: string,
  data: Record<string, any>,
  fileConfig: {
    feuilleCiblee: string;
    cellMappings: Record<string, string>; // {B5: "nom_entreprise", D10: "cout_mensuel"}
    preserverFormules?: boolean;
    cellulesAvecFormules?: string[];
  }
): Promise<string> {
  
  const supabase = createClient();
  
  // 1. Télécharger le template master
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch template');
  }
  const templateBuffer = await response.arrayBuffer();
  
  // 2. Charger le workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  
  // 3. Sélectionner la feuille cible
  const worksheet = workbook.getWorksheet(fileConfig.feuilleCiblee);
  
  if (!worksheet) {
    throw new Error(`Feuille "${fileConfig.feuilleCiblee}" introuvable`);
  }
  
  // 4. Remplir les cellules selon le mapping (MODIFICATION DIRECTE)
  for (const [cellAddress, dataKey] of Object.entries(fileConfig.cellMappings)) {
    
    // Skip les cellules avec formules à préserver
    if (fileConfig.cellulesAvecFormules?.includes(cellAddress)) {
      continue;
    }
    
    const cell = worksheet.getCell(cellAddress);
    
    // Préserver le style de la cellule
    const originalStyle = { ...cell.style };
    const originalNumFmt = cell.numFmt;
    
    // Injecter la valeur
    const value = data[dataKey];
    
    // Gérer les types de données
    if (value === null || value === undefined) {
      cell.value = '';
    } else if (typeof value === 'number') {
      cell.value = value;
    } else if (value instanceof Date) {
      cell.value = value;
    } else {
      cell.value = value.toString();
    }
    
    // Réappliquer le style ET le format numérique
    cell.style = originalStyle;
    if (originalNumFmt) {
      cell.numFmt = originalNumFmt; // Ex: '#,##0.00 €' pour les montants
    }
  }
  
  // 5. Forcer le recalcul des formules
  if (fileConfig.preserverFormules !== false) {
    workbook.calcProperties = {
      fullCalcOnLoad: true
    };
  }
  
  // 6. Générer le buffer du fichier modifié
  const filledBuffer = await workbook.xlsx.writeBuffer();
  
  // 7. Upload vers Supabase Storage
  const fileName = `proposition-${Date.now()}.xlsx`;
  const { error } = await supabase.storage
    .from('propositions')
    .upload(fileName, filledBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false
    });
  
  if (error) throw error;
  
  // 8. Obtenir l'URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('propositions')
    .getPublicUrl(fileName);
  
  return publicUrl;
}
Générateur PDF
typescript// lib/generators/pdf.ts
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';

export async function fillPDFTemplate(
  templateUrl: string,
  data: Record<string, any>,
  fileConfig: {
    type: 'formulaire_remplissable';
    champsFormulaire: Record<string, string>; // {field_name: "data_key"}
  }
): Promise<string> {
  
  const supabase = createClient();
  
  // 1. Télécharger le template master
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch template');
  }
  const templateBuffer = await response.arrayBuffer();
  
  // 2. Charger le PDF
  const pdfDoc = await PDFDocument.load(templateBuffer);
  
  // 3. Remplir les champs de formulaire PDF (MODIFICATION DIRECTE)
  const form = pdfDoc.getForm();
  
  for (const [pdfFieldName, dataKey] of Object.entries(fileConfig.champsFormulaire)) {
    try {
      const field = form.getTextField(pdfFieldName);
      const value = data[dataKey];
      field.setText(value?.toString() || '');
    } catch (error) {
      console.warn(`Champ PDF "${pdfFieldName}" introuvable ou non modifiable`, error);
    }
  }
  
  // Optionnel : Aplatir le formulaire (rendre non-éditable)
  // form.flatten();
  
  // 4. Sauvegarder le PDF modifié
  const filledBuffer = await pdfDoc.save();
  
  // 5. Upload vers Supabase Storage
  const fileName = `proposition-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from('propositions')
    .upload(fileName, filledBuffer, {
      contentType: 'application/pdf',
      upsert: false
    });
  
  if (error) throw error;
  
  // 6. Obtenir l'URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('propositions')
    .getPublicUrl(fileName);
  
  return publicUrl;
}

4️⃣ EXTRACTION AVEC CLAUDE AI
typescript// lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface ExtractionResult {
  data: Record<string, any>;
  confidence: Record<string, number>;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export async function extractWithClaude(
  documentPaths: Array<{path: string, type: string}>,
  fieldsToExtract: string[],
  customPrompt: string
): Promise<ExtractionResult> {
  
  // Préparer les documents pour Claude
  const documentContents = documentPaths.map(doc => {
    const buffer = fs.readFileSync(doc.path);
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: doc.type,
        data: buffer.toString('base64'),
      },
    };
  });
  
  // Construire le prompt final
  const finalPrompt = customPrompt
    .replace('{liste_champs_actifs}', fieldsToExtract.join('\n- '))
    .replace('{documents}', '[Documents fournis ci-dessus]');
  
  // Appel à Claude
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          ...documentContents,
          {
            type: "text",
            text: finalPrompt
          }
        ],
      },
    ],
  });
  
  // Parser la réponse
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  // Nettoyer et parser le JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
  const extractedData = JSON.parse(jsonStr);
  
  // Calculer le coût (Prix Claude 3.5 Sonnet)
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const cost = (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);
  
  // Extraire les scores de confiance (si Claude les fournit)
  const confidence: Record<string, number> = {};
  for (const field of fieldsToExtract) {
    // Si Claude retourne un format {valeur: "...", confiance: 95}
    if (extractedData[field]?.confidence) {
      confidence[field] = extractedData[field].confidence;
      extractedData[field] = extractedData[field].value;
    } else {
      // Sinon, confiance par défaut 100%
      confidence[field] = 100;
    }
  }
  
  return {
    data: extractedData,
    confidence,
    tokensUsed: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    },
    cost
  };
}

5️⃣ API ROUTE GÉNÉRATION DE PROPOSITION
typescript// app/api/organizations/propositions/[id]/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fillWordTemplate } from '@/lib/generators/word';
import { fillExcelTemplate } from '@/lib/generators/excel';
import { fillPDFTemplate } from '@/lib/generators/pdf';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const propositionId = params.id;
    const supabase = createClient();
    
    // Vérifier l'authentification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 1. Récupérer la proposition avec le template
    const { data: proposition, error: propError } = await supabase
      .from('propositions')
      .select(`
        *,
        template:proposition_templates(*)
      `)
      .eq('id', propositionId)
      .eq('organization_id', user.id)
      .single();
    
    if (propError) throw propError;
    
    // 2. Vérifier que l'organization a assez de crédits
    const { data: org } = await supabase
      .from('organizations')
      .select('credits, tarif_par_proposition')
      .eq('id', user.id)
      .single();
    
    if (org.credits < org.tarif_par_proposition) {
      return NextResponse.json(
        { error: 'Crédits insuffisants. Veuillez recharger votre compte.' },
        { status: 402 } // Payment Required
      );
    }
    
    // 3. Générer le fichier selon le type (DUPLICATION + MODIFICATION)
    let filledFileUrl: string;
    let generatedFileName: string;
    
    const dataToFill = proposition.filled_data || proposition.extracted_data;
    
    switch (proposition.template.file_type) {
      case 'word':
        filledFileUrl = await fillWordTemplate(
          proposition.template.file_url,
          dataToFill,
          proposition.template.file_config
        );
        generatedFileName = `Proposition-${proposition.nom_client || Date.now()}.docx`;
        break;
      
      case 'excel':
        filledFileUrl = await fillExcelTemplate(
          proposition.template.file_url,
          dataToFill,
          proposition.template.file_config
        );
        generatedFileName = `Proposition-${proposition.nom_client || Date.now()}.xlsx`;
        break;
      
      case 'pdf':
        filledFileUrl = await fillPDFTemplate(
          proposition.template.file_url,
          dataToFill,
          proposition.template.file_config
        );
        generatedFileName = `Proposition-${proposition.nom_client || Date.now()}.pdf`;
        break;
      
      default:
        throw new Error(`Type de fichier non supporté: ${proposition.template.file_type}`);
    }
    
    // 4. Mettre à jour la proposition
    const { error: updateError } = await supabase
      .from('propositions')
      .update({
        duplicated_template_url: filledFileUrl,
        original_template_url: proposition.template.file_url,
        generated_file_name: generatedFileName,
        statut: 'exported',
        exported_at: new Date().toISOString()
      })
      .eq('id', propositionId);
    
    if (updateError) throw updateError;
    
    // 5. Débiter les crédits
    await supabase.rpc('debit_credits', {
      org_id: user.id,
      amount: org.tarif_par_proposition
    });
    
    // 6. Mettre à jour les analytics
    await supabase.rpc('update_analytics', {
      org_id: user.id,
      proposition_id: propositionId
    });
    
    return NextResponse.json({
      success: true,
      file_url: filledFileUrl,
      file_name: generatedFileName
    });
    
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: 'Génération échouée', details: error.message },
      { status: 500 }
    );
  }
}

6️⃣ SYSTÈME DE CRÉDITS ET STRIPE
Configuration Stripe
Variables d'environnement :
bashSTRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
Interface de recharge
Page : /(auth)/credits/page.tsx
tsx// app/(auth)/credits/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function CreditsPage() {
  const [organization, setOrganization] = useState<any>(null);
  const [amount, setAmount] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    // Charger les infos de l'organisation
    fetch('/api/organizations/me')
      .then(res => res.json())
      .then(setOrganization);
  }, []);
  
  const handleRecharge = async () => {
    setIsLoading(true);
    
    try {
      // Créer une session Stripe Checkout
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      
      const { sessionId } = await response.json();
      
      // Rediriger vers Stripe Checkout
      const stripe = await stripePromise;
      await stripe?.redirectToCheckout({ sessionId });
    } catch (error) {
      console.error('Payment error:', error);
      alert('Erreur lors du paiement');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!organization) return <div>Chargement...</div>;
  
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Recharger mes crédits</h1>
      
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-8 rounded-lg mb-8 shadow-lg">
        <div className="text-sm opacity-90 mb-2">Solde actuel</div>
        <div className="text-5xl font-bold">{organization.credits.toFixed(2)} €</div>
        <div className="text-sm mt-4 opacity-90">
          Tarif par proposition : {organization.tarif_par_proposition.toFixed(2)} €
        </div>
      </div>
      
      <div className="mb-8">
        <label className="block mb-3 font-semibold">Montant à recharger</label>
        <div className="grid grid-cols-4 gap-3">
          {[20, 50, 100, 200].map(val => (
            <button
              key={val}
              onClick={() => setAmount(val)}
              className={`p-4 border-2 rounded-lg font-semibold transition-all ${
                amount === val 
                  ? 'bg-blue-500 text-white border-blue-500' 
                  : 'border-gray-300 hover:border-blue-300'
              }`}
            >
              {val} €
            </button>
          ))}
        </div>
        
        <Input
          type="number"
          value={amount}
          onChange={e => setAmount(Number(e.target.value))}
          className="mt-4"
          placeholder="Montant personnalisé"
          min={1}
        />
      </div>
      
      <div className="bg-gray-50 p-6 rounded-lg mb-6 border">
        <div className="flex justify-between mb-3">
          <span className="text-gray-600">Montant</span>
          <span className="font-semibold">{amount.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-gray-600">Crédits obtenus</span>
          <span className="font-semibold">{amount.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between mb-3 text-sm text-gray-500">
          <span>Propositions disponibles (environ)</span>
          <span>{Math.floor(amount / organization.tarif_par_proposition)}</span>
        </div>
        <div className="border-t pt-3 mt-3">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{amount.toFixed(2)} €</span>
          </div>
        </div>
      </div>
      
      <Button 
        onClick={handleRecharge} 
        disabled={isLoading || amount < 1}
        className="w-full py-6 text-lg"
        size="lg"
      >
        {isLoading ? (
          <>
            <span className="animate-spin mr-2">⏳</span>
            Redirection vers le paiement...
          </>
        ) : (
          <>🔒 Procéder au paiement sécurisé</>
        )}
      </Button>
      
      <p className="text-sm text-gray-500 text-center mt-4">
        Paiement sécurisé par Stripe • SSL • Aucune donnée bancaire stockée
      </p>
    </div>
  );
}
API Routes Stripe
Créer session checkout :
typescript// app/api/stripe/create-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Vérifier l'authentification
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { amount } = await request.json();
    
    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    // Récupérer l'organization
    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_customer_id, email, nom')
      .eq('id', user.id)
      .single();
    
    // Créer une session Checkout
    const session = await stripe.checkout.sessions.create({
      customer: org.stripe_customer_id,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Recharge de crédits',
              description: `${amount}€ de crédits pour générer des propositions commerciales`
            },
            unit_amount: Math.round(amount * 100) // En centimes
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.NEXT_PUBLIC_URL}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/credits`,
      metadata: {
        organization_id: user.id,
        credits_amount: amount.toString()
      }
    });
    
    return NextResponse.json({ sessionId: session.id });
    
  } catch (error) {
    console.error('Stripe error:', error);
    return NextResponse.json(
      { error: 'Payment failed', details: error.message },
      { status: 500 }
    );
  }
}
Webhook Stripe :
typescript// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Créer un client Supabase avec la service role key pour bypasser RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  
  // Gérer l'événement
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      
      const organizationId = session.metadata?.organization_id;
      const creditsAmount = parseFloat(session.metadata?.credits_amount || '0');
      
      if (organizationId && creditsAmount > 0) {
        // 1. Ajouter les crédits
        const { error: creditsError } = await supabase.rpc('add_credits', {
          org_id: organizationId,
          amount: creditsAmount
        });
        
        if (creditsError) {
          console.error('Error adding credits:', creditsError);
        }
        
        // 2. Enregistrer la transaction
        const { error: transactionError } = await supabase
          .from('stripe_transactions')
          .insert({
            organization_id: organizationId,
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_session_id: session.id,
            montant: creditsAmount,
            credits_ajoutes: creditsAmount,
            statut: 'succeeded'
          });
        
        if (transactionError) {
          console.error('Error recording transaction:', transactionError);
        }
      }
      break;
    
    case 'payment_intent.payment_failed':
      // Gérer l'échec de paiement
      console.log('Payment failed:', event.data.object);
      break;
  }
  
  return NextResponse.json({ received: true });
}
```

---

## 🎨 Structure Supabase Storage
```
Buckets:
├── templates/           # Templates "master" (jamais modifiés)
│   ├── {org_id}/
│   │   ├── {timestamp}-template.docx
│   │   ├── {timestamp}-template.xlsx
│   │   └── ...
│   └── ...
│
├── propositions/        # Fichiers générés (copies modifiées)
│   ├── proposition-{timestamp}.docx
│   ├── proposition-{timestamp}.xlsx
│   ├── proposition-{timestamp}.pdf
│   └── ...
│
└── documents/           # Documents source uploadés (factures, contrats)
    ├── {org_id}/
    │   └── {proposition_id}/
    │       ├── facture.pdf
    │       ├── contrat.pdf
    │       └── ...
Policies Supabase Storage
sql-- Policy pour templates : Seul le propriétaire peut lire/écrire
CREATE POLICY "Users can manage their own templates"
ON storage.objects FOR ALL
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy pour propositions : Seul le propriétaire peut lire
CREATE POLICY "Users can view their own propositions"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'propositions' AND
  EXISTS (
    SELECT 1 FROM propositions
    WHERE propositions.duplicated_template_url LIKE '%' || name
    AND propositions.organization_id = auth.uid()
  )
);

-- Policy pour documents source
CREATE POLICY "Users can manage their own source documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

✅ Checklist de fonctionnalités MVP
Partie Admin

 Authentification admin
 Dashboard analytics global
 Créer un client (organization)
 Configurer le prompt par client
 Définir les champs par défaut par client
 Définir le tarif par proposition par client
 Voir les stats d'utilisation par client
 Voir l'historique des propositions générées

Partie Client

 Authentification client
 Dashboard client (solde crédits, propositions récentes)
 Wizard création template (4 étapes)

 Étape 1 : Sélection champs
 Étape 2 : Upload template
 Étape 3 : Mapping intelligent
 Étape 4 : Test extraction


 Liste des templates
 Génération d'une proposition

 Sélection template
 Upload documents source
 Extraction automatique avec Claude
 Édition manuelle des données
 Génération du fichier final (duplication + modification)
 Téléchargement


 Recharge de crédits (Stripe)
 Historique des propositions

Techniques

 Base de données Supabase configurée
 Authentication Supabase avec RLS
 Storage Supabase (3 buckets)
 Intégration Claude API
 Intégration Stripe
 Webhook Stripe
 Générateurs Word/Excel/PDF
 Parsers Word/Excel/PDF
 API Routes Next.js
 Composants UI shadcn/ui


🚀 Instructions de déploiement
1. Configuration des variables d'environnement
bash# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

ANTHROPIC_API_KEY=sk-ant-xxx...

STRIPE_SECRET_KEY=sk_live_xxx...
STRIPE_PUBLISHABLE_KEY=pk_live_xxx...
STRIPE_WEBHOOK_SECRET=whsec_xxx...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx...

NEXT_PUBLIC_URL=https://votredomaine.com
2. Initialisation Supabase

Créer un projet Supabase
Exécuter le SQL du schéma de BDD
Créer les buckets Storage (templates, propositions, documents)
Configurer les policies RLS
Activer l'authentification Email/Password

3. Déploiement sur VPS hostinger avec coolify deja installé


Aller dans Stripe Dashboard > Developers > Webhooks
Ajouter endpoint : https://votredomaine.com/api/stripe/webhook
Sélectionner les événements :

checkout.session.completed
payment_intent.payment_failed


Copier le webhook secret dans .env


🎯 Points clés de l'implémentation
✅ Avantages de la duplication + modification

Préservation parfaite : Mise en forme, styles, formules, images = 100% identiques
Simplicité : Pas besoin de recréer la structure du document
Fiabilité : Le résultat est prévisible
Compatibilité : Fonctionne avec tous les logiciels Office
Performance : Plus rapide que la génération from scratch

⚠️ Points d'attention

Taille des fichiers : Les templates volumineux peuvent ralentir le traitement
Format des variables : Bien documenter le format attendu ({{variable}})
Formules Excel : Tester que les formules se recalculent bien
PDF : Uniquement les formulaires remplissables fonctionnent bien
Gestion d'erreurs : Bien gérer les cas où un champ n'existe pas