// Types globaux pour l'application

export type Secteur = 'telephonie' | 'bureautique' | 'mixte';
export type FileType = 'excel' | 'word' | 'pdf';
export type TemplateStatus = 'brouillon' | 'teste' | 'actif';
export type PropositionStatus = 'processing' | 'ready' | 'exported' | 'error';
export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type CatalogueCategorie = 'mobile' | 'internet' | 'fixe' | 'cloud' | 'equipement' | 'autre';
export type CatalogueSecteur = 'telephonie' | 'bureautique';

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
  adresse_facturation?: string; // Gardé pour rétrocompatibilité, mais on préfère les champs détaillés
  email_facturation?: string;
  adresse_ligne1_facturation?: string;
  adresse_ligne2_facturation?: string;
  ville_facturation?: string;
  code_postal_facturation?: string;
  pays_facturation?: string;
  telephone_facturation?: string;
  preferences?: OrganizationPreferences;
  sp_questions?: SpQuestion[];

  created_at: string;
  updated_at: string;
}

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
  sp_customization?: SpCustomization;
}

export type SpOutputFormat = 'pdf' | 'word';

export type SpLogoSize = 'small' | 'medium' | 'large';
export type SpLogoPosition = 'left' | 'right' | 'center' | 'above' | 'below';
export type SpTextAlignment = 'left' | 'center' | 'right';

export interface SpCustomization {
  logo_url?: string;
  /** @deprecated conservé pour rétro-compatibilité, plus modifiable depuis l'UI */
  company_name?: string;
  primary_color?: string; // format hex #RRGGBB
  footer_text?: string;
  output_format?: SpOutputFormat;
  // Personnalisation du logo
  logo_size?: SpLogoSize;
  logo_position?: SpLogoPosition; // position relative au titre
  // Personnalisation du titre
  title_text?: string;
  title_size?: number; // en points
  title_color?: string; // hex #RRGGBB
  title_alignment?: SpTextAlignment; // alignement horizontal du titre
  // Personnalisation du sous-titre
  subtitle_text?: string;
  subtitle_size?: number; // en points
  subtitle_color?: string; // hex #RRGGBB
  subtitle_alignment?: SpTextAlignment; // alignement horizontal du sous-titre
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
  tableauxDynamiques?: unknown[];
}

export interface WordConfig {
  formatVariables: string;
  fieldMappings: Record<string, string>;
  tableauxDynamiques?: unknown[];
  imagesARemplacer?: Record<string, string>;
  // SP
  spEnabled?: boolean;
  spVariablesActives?: string[];
  spTableauxFusionnes?: SpTableauFusionne[];
  spVariablesCustom?: SpVariableCustom[];
}

export interface PDFConfig {
  type: 'formulaire_remplissable';
  champsFormulaire: Record<string, string>;
}

