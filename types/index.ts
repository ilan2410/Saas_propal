// Types globaux pour l'application

export type Secteur = 'telephonie' | 'bureautique' | 'mixte';
export type FileType = 'excel' | 'word' | 'pdf';
export type TemplateStatus = 'brouillon' | 'teste' | 'actif';
export type PropositionStatus = 'processing' | 'ready' | 'exported' | 'error';
export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type CatalogueCategorie = 'mobile' | 'internet' | 'fixe' | 'cloud' | 'equipement' | 'autre' | 'cadeau' | 'installation';
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
  sp_config_loyer?: SpConfigLoyer;
  sp_config_resiliation?: SpConfigResiliation;
  sp_regles_remise?: SpRegleRemise[];
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
  sp_config_loyer?: SpConfigLoyer;
  sp_config_resiliation?: SpConfigResiliation;
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

export interface CatalogueProduitTranche {
  id: string;
  qte_min: number;
  qte_max: number | null;
  prix_vente?: number;
  prix_mensuel?: number;
  prix_installation?: number;
}

export interface ProduitDestinations {
  proposition: boolean;
  bdc_operateur: boolean;
  bdc_materiel: boolean;
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
  mode_fas?: 'fixe_par_selection' | 'multiplie_par_quantite';
  prix_mensuel?: number;
  remise_type?: 'fixe' | 'pourcentage';
  remise_valeur?: number;
  prix_vente?: number;
  prix_installation?: number;
  engagement_mois?: number;
  image_url?: string;
  caracteristiques: Record<string, unknown>;
  tags: string[];
  est_produit_base: boolean;
  actif: boolean;
  prix_par_tranche?: CatalogueProduitTranche[];
  destinations?: ProduitDestinations;
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

export type SpQuestionSource =
  | 'catalogue'
  | 'sa'
  | 'aucune'
  | 'catalogue_et_sa';

export type SpQuestionAffichage =
  | 'boutons_choix_unique'
  | 'boutons_choix_multiple'
  | 'liste_deroulante'
  | 'liste_deroulante_choix_multiple'
  | 'oui_non'
  | 'confirmation_sa'
  | 'edition_sa'
  | 'texte_court'
  | 'texte_long'
  | 'nombre'
  | 'date'
  | 'remise_produits'
  | 'choix_liste_manuelle'
  | 'adresse_complete'
  | 'marge';

export type SpConditionOperateur =
  | 'egal'
  | 'different'
  | 'vide'
  | 'non_vide'
  | 'contient'
  | 'ne_contient_pas'
  | 'superieur'
  | 'inferieur'
  | 'plus_de_elements'
  | 'moins_de_elements'
  | 'element_ou';

export type SpConditionLogique = 'ET' | 'OU';

export interface SpCondition {
  id: string;
  source: 'sa' | 'catalogue' | 'reponse_question';
  variable_sa?: string;
  sous_champ_sa?: string;
  filtre_catalogue?: SpFiltresCatalogue;
  question_id?: string;
  operateur: SpConditionOperateur;
  valeur?: string | number;
  logique?: SpConditionLogique;
}

export interface SpGroupeConditions {
  id: string;
  conditions: SpCondition[];
  logique_groupe?: SpConditionLogique;
}

export interface SpRegleRemise {
  id: string;
  nom: string;
  actif: boolean;
  groupes_conditions: SpGroupeConditions[];
  logique_declencheur?: SpConditionLogique;
  produits_ids?: string[];
  categories?: string[];
  fournisseurs?: string[];
}

export interface SpFiltresCatalogue {
  categories?: string[];
  fournisseurs?: string[];
  type_facturation?: 'mensuel' | 'unique' | 'tous';
  produits_ids?: string[];
  depuis_reponse_question?: string;
  groupes?: SpGroupeConditions[];
  logique_racine?: SpConditionLogique;
}

export interface SpConsequence {
  type:
    | 'renseigner_variable'
    | 'afficher_question'
    | 'masquer_question'
    | 'filtrer_question'
    | 'aller_question'
    | 'afficher_message';
  variable_cible?: string;
  question_id?: string;
  filtre?: SpFiltresCatalogue;
  message_texte?: string;
  valeur_declencheur?: string;
}

export type SpQuestionSuggestionSource = 'indemnite_resiliation';

export interface SpQuestionNombreConfig {
  suggestion_source?: SpQuestionSuggestionSource;
  afficher_estimation?: boolean;
  afficher_detail_calcul?: boolean;
}

export interface SpQuestionBoucle {
  /** ID de la question dont la réponse donne le nombre d'itérations */
  source_nombre_question_id?: string;
  /** Nombre fixe d'itérations (alternatif à source_nombre_question_id) */
  nombre_fixe?: number;
  /** ID de la question dont la réponse (string[]) fournit les labels des itérations */
  source_labels_question_id?: string;
  /** Préfixe label par défaut (ex: "Site" → "Site 1", "Site 2"…) */
  label_prefix?: string;
  /** Champ SA contenant le tableau source des itérations — supporte les chemins imbriqués (ex: "situation_actuelle.lignes") */
  source_sa_array?: string;
  /** Sous-champ de chaque item SA à utiliser comme label d'itération (ex: "numero_ligne") */
  source_sa_label_champ?: string;
  /** Sous-champ sur lequel filtrer les items du tableau SA (ex: "type") */
  source_sa_filtre_champ?: string;
  /** Valeur attendue pour le filtre (ex: "mobile") */
  source_sa_filtre_valeur?: string;
}

export interface SpQuestion {
  id: string;
  template_id: string;
  ordre: number;
  actif: boolean;
  libelle: string;
  description?: string;
  source: SpQuestionSource;
  filtres_catalogue?: SpFiltresCatalogue;
  groupes_conditions?: SpGroupeConditions[];
  logique_declencheur?: SpConditionLogique;
  affichage: SpQuestionAffichage;
  options_libres?: boolean;
  nombre_max_resultats?: number;
  options_manuelles?: string[];
  validation_format?: 'aucune' | 'email' | 'telephone' | 'siret';
  obligatoire: boolean;
  valeur_defaut?: string;
  edition_type?: 'adresse_complete' | 'texte' | 'nombre' | 'date';
  nombre_config?: SpQuestionNombreConfig;
  consequences: SpConsequence[];
  priorite_ia: 'normale' | 'haute';
  /** Identifiant du groupe de boucle (toutes les questions avec le même id forment un bloc répété) */
  groupe_boucle_id?: string;
  /** Définition de la boucle (uniquement sur la première question du groupe) */
  boucle?: SpQuestionBoucle;
}

export interface SpQuestionReponse {
  question_id: string;
  valeur: string | boolean | string[] | SpAdresse;
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
  sp_produit_fournisseur?: string;
  sp_prix_actuel: string;
  sp_prix_propose: string;
  sp_economie: string;
  sp_analyse: string;
  sp_justification: string;
  sp_type_ligne: 'Mobile';
  _prix_actuel_raw: number;
  _prix_propose_raw: number;
  _economie_raw: number;
}

type SpLigneBase = Omit<SpLigneMobile, 'sp_type_ligne'>;

export interface SpLigneFixe extends SpLigneBase {
  sp_type_ligne: 'Fixe';
}

export interface SpInternet extends SpLigneBase {
  sp_type_ligne: 'Internet';
}

export interface SpMateriel {
  sp_materiel_nom: string;
  sp_materiel_ref?: string;
  sp_materiel_prix_mensuel: string;
  sp_materiel_duree_engagement: string;
  sp_materiel_commentaire: string;
  sp_materiel_produit_id?: string;
  sp_materiel_fournisseur?: string;
  sp_type_ligne: 'Materiel';
  _prix_mensuel_raw: number;
}

// ── Lot 4: Tables filtrées ────────────────────────────────────────

export interface SpSituationProposeeLigne {
  sp_sp_type: string;
  sp_sp_nom: string;
  sp_sp_produit?: string;
  sp_sp_fournisseur?: string;
  sp_sp_prix_actuel?: string;
  sp_sp_prix_propose: string;
  sp_sp_economie?: string;
  sp_sp_analyse?: string;
  _prix_raw: number;
}

export interface SpMaterielDetail {
  sp_matd_nom: string;
  sp_matd_ref?: string;
  sp_matd_fournisseur?: string;
  sp_matd_quantite: string;
  sp_matd_prix_ht: string;
  sp_matd_commentaire: string;
  sp_matd_frequence: string;
  sp_matd_image_url?: string;
  sp_mat_image_url?: string;
  _prix_raw: number;
}

export interface SpBdcOperateurLigne {
  sp_bdc_op_type: string;
  sp_bdc_op_nom: string;
  sp_bdc_op_produit?: string;
  sp_bdc_op_fournisseur?: string;
  sp_bdc_op_prix_mensuel_ht: string;
  sp_bdc_op_prix_actuel?: string;
  sp_bdc_op_economie?: string;
  _prix_mensuel_raw: number;
}

export interface SpBdcInternetLigne {
  sp_bdc_int_nom: string;
  sp_bdc_int_produit?: string;
  sp_bdc_int_fournisseur?: string;
  sp_bdc_int_prix_mensuel_ht: string;
  sp_bdc_int_prix_actuel?: string;
  _prix_mensuel_raw: number;
}

export interface SpBdcMaterielLigne {
  sp_bdc_mat_nom: string;
  sp_bdc_mat_ref?: string;
  sp_bdc_mat_fournisseur?: string;
  sp_bdc_mat_prix_ht: string;
  sp_bdc_mat_frequence: string;
  _prix_raw: number;
}

export interface SpCadeauLigne {
  sp_cadeau_nom: string;
  sp_cadeau_ref?: string;
  sp_cadeau_valeur_ht: string;
  _valeur_raw: number;
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

