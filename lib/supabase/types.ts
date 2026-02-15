// Types générés automatiquement depuis le schéma Supabase
// Pour générer ces types automatiquement, utilisez: npx supabase gen types typescript

type TableDef = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

export type Database = {
  public: {
    Tables: {
      organizations: TableDef;
      proposition_templates: TableDef;
      propositions: TableDef;
      usage_analytics: TableDef;
      stripe_transactions: TableDef;
      prompt_defaults: TableDef;
    };
  };
};

// Types des tables
export type Organization = Database['public']['Tables']['organizations']['Row'] & {
  pdf_header_logo_url?: string;
  pdf_footer_text?: string;
  
  // Nouveaux champs
  logo_url?: string;
  siret?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  numero_tva?: string;
  nom_facturation?: string;
  adresse_facturation?: string;
  preferences?: OrganizationPreferences;
  
  created_at: string;
  updated_at: string;
};

export interface OrganizationPreferences {
  theme?: 'light' | 'dark' | 'system';
  densite?: 'compact' | 'confortable';
  page_accueil?: '/dashboard' | '/templates' | '/propositions';
  notifications?: {
    alerte_credits_faibles?: boolean;
    seuil_credits?: number;
    email_proposition_generee?: boolean;
    email_recharge?: boolean;
    resume_hebdomadaire?: boolean;
    rappel_engagement?: boolean;
  };
  recharge_auto?: {
    actif?: boolean;
    seuil?: number;
    montant?: number;
  };
}
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert'];
export type OrganizationUpdate = Database['public']['Tables']['organizations']['Update'];

export type PropositionTemplate = Database['public']['Tables']['proposition_templates']['Row'];
export type PropositionTemplateInsert = Database['public']['Tables']['proposition_templates']['Insert'];
export type PropositionTemplateUpdate = Database['public']['Tables']['proposition_templates']['Update'];

export type Proposition = Database['public']['Tables']['propositions']['Row'];
export type PropositionInsert = Database['public']['Tables']['propositions']['Insert'];
export type PropositionUpdate = Database['public']['Tables']['propositions']['Update'];

export type UsageAnalytics = Database['public']['Tables']['usage_analytics']['Row'];
export type StripeTransaction = Database['public']['Tables']['stripe_transactions']['Row'];