// Résultat de test d'un template
export interface TestResult {
  extraction: {
    champsExtraits: Record<string, unknown>;
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
      valeur: unknown;
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
  extracted_data: Record<string, unknown>;
  extraction_confidence: Record<string, number>;
  filled_data?: Record<string, unknown>;
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
  suggestions_generees?: SuggestionsGenerees;
  suggestions_editees?: SuggestionsGenerees;
}

export interface ModificationState {
  hasProductChanges: boolean;
  hasAnalysisUpdates: boolean;
  hasSynthesisUpdate: boolean;
  changedProductsCount: number;
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

export interface CatalogueProduit {
  id: string;
  organization_id: string | null;
  secteur_catalogue?: CatalogueSecteur;
  categorie: CatalogueCategorie;
  nom: string;
  description?: string;
  fournisseur?: string;
  type_frequence: 'mensuel' | 'unique';
  prix_mensuel?: number;
  prix_vente?: number;
  prix_installation?: number;
  engagement_mois?: number;
  image_url?: string;
  caracteristiques: Record<string, unknown>;
  tags: string[];
  est_produit_base: boolean;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

// Résultat d'extraction Claude
export interface ExtractionResult {
  data: Record<string, unknown>;
  confidence: Record<string, number>;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export type Suggestion = {
  ligne_actuelle: Record<string, unknown>;
  produit_propose_id?: string;
  produit_propose_nom: string;
  produit_propose_fournisseur?: string;
  prix_actuel: number;
  prix_propose: number;
  economie_mensuelle: number;
  justification: string;
};

export type SuggestionsSynthese = {
  cout_total_actuel: number;
  cout_total_propose: number;
  economie_mensuelle: number;
  economie_annuelle: number;
  ameliorations?: string[];
};

export type SuggestionsGenerees = {
  suggestions: Suggestion[];
  synthese: SuggestionsSynthese;
};

// ── Questions SP ──────────────────────────────────────────────────

export type SpQuestionType =
  | 'choix_catalogue'
  | 'oui_non'
  | 'adresse'
  | 'libre';

export interface SpQuestion {
  id: string;
  ordre: number;
  actif: boolean;
  type: SpQuestionType;
  question: string;
  description?: string;
  condition?: string;
  variable_cible: string;
  obligatoire: boolean;
  options_libres?: boolean;
}

export const SP_QUESTIONS_DEFAUT: SpQuestion[] = [
  {
    id: 'q_fournisseur',
    ordre: 1,
    actif: true,
    type: 'choix_catalogue',
    question: 'Quel fournisseur préférez-vous pour cette offre ?',
    description: 'Sélectionnez un fournisseur ou saisissez-en un manuellement.',
    variable_cible: 'sp_fournisseur_propose',
    obligatoire: true,
    options_libres: true,
  },
  {
    id: 'q_materiel',
    ordre: 2,
    actif: true,
    type: 'oui_non',
    question: 'Proposer du matériel ?',
    description: "L'IA a analysé la SA et peut suggérer du matériel de remplacement.",
    variable_cible: 'sp_materiel',
    obligatoire: false,
  },
  {
    id: 'q_adresse_fact',
    ordre: 3,
    actif: true,
    type: 'adresse',
    question: "L'adresse de facturation est bien au : {sa.adresse} ?",
    variable_cible: 'sp_adresse_facturation',
    obligatoire: true,
  },
  {
    id: 'q_adresse_liv',
    ordre: 4,
    actif: true,
    type: 'oui_non',
    question: "L'adresse de livraison est la même que l'adresse de facturation ?",
    variable_cible: 'sp_adresse_livraison',
    obligatoire: true,
  },
];

export interface SpQuestionReponse {
  question_id: string;
  valeur: string | boolean | SpAdresse;
}

export interface SpAdresse {
  adresse: string;
  complement?: string;
  code_postal: string;
  ville: string;
  pays?: string;
}

// ── Données SP structurées ────────────────────────────────────────

export interface SpLigneMobile {
  sp_nom_ligne: string;
  sp_produit: string;
  sp_produit_id?: string;
  sp_prix_actuel: string;
  sp_prix_propose: string;
  sp_economie: string;
  sp_analyse: string;
  sp_justification: string;
  _prix_actuel_raw: number;
  _prix_propose_raw: number;
  _economie_raw: number;
}

export interface SpLigneFixe extends SpLigneMobile {}
export interface SpInternet extends SpLigneMobile {}

export interface SpMateriel {
  sp_materiel_nom: string;
  sp_materiel_ref?: string;
  sp_materiel_prix_mensuel: string;
  sp_materiel_duree_engagement: string;
  sp_materiel_commentaire: string;
  sp_materiel_produit_id?: string;
  _prix_mensuel_raw: number;
}

export interface SuggestionsSpCompletes extends SuggestionsGenerees {
  sp_fournisseur_propose?: string;
  sp_adresse_facturation?: SpAdresse;
  sp_adresse_livraison?: SpAdresse | null;
  sp_livraison_identique?: boolean;

  sp_lignes_mobiles: SpLigneMobile[];
  sp_lignes_fixes: SpLigneFixe[];
  sp_internet: SpInternet[];
  sp_materiel: SpMateriel[];

  sp_fixes_mobiles?: (SpLigneMobile | SpLigneFixe)[];
  sp_fixes_mobiles_internet?: (SpLigneMobile | SpLigneFixe | SpInternet)[];
  sp_toutes_lignes?: (SpLigneMobile | SpLigneFixe | SpInternet)[];
  sp_tout?: (SpLigneMobile | SpLigneFixe | SpInternet | SpMateriel)[];

  sp_economie_mensuelle: string;
  sp_economie_annuelle: string;
  sp_total_actuel: string;
  sp_total_propose: string;
  sp_ameliorations: string;
  sp_nb_lignes: string;
  sp_est_economie: string;
}

// ── Extension WordConfig ──────────────────────────────────────────

export interface SpTableauFusionne {
  id: string;
  label: string;
  categories: Array<'mobiles' | 'fixes' | 'internet' | 'materiel'>;
}

export interface SpVariableCustom {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number';
}