  // ── Récurrent / Ponctuel ───────────────────────────────────────
  sp_total_recurrent?: string;
  sp_total_ponctuel?: string;
  sp_total_indemnites?: string;
  sp_remise_mois_offert?: string;
  sp_total_fas?: string;
  sp_total_installation?: string;
  sp_total_materiel_achat?: string;
  sp_fas_total?: string;

  // ── Loyer / Marge ──────────────────────────────────────────────
  sp_loyer_mensuel?: string;
  sp_loyer_trimestriel?: string;
  sp_marge?: string;
  sp_duree_mois?: number;
  sp_trimestres?: number;
  sp_mois_offerts?: number;

  // ── Lot 4: Tables filtrées ─────────────────────────────────────
  sp_situation_proposee_complet?: SpSituationProposeeLigne[];
  sp_situation_proposee_forfaits?: SpSituationProposeeLigne[];
  sp_materiel_detail?: SpMaterielDetail[];
  sp_bdc_operateur_table?: SpBdcOperateurLigne[];
  sp_bdc_internet_table?: SpBdcInternetLigne[];
  sp_bdc_materiel_table?: SpBdcMaterielLigne[];
  sp_cadeaux_table?: SpCadeauLigne[];

  // ── Lot 4: Variables simples ────────────────────────────────────
  sp_date_limite_souscription?: string;
  sp_duree_trimestres?: string;
  sp_total_forfaits_mensuel_ht?: string;
  sp_total_materiel_ht?: string;
  sp_total_bdc_operateur_ht?: string;
  sp_total_bdc_internet_ht?: string;
  sp_total_bdc_materiel_ht?: string;
  sp_total_cadeaux_ht?: string;
  sp_total_complet?: string;

