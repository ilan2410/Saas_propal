// Types globaux pour l'application

export type Secteur = 'telephonie' | 'bureautique' | 'mixte';
export type FileType = 'excel' | 'word' | 'pdf';
export type TemplateStatus = 'brouillon' | 'teste' | 'actif';
export type PropositionStatus = 'processing' | 'ready' | 'exported' | 'error';
export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

// Organization (Client de la plateforme)
export interface Organization {
  id: string;
  nom: string;
  email: string;
  secteur: Secteur;
  claude_model: string;
  prompt_template: string;
  prompt_version: number;
  champs_defaut: string[];
  tarif_par_proposition: number;
  credits: number;
  quotas: {
    tailleMaxDocumentMB: number;
    nombreMaxDocumentsParProposition: number;
    tokensMaxParProposition: number;
  };
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

// Template de proposition
export interface PropositionTemplate {
  id: string;
  organization_id: string;
  nom: string;
  description?: string;
  file_url: string;
  file_name: string;
  file_type: FileType;
  file_size_mb: number;
  file_config: FileConfig;
  champs_actifs: string[];
  statut: TemplateStatus;
  test_result?: TestResult;
  created_at: string;
  updated_at: string;
}

// Configuration spécifique au format de fichier
export type FileConfig = ExcelConfig | WordConfig | PDFConfig;

export interface ExcelConfig {
  feuilleCiblee: string;
  cellMappings: Record<string, string>;
  preserverFormules?: boolean;
  cellulesAvecFormules?: string[];
  tableauxDynamiques?: any[];
}

export interface WordConfig {
  formatVariables: string;
  fieldMappings: Record<string, string>;
  tableauxDynamiques?: any[];
  imagesARemplacer?: Record<string, string>;
}

export interface PDFConfig {
  type: 'formulaire_remplissable';
  champsFormulaire: Record<string, string>;
}

// Résultat de test d'un template
export interface TestResult {
  extraction: {
    champsExtraits: Record<string, any>;
    confiance: Record<string, number>;
  };
  preview: {
    before: string;
    after: string;
  };
  validation: {
    champsManquants: string[];
    valeursIncertaines: Array<{
      champ: string;
      valeur: any;
      confiance: number;
    }>;
  };
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

// Proposition générée
export interface Proposition {
  id: string;
  template_id?: string;
  organization_id: string;
  nom_client?: string;
  source_documents: Array<{
    url: string;
    name: string;
    type: string;
  }>;
  extracted_data: Record<string, any>;
  extraction_confidence: Record<string, number>;
  filled_data?: Record<string, any>;
  original_template_url?: string;
  duplicated_template_url?: string;
  generated_file_name?: string;
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  processing_time_ms?: number;
  cout_ia: number;
  champs_modifies?: string[];
  statut: PropositionStatus;
  error_message?: string;
  created_at: string;
  exported_at?: string;
}

// Analytics d'utilisation
export interface UsageAnalytics {
  id: string;
  organization_id: string;
  periode: string; // Format: 'YYYY-MM'
  propositions_count: number;
  tokens_total: {
    input: number;
    output: number;
    total: number;
  };
  cout_total: number;
  cout_ia_total: number;
  taux_succes: number;
  temps_moyen_ms: number;
  taux_modification: number;
  champs_plus_modifies: Array<{
    champ: string;
    count: number;
  }>;
  created_at: string;
}

// Transaction Stripe
export interface StripeTransaction {
  id: string;
  organization_id: string;
  stripe_payment_intent_id: string;
  stripe_session_id?: string;
  montant: number;
  credits_ajoutes: number;
  statut: TransactionStatus;
  created_at: string;
}

// Résultat d'extraction Claude
export interface ExtractionResult {
  data: Record<string, any>;
  confidence: Record<string, number>;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}