  [key: string]: unknown;
}

// ── Config Loyer ─────────────────────────────────────────────────

export interface SpTauxDuree {
  duree_mois: number;
  taux_loyer: number;
  mois_offerts: number;
  trimestres: number;
}

export interface SpBareme {
  id: string;
  nom: string;
  ordre: number;
  groupes_conditions?: SpGroupeConditions[];
  logique_declencheur?: SpConditionLogique;
  taux_durees: SpTauxDuree[];
}

export interface SpConfigLoyer {
  baremes: SpBareme[];
  /** Durée du contrat en mois utilisée par défaut pour le calcul du loyer (fallback). */
  duree_mois_par_defaut?: number;
  /** Si vrai, la durée est lue depuis la réponse à la question SP `duree_question_id`. */
  duree_depends_question?: boolean;
  /** ID de la question SP dont la réponse fournit la durée du contrat (en mois). */
  duree_question_id?: string;
}

export interface SpConfigResiliationElements {
  lignes_mensuelles?: boolean;
  abonnements_mensuels?: boolean;
  locations_mensuelles?: boolean;
  frais_resiliation_fixes?: boolean;
  penalites?: boolean;
  frais_materiel?: boolean;
  services_annexes?: boolean;
}

export interface SpConfigResiliation {
  utiliser_montant_source_si_disponible?: boolean;
  preavis_mois_defaut?: number;
  elements_pris_en_compte?: SpConfigResiliationElements;
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
  type: 'string' | 'number' | 'tableau';
  rowFields?: Array<{
    id: string;
    label: string;
    type: 'string' | 'number' | 'date';
  }>;
}
