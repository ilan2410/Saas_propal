# Prompt Claude Code — Implémentation SP complète PropoBoost

Tu es un développeur senior expert en Next.js 14+, TypeScript strict, Supabase et Anthropic Claude API.
Tu travailles sur PropoBoost, une plateforme SaaS de génération de propositions commerciales déjà en production.
Tu dois implémenter une fonctionnalité complète sans rien casser de l'existant.

---

## STACK & FICHIERS CLÉS

**Stack :** Next.js 14+ App Router, TypeScript strict, Supabase (PostgreSQL + Auth + Storage),
Claude API (Anthropic), TailwindCSS, shadcn/ui, docxtemplater + pizzip (Word), exceljs (Excel).

**Fichiers clés à lire AVANT de toucher quoi que ce soit :**

- `types/index.ts` — tous les types TypeScript
- `components/propositions/PropositionWizard.tsx` — wizard 5 étapes actuellement
- `components/propositions/Step4EditData.tsx` — édition SA, contient le bouton "Générer SP" à supprimer
- `components/propositions/EditableSuggestionsView.tsx` — vue éditable suggestions
- `app/api/propositions/generer-suggestions/route.ts` — génération SP par IA
- `lib/generators/index.ts` — générateur Word/Excel (doc.render via docxtemplater)
- `components/templates/Step2UploadTemplate.tsx` — config template avec variables SA (copie variable par variable ET bloc complet pour les tableaux)
- `components/admin/organizationFormConfig.ts` — définition ARRAY_FIELDS SA par secteur
- `app/(client)/settings/page.tsx` — page paramètres client

**Types existants importants :**

```typescript
type Suggestion = {
  ligne_actuelle: Record<string, unknown>;
  produit_propose_id?: string;
  produit_propose_nom: string;
  produit_propose_fournisseur?: string;
  prix_actuel: number;
  prix_propose: number;
  economie_mensuelle: number;
  justification: string;
};

type SuggestionsGenerees = {
  suggestions: Suggestion[];
  synthese: SuggestionsSynthese;
};

interface WordConfig {
  formatVariables: string;
  fieldMappings: Record<string, string>;
  tableauxDynamiques?: unknown[];
  imagesARemplacer?: Record<string, string>;
}

// PropositionData dans PropositionWizard (actuel, 5 étapes)
interface PropositionData {
  template_id: string;
  nom_client?: string;
  documents_urls: string[];
  donnees_extraites: Record<string, unknown>;
  proposition_id?: string;
  copieurs_count?: number;
  suggestions_generees?: SuggestionsGenerees | null;
  suggestions_editees?: SuggestionsGenerees | null;
}
```

---

## PÉRIMÈTRE

1. **Word uniquement.** Excel et PDF hors scope pour cette phase.
   - Dans tous les composants, vérifier `file_type === 'word'` avant d'afficher quoi que ce soit lié à la SP.
   - Si le template sélectionné n'est pas Word → l'étape 5 est sautée automatiquement, on passe à l'étape 6.

2. **Ne rien casser.** Les templates Word existants sans variables SP continuent à fonctionner exactement comme avant. `buildSpWordData(null)` retourne `{}`.

3. **TypeScript strict.** Aucun `any`. Utiliser uniquement les types définis.

4. **Cohérence UI.** shadcn/ui, couleurs et patterns existants. Nouvelle lib autorisée : `@hello-pangea/dnd` pour drag-and-drop.

5. **Implémenter dans l'ordre indiqué.** Demander confirmation avant de modifier un fichier existant si l'impact n'est pas clair.

---

## WIZARD : 6 ÉTAPES (au lieu de 5)

```
Étape 1 → Sélection template         (inchangée)
Étape 2 → Upload documents            (inchangée)
Étape 3 → Extraction SA par IA        (inchangée)
Étape 4 → Édition / validation SA     (inchangée — SUPPRIMER le bouton "Générer SP")
Étape 5 → Questions IA + Génération SP (NOUVELLE — Word uniquement, sautée sinon)
Étape 6 → Génération fichier Word     (ancienne étape 5)
```

---

## PERSISTANCE DES ÉTAPES

- Sauvegarde automatique à chaque "Suivant" / "Précédent".
- Autosave toutes les 30 secondes si données modifiées.
- Indicateur visuel discret "Sauvegardé / Sauvegarde en cours..." coin supérieur droit du wizard.
- Reprise possible à tout moment depuis `/propositions/[id]/resume`.
- Retour en arrière = données conservées, jamais à refaire.

**Quoi sauvegarder par étape** via `PATCH /api/propositions/[id]/update` (uniquement les champs modifiés) :

- Étape 1 → `template_id`
- Étape 2 → `documents_urls`
- Étape 3 → `donnees_extraites`, `extraction_confidence`
- Étape 4 → `filled_data`
- Étape 5 → `sp_reponses` + `suggestions_sp_completes`
- Étape 6 → rien (génération finale)

---

## PARTIE 1 — TYPES (`types/index.ts`)

Ajouter sans supprimer l'existant :

```typescript
// ── Adresse ──────────────────────────────────────────────────────
export interface SpAdresse {
  adresse: string;
  complement?: string;
  code_postal: string;
  ville: string;
  pays?: string;
}

// ── Tableaux SP ──────────────────────────────────────────────────
export interface SpLigneMobile {
  sp_nom_ligne: string;
  sp_produit: string;
  sp_produit_id?: string;
  sp_produit_fournisseur?: string;
  sp_prix_actuel: string; // formaté "45,00 €"
  sp_prix_propose: string;
  sp_economie: string;
  sp_analyse: string;
  sp_justification: string;
  sp_type_ligne: "Mobile";
  _prix_actuel_raw: number;
  _prix_propose_raw: number;
  _economie_raw: number;
}

export interface SpLigneFixe extends Omit<SpLigneMobile, "sp_type_ligne"> {
  sp_type_ligne: "Fixe";
}

export interface SpInternet extends Omit<SpLigneMobile, "sp_type_ligne"> {
  sp_type_ligne: "Internet";
}

export interface SpMateriel {
  sp_materiel_nom: string;
  sp_materiel_ref?: string;
  sp_materiel_prix_mensuel: string;
  sp_materiel_duree_engagement: string;
  sp_materiel_commentaire: string;
  sp_materiel_produit_id?: string;
  sp_materiel_fournisseur?: string;
  sp_type_ligne: "Materiel";
  _prix_mensuel_raw: number;
}

// ── SuggestionsSpCompletes (enrichissement de SuggestionsGenerees) ──
export interface SuggestionsSpCompletes extends SuggestionsGenerees {
  // Réponses aux questions
  sp_fournisseur_propose?: string;
  sp_adresse_facturation?: SpAdresse;
  sp_adresse_livraison?: SpAdresse | null; // null = identique à facturation
  sp_livraison_identique?: boolean;

  // Tableaux par catégorie
  sp_lignes_mobiles: SpLigneMobile[];
  sp_lignes_fixes: SpLigneFixe[];
  sp_internet: SpInternet[];
  sp_materiel: SpMateriel[];

  // Tableaux fusionnés pré-calculés
  sp_fixes_mobiles?: (SpLigneFixe | SpLigneMobile)[];
  sp_fixes_mobiles_internet?: (SpLigneFixe | SpLigneMobile | SpInternet)[];
  sp_toutes_lignes?: (SpLigneFixe | SpLigneMobile | SpInternet)[];
  sp_tout?: (SpLigneFixe | SpLigneMobile | SpInternet | SpMateriel)[];
  // + tableaux fusionnés custom (clés dynamiques selon config template)
  [key: string]: unknown;

  // Variables simples (toutes en string formaté)
  sp_economie_mensuelle: string;
  sp_economie_annuelle: string;
  sp_total_actuel: string;
  sp_total_propose: string;
  sp_ameliorations: string;
  sp_nb_lignes: string;
  sp_est_economie: string;
}

// ── Extension WordConfig ──────────────────────────────────────────
// (remplace l'interface existante, ajouter les champs SP)
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

export interface SpTableauFusionne {
  id: string; // ex: "sp_fixes_mobiles" (auto-généré)
  label: string; // ex: "Fixes + Mobiles"
  categories: Array<"mobiles" | "fixes" | "internet" | "materiel">;
}

export interface SpVariableCustom {
  key: string; // ex: "sp_nom_signataire" (préfixe sp_ forcé)
  label: string; // ex: "Nom du signataire"
  description: string; // instruction pour l'IA
  type: "string" | "number" | "tableau";
  // Si type === 'tableau', définir les sous-champs
  rowFields?: Array<{
    id: string;
    label: string;
    type: "string" | "number" | "date";
  }>;
}

// ── Constructeur de questions SP ──────────────────────────────────

export type SpQuestionSource =
  | "catalogue"
  | "sa"
  | "aucune"
  | "catalogue_et_sa";

export type SpQuestionAffichage =
  | "boutons_choix_unique"
  | "boutons_choix_multiple"
  | "liste_deroulante"
  | "oui_non"
  | "confirmation_sa"
  | "edition_sa"
  | "texte_court"
  | "texte_long"
  | "nombre"
  | "date"
  | "choix_liste_manuelle"
  | "adresse_complete";

export type SpConditionOperateur =
  | "egal"
  | "different"
  | "vide"
  | "non_vide"
  | "contient"
  | "ne_contient_pas"
  | "superieur"
  | "inferieur"
  | "plus_de_elements"
  | "moins_de_elements"
  | "element_ou"; // "contient un élément où [sous-champ] [op] [valeur]"

export type SpConditionLogique = "ET" | "OU";

export interface SpCondition {
  id: string;
  source: "sa" | "catalogue" | "reponse_question";
  // Si source === 'sa'
  variable_sa?: string; // chemin ex: "lignes_mobiles" ou "lignes_mobiles.tarif"
  sous_champ_sa?: string; // pour element_ou
  // Si source === 'catalogue'
  filtre_catalogue?: SpFiltresCatalogue;
  // Si source === 'reponse_question'
  question_id?: string;
  operateur: SpConditionOperateur;
  valeur?: string | number;
  logique?: SpConditionLogique; // opérateur avec la condition suivante
}

export interface SpGroupeConditions {
  id: string;
  conditions: SpCondition[];
  logique_groupe?: SpConditionLogique; // opérateur avec le groupe suivant
}

export interface SpFiltresCatalogue {
  categories?: string[]; // chargées dynamiquement depuis BDD
  fournisseurs?: string[]; // chargés dynamiquement depuis BDD
  type_facturation?: "mensuel" | "unique" | "tous";
  depuis_reponse_question?: string; // id de question dont la réponse filtre
  // Combinaisons ET/OU
  groupes?: SpGroupeConditions[];
  logique_racine?: SpConditionLogique;
}

export interface SpConsequence {
  type:
    | "renseigner_variable"
    | "afficher_question"
    | "masquer_question"
    | "filtrer_question"
    | "aller_question";
  variable_cible?: string; // pour renseigner_variable
  question_id?: string; // pour afficher/masquer/aller/filtrer
  filtre?: SpFiltresCatalogue; // pour filtrer_question
}

export interface SpQuestion {
  id: string;
  template_id: string; // lié à un template spécifique
  ordre: number;
  actif: boolean;
  libelle: string; // texte libre de la question (toujours personnalisable)
  // peut contenir {sa.adresse}, {reponse.q_fournisseur}
  description?: string; // aide contextuelle (optionnel)
  source: SpQuestionSource;
  filtres_catalogue?: SpFiltresCatalogue; // si source inclut catalogue
  groupes_conditions?: SpGroupeConditions[]; // déclencheur (quand afficher la question)
  logique_declencheur?: SpConditionLogique;
  affichage: SpQuestionAffichage;
  options_libres?: boolean; // champ "Autre" libre
  nombre_max_resultats?: number;
  options_manuelles?: string[]; // pour choix_liste_manuelle
  validation_format?: "aucune" | "email" | "telephone" | "siret";
  obligatoire: boolean;
  valeur_defaut?: string;
  edition_type?: "adresse_complete" | "texte" | "nombre" | "date";
  consequences: SpConsequence[]; // actions déclenchées selon la réponse
  priorite_ia: "normale" | "haute";
}

// ── Réponses aux questions ────────────────────────────────────────
export interface SpQuestionReponse {
  question_id: string;
  valeur: string | boolean | string[] | SpAdresse;
}

// ── Extension PropositionData (à ajouter dans PropositionWizard) ──
// suggestions_sp_completes?: SuggestionsSpCompletes | null;
// sp_reponses?: SpQuestionReponse[];
```

---

## PARTIE 2 — BASE DE DONNÉES

Créer `supabase/migrations/sp_questions.sql` :

```sql
-- Ajout sp_questions dans organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS sp_questions JSONB DEFAULT '[]'::jsonb;

-- Ajout dans propositions
ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS suggestions_sp_completes JSONB DEFAULT NULL;

ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS sp_reponses JSONB DEFAULT '[]'::jsonb;
```

**Note :** Aucune question par défaut. Chaque client part d'une liste vide et crée ses questions depuis le constructeur.

---

## PARTIE 3 — GÉNÉRATEUR SP (`lib/generators/sp-word-data.ts`)

Créer ce fichier :

```typescript
import type {
  SuggestionsSpCompletes,
  SpAdresse,
  SpTableauFusionne,
} from "@/types";

export function buildSpWordData(
  sp: SuggestionsSpCompletes | null | undefined,
  tableauxFusionnes?: SpTableauFusionne[],
): Record<string, unknown> {
  if (!sp) return {};

  const adresseFact = sp.sp_adresse_facturation;
  const adresseLiv = sp.sp_livraison_identique
    ? adresseFact
    : sp.sp_adresse_livraison;

  const data: Record<string, unknown> = {
    // Variables simples
    sp_economie_mensuelle: sp.sp_economie_mensuelle ?? "",
    sp_economie_annuelle: sp.sp_economie_annuelle ?? "",
    sp_total_actuel: sp.sp_total_actuel ?? "",
    sp_total_propose: sp.sp_total_propose ?? "",
    sp_ameliorations: sp.sp_ameliorations ?? "",
    sp_nb_lignes: sp.sp_nb_lignes ?? "",
    sp_est_economie: sp.sp_est_economie ?? "",
    sp_fournisseur_propose: sp.sp_fournisseur_propose ?? "",

    // Adresse facturation
    sp_adresse_facturation: adresseFact ? formatAdresse(adresseFact) : "",
    sp_adresse_facturation_rue: adresseFact?.adresse ?? "",
    sp_adresse_facturation_cp: adresseFact?.code_postal ?? "",
    sp_adresse_facturation_ville: adresseFact?.ville ?? "",

    // Adresse livraison
    sp_adresse_livraison: adresseLiv ? formatAdresse(adresseLiv) : "",
    sp_adresse_livraison_rue: adresseLiv?.adresse ?? adresseFact?.adresse ?? "",
    sp_adresse_livraison_cp:
      adresseLiv?.code_postal ?? adresseFact?.code_postal ?? "",
    sp_adresse_livraison_ville: adresseLiv?.ville ?? adresseFact?.ville ?? "",
    sp_livraison_identique: sp.sp_livraison_identique ? "Oui" : "Non",

    // Tableaux individuels
    sp_lignes_mobiles: sp.sp_lignes_mobiles ?? [],
    sp_lignes_fixes: sp.sp_lignes_fixes ?? [],
    sp_internet: sp.sp_internet ?? [],
    sp_materiel: sp.sp_materiel ?? [],

    // Tableaux fusionnés standard
    sp_fixes_mobiles: sp.sp_fixes_mobiles ?? [],
    sp_fixes_mobiles_internet: sp.sp_fixes_mobiles_internet ?? [],
    sp_toutes_lignes: sp.sp_toutes_lignes ?? [],
    sp_tout: sp.sp_tout ?? [],
  };

  // Tableaux fusionnés custom (configurés dans la config template)
  if (tableauxFusionnes) {
    for (const fusion of tableauxFusionnes) {
      if (sp[fusion.id] !== undefined) {
        data[fusion.id] = sp[fusion.id];
      } else {
        // Construire à la volée depuis les catégories
        const items: unknown[] = [];
        for (const cat of fusion.categories) {
          const map: Record<string, unknown[]> = {
            mobiles: sp.sp_lignes_mobiles ?? [],
            fixes: sp.sp_lignes_fixes ?? [],
            internet: sp.sp_internet ?? [],
            materiel: sp.sp_materiel ?? [],
          };
          items.push(...(map[cat] ?? []));
        }
        data[fusion.id] = items;
      }
    }
  }

  // Variables SP custom
  // (clés dynamiques déjà dans sp si l'IA les a renseignées)

  return data;
}

function formatAdresse(a: SpAdresse): string {
  return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays]
    .filter(Boolean)
    .join(", ");
}
```

---

## PARTIE 4 — MODIFIER `lib/generators/index.ts`

Dans la fonction qui génère le Word, juste avant `doc.render(mappedData)` :

```typescript
import { buildSpWordData } from "./sp-word-data";
import type { SuggestionsSpCompletes, WordConfig } from "@/types";

// Récupérer les données SP complètes
const spCompletes = (options.suggestions_sp_completes ??
  null) as SuggestionsSpCompletes | null;
const wordCfg = (template.file_config ?? {}) as WordConfig;
const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);

// Fusion : SP ne peut pas écraser les clés SA (priorité SA)
const finalData = { ...mappedData, ...spData };

doc.render(finalData); // ← remplace doc.render(mappedData)
```

S'assurer que la query Supabase dans l'API generate sélectionne `suggestions_sp_completes`.

---

## PARTIE 5 — API GÉNÉRATION SP (modifier `app/api/propositions/generer-suggestions/route.ts`)

### Nouvelles données reçues en entrée

```typescript
const {
  situation_actuelle,
  catalogue,
  preferences,
  proposition_id,
  sp_questions_reponses, // SpQuestionReponse[]
} = body ?? {};

// Depuis preferences :
const fournisseur_prefere = preferences?.fournisseur_prefere; // string
const proposer_materiel = preferences?.proposer_materiel; // boolean
const adresse_facturation = preferences?.adresse_facturation; // SpAdresse
const adresse_livraison = preferences?.adresse_livraison; // SpAdresse | null
```

### Règles ABSOLUES du prompt IA

Le prompt doit contenir ces règles gravées dans le marbre :

```
RÈGLE ABSOLUE 1 — PRODUITS :
- Tu ne peux proposer QUE des produits qui existent dans NOTRE CATALOGUE avec leur ID exact.
- Si aucun produit du catalogue ne convient à une ligne :
  produit_propose_nom = "Aucun produit semblable trouvé"
  produit_propose_id = null
  prix_propose = prix_actuel
  economie_mensuelle = 0
- INTERDICTION ABSOLUE de reprendre un produit de la situation actuelle ou d'inventer un produit.

RÈGLE ABSOLUE 2 — FOURNISSEUR :
- Si un fournisseur préféré est spécifié, privilégier ses produits EN PRIORITÉ.
- Si aucun produit de ce fournisseur ne convient : retourner "Aucun produit semblable trouvé".

RÈGLE ABSOLUE 3 — MATÉRIEL :
- N'inclure la section sp_materiel QUE si proposer_materiel = true.
- Le matériel doit venir du catalogue (catégorie equipement) uniquement.
```

### Structure JSON retournée par l'IA

```json
{
  "suggestions": [
    /* tableau existant, une entrée par ligne analysée */
  ],
  "synthese": {
    /* existant */
  },

  "sp_lignes_mobiles": [
    {
      "sp_nom_ligne": "06 12 34 56 78",
      "sp_produit": "Forfait Pro 100Go",
      "sp_produit_id": "uuid-catalogue",
      "sp_produit_fournisseur": "Orange",
      "sp_type_ligne": "Mobile",
      "_prix_actuel_raw": 29.9,
      "_prix_propose_raw": 19.9,
      "_economie_raw": 10.0,
      "sp_analyse": "Réduction de 33% avec mêmes données",
      "sp_justification": "..."
    }
  ],
  "sp_lignes_fixes": [
    /* même structure, sp_type_ligne: "Fixe" */
  ],
  "sp_internet": [
    /* même structure, sp_type_ligne: "Internet" */
  ],
  "sp_materiel": [
    /* uniquement si proposer_materiel: true */
    {
      "sp_materiel_nom": "Copieur Canon ImageRUNNER",
      "sp_materiel_ref": "IR-2625i",
      "sp_materiel_produit_id": "uuid-catalogue",
      "sp_materiel_fournisseur": "Canon",
      "sp_type_ligne": "Materiel",
      "_prix_mensuel_raw": 89.0,
      "sp_materiel_duree_engagement": "36 mois",
      "sp_materiel_commentaire": "Remplacement du matériel vieillissant"
    }
  ],
  "sp_fournisseur_propose": "Orange",
  "sp_ameliorations": "Réduction de 25% sur les lignes mobiles..."
}
```

### Post-traitement

Après réception de la réponse IA :

1. Formater toutes les valeurs `_raw` en string (`"45,00 €"`) → `sp_prix_actuel`, `sp_prix_propose`, etc.
2. Calculer les tableaux fusionnés selon `spTableauxFusionnes` de la config template.
3. Calculer `sp_economie_mensuelle`, `sp_economie_annuelle`, `sp_total_actuel`, `sp_total_propose`, `sp_nb_lignes`, `sp_est_economie`.
4. Intégrer `adresse_facturation` et `adresse_livraison` depuis les réponses aux questions.
5. Sauvegarder dans `propositions.suggestions_sp_completes`.

---

## PARTIE 6 — ÉTAPE 5 : INTERFACE CHAT (`components/propositions/Step5SpQuestions.tsx`)

### Design : interface de type conversation

- Les questions déjà répondues s'affichent en haut comme un historique de conversation :
  - Bulle grise à gauche = question de l'IA (avec avatar icône robot)
  - Bulle bleue/verte à droite = réponse de l'utilisateur
- Animation "l'IA écrit..." (3 points clignotants) avant chaque nouvelle question (500ms)
- Scroll automatique vers le bas à chaque nouvelle question
- La question en cours s'affiche en bas avec ses options de réponse

### Comportement selon le type d'affichage

**`boutons_choix_unique` / `boutons_choix_multiple` :**

- Clic = réponse enregistrée + passage automatique à la question suivante (pas de bouton Suivant)
- Transition fluide avec slide-up de la prochaine question

**`oui_non` :**

- Idem, clic = passage automatique

**`confirmation_sa` / `edition_sa` (adresse) :**

- Afficher la valeur extraite de la SA
- Bouton "Oui, c'est correct" → passage automatique
- Bouton "Non, modifier" → formulaire éditable avec bouton "Valider" (seul cas avec bouton)

**`texte_court` / `texte_long` / `nombre` / `date` :**

- Champ de saisie + bouton "Valider"

### Chargement des questions

```typescript
// Récupérer les questions actives du template sélectionné
GET /api/templates/[template_id]/sp-questions

// Récupérer les fournisseurs du catalogue pour Q de type choix_catalogue
GET /api/catalogue/fournisseurs?categories=mobile,fixe,...

// Récupérer tous les fournisseurs uniques
GET /api/catalogue/fournisseurs
```

### Déclenchement des conséquences

Après chaque réponse, évaluer les `consequences` de la question :

- `afficher_question` / `masquer_question` → mettre à jour la liste des questions visibles
- `filtrer_question` → mettre à jour les filtres catalogue de la question cible
- `aller_question` → sauter directement à la question indiquée

### Bouton "Générer la SP"

Apparaît uniquement quand toutes les questions obligatoires ont une réponse.
Affiche un récapitulatif des réponses avant le bouton.
Appelle `POST /api/propositions/generer-suggestions` avec toutes les données enrichies.

---

## PARTIE 7 — ÉDITEUR SP (`components/propositions/Step5EditSp.tsx`)

Affiché après génération, avant de passer à l'étape 6.

### Sections

**Lignes mobiles proposées** :

- Tableau avec colonnes : Ligne actuelle | Produit proposé | Prix actuel | Prix proposé | Économie | Analyse
- Produit via **dropdown catalogue filtré automatiquement** par `categorie === 'mobile'`
- Prix éditables inline
- Bouton "+" pour ajouter une ligne vide
- Bouton 🗑️ pour supprimer une ligne

**Lignes fixes proposées** : même structure, filtre `categorie === 'fixe'`

**Internet proposé** : même structure, filtre `categorie === 'internet'`

**Matériel proposé** (visible si réponse "Proposer matériel" = Oui) :

- Colonnes : Nom | Référence | Prix mensuel | Durée engagement | Commentaire
- Dropdown catalogue filtré `categorie === 'equipement'`
- Ajout / suppression

**Synthèse** (recalculée automatiquement à chaque modification) :

- Économie mensuelle totale
- Économie annuelle
- Total actuel / Total proposé
- Points d'amélioration (textarea éditable)

**Adresses** :

- Récapitulatif facturation + livraison avec bouton "Modifier"

### Sauvegarde

Bouton "Valider la SP" → `PATCH /api/propositions/[id]/update` avec `suggestions_sp_completes` mis à jour → passe à l'étape 6.

---

## PARTIE 8 — WIZARD (`components/propositions/PropositionWizard.tsx`)

```typescript
const STEPS = [
  { id: 1, name: 'Template',           description: 'Sélection' },
  { id: 2, name: 'Documents',          description: 'Upload' },
  { id: 3, name: 'Extraction',         description: 'IA' },
  { id: 4, name: 'Édition SA',         description: 'Vérification' },
  { id: 5, name: 'Situation Proposée', description: 'IA + Validation' },
  { id: 6, name: 'Génération',         description: 'Finalisation' },
];

// Ajouter dans PropositionData :
suggestions_sp_completes?: SuggestionsSpCompletes | null;
sp_reponses?: SpQuestionReponse[];

// nextStep : < 6 au lieu de < 5
// Étape 5 : <Step5SpQuestions /> si file_type === 'word', sinon sauter à 6
// Étape 6 : <Step6Generate /> (ancienne Step5Generate)
// Mettre à jour resume/page.tsx pour gérer 6 étapes
```

---

## PARTIE 9 — CONFIG TEMPLATE WORD (`components/templates/Step2UploadTemplate.tsx`)

Ajouter une section **"Variables Situation Proposée (SP)"** après la section SA existante.
N'afficher cette section QUE si `file_type === 'word'`.

### 9.1 Variables simples SP

Même UX que pour la SA : liste avec bouton "Copier" variable par variable.

Variables à afficher :

```
{{sp_economie_mensuelle}}        Économie mensuelle (ex: "45,00 €")
{{sp_economie_annuelle}}         Économie annuelle
{{sp_total_actuel}}              Total situation actuelle HT
{{sp_total_propose}}             Total situation proposée HT
{{sp_ameliorations}}             Points clés de l'offre proposée
{{sp_fournisseur_propose}}       Fournisseur retenu
{{sp_nb_lignes}}                 Nombre de lignes analysées
{{sp_est_economie}}              "Oui" ou "Non"
{{sp_adresse_facturation}}       Adresse facturation complète (ligne unique)
{{sp_adresse_facturation_rue}}   Rue facturation
{{sp_adresse_facturation_cp}}    Code postal facturation
{{sp_adresse_facturation_ville}} Ville facturation
{{sp_adresse_livraison}}         Adresse livraison complète
{{sp_adresse_livraison_rue}}     Rue livraison
{{sp_adresse_livraison_cp}}      Code postal livraison
{{sp_adresse_livraison_ville}}   Ville livraison
{{sp_livraison_identique}}       "Oui" ou "Non"
```

### 9.2 Tableaux SP

Même UX que pour les tableaux SA :

- Bouton "Copier le bloc complet" (bloc `{{#...}}...{{/...}}`)
- ET champs individuels copiables un par un (dans un accordéon "Options avancées" comme la SA)

Blocs à afficher :

**Tableau lignes mobiles :**

```
{{#sp_lignes_mobiles}}
{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_lignes_mobiles}}
```

Champs individuels : `sp_nom_ligne`, `sp_produit`, `sp_prix_actuel`, `sp_prix_propose`, `sp_economie`, `sp_analyse`, `sp_justification`, `sp_type_ligne`

**Tableau lignes fixes :** même structure

**Tableau internet :** même structure

**Tableau matériel :**

```
{{#sp_materiel}}
{{sp_materiel_nom}}  {{sp_materiel_ref}}  {{sp_materiel_prix_mensuel}}  {{sp_materiel_duree_engagement}}  {{sp_materiel_commentaire}}
{{/sp_materiel}}
```

Champs individuels : `sp_materiel_nom`, `sp_materiel_ref`, `sp_materiel_prix_mensuel`, `sp_materiel_duree_engagement`, `sp_materiel_commentaire`, `sp_type_ligne`

### 9.3 Tableaux fusionnés

UI pour configurer `WordConfig.spTableauxFusionnes` :

- Liste des fusions déjà configurées
- Bouton "Ajouter une fusion"
- Formulaire : sélection multi des catégories (checkboxes — libellés chargés depuis BDD, pas hardcodés), label libre, ID auto-généré (`sp_` + catégories jointes)
- Pour chaque fusion : afficher le bloc Word à copier (complet ET champs individuels)

### 9.4 Variables SP custom

UI pour configurer `WordConfig.spVariablesCustom` :

- Liste des variables custom déjà créées
- Bouton "Ajouter une variable SP"
- Formulaire :
  - Type : **Simple** ou **Tableau**
  - Nom (préfixe `sp_` forcé et affiché fixe)
  - Label (nom lisible)
  - Description (instruction pour l'IA — ex: "Résumé en 2 phrases de l'avantage concurrentiel")
  - Si type Tableau : définir les sous-champs (id, label, type string/number/date) — même UX que ARRAY_FIELDS SA
- Les variables custom simples apparaissent dans la section 9.1 avec leur label
- Les variables custom tableaux apparaissent dans la section 9.2 avec leurs blocs à copier
- Ces variables sont ensuite disponibles dans le dropdown du BLOC 4 du constructeur de questions

---

## PARTIE 10 — PARAMÈTRES CLIENT : CONSTRUCTEUR DE QUESTIONS SP

### 10.1 Organisation dans les paramètres

Dans `app/(client)/settings/page.tsx`, ajouter un onglet ou section **"Questions SP"**.

Les questions sont **séparées par template** dans l'UI :

- Un accordéon ou onglet par template de type Word
- Titre : nom du template
- Liste des questions configurées pour ce template
- Bouton "Ajouter une question" par template

### 10.2 Composant principal

Créer `components/settings/SpQuestionsManager.tsx` :

- Affiche les templates Word de l'organisation
- Pour chaque template : liste de ses questions SP avec drag-and-drop pour réordonner (`@hello-pangea/dnd`)
- Chaque question : libellé, type affiché (badge coloré), toggle actif/inactif, bouton éditer, bouton supprimer
- Bouton "Ajouter une question" → ouvre le constructeur
- Sauvegarde via `PATCH /api/organizations/me` avec `sp_questions`

### 10.3 Constructeur de questions (`components/settings/SpQuestionBuilder.tsx`)

**4 blocs visuels enchaînés, style Lego/Zapier.**
Les options de chaque bloc s'adaptent dynamiquement aux choix des blocs précédents.
Prévisualisation temps réel de ce que verra l'utilisateur lors de la création de proposition.

---

#### BLOC 1 — SOURCE

```
Qu'est-ce que l'IA utilise pour répondre à cette question ?

○ Catalogue produits
○ Données SA extraites
○ Aucune (saisie manuelle)
○ Catalogue + SA combinés
```

---

#### BLOC 2 — CONDITIONS (déclencheur)

_"Quand cette question s'affiche-t-elle ?"_

Option par défaut : **Toujours afficher**.

**Si SOURCE = Catalogue OU Catalogue+SA :**

Filtres catalogue (tous chargés dynamiquement depuis la BDD) :

```
Catégorie :
  [Multi-sélection — chargée depuis catalogue.categorie de l'organisation]
  "Toutes" par défaut

Fournisseur :
  [Multi-sélection — chargé depuis catalogue.fournisseur de l'organisation]
  "Tous" par défaut
  OU "Utiliser la réponse de la question [dropdown questions précédentes]"

Type de facturation :
  ○ Tous  ○ Mensuel  ○ Unique

Combinaisons ET/OU :
  Constructeur de règles :
  [Catégorie] [Mobile] ET/OU [Fournisseur] [Orange] ET/OU [Facturation] [Mensuel]
  Bouton "+ Ajouter une condition"
  Groupes de conditions avec parenthèses visuelles
```

**Si SOURCE = SA OU Catalogue+SA :**

```
Variable SA :
  Dropdown chargé depuis champs_actifs du template sélectionné
  Groupé par : Champs simples / Tableaux
  Pour les tableaux : sous-champs disponibles
    ex: lignes_mobiles → numero, forfait, tarif, date_fin_engagement...
    Les tableaux fusionnés proposent les éléments combinés

Opérateur :
  ○ est égal à [valeur]
  ○ n'est pas égal à [valeur]
  ○ est vide
  ○ n'est pas vide
  ○ contient le mot [valeur]
  ○ ne contient pas le mot [valeur]
  ○ est supérieur à [nombre]      (champs numériques uniquement)
  ○ est inférieur à [nombre]      (champs numériques uniquement)
  ○ a plus de X éléments          (tableaux uniquement)
  ○ a moins de X éléments         (tableaux uniquement)
  ○ contient un élément où [sous-champ] [opérateur] [valeur]

Combinaisons ET/OU avec groupes (idem catalogue)
```

**Si SOURCE = Aucune :**

```
○ Toujours afficher
○ Afficher si [variable SA] [opérateur] [valeur]
○ Afficher si réponse à la question [X] est [valeur]
```

---

#### BLOC 3 — AFFICHAGE

_"Comment poser la question ?"_

**Si SOURCE = Catalogue :**

```
○ Boutons cliquables (choix unique)
○ Boutons cliquables (choix multiple)
○ Liste déroulante

Option "Autre" avec saisie libre :  ○ Oui  ○ Non
Nombre max de résultats : [5 ▼]
```

**Si SOURCE = SA :**

```
○ Oui / Non (avec valeur pré-cochée selon condition)
○ Afficher valeur SA et demander confirmation
○ Afficher valeur SA et permettre l'édition
  Type d'édition : ○ Adresse complète  ○ Texte  ○ Nombre  ○ Date
```

**Si SOURCE = Aucune :**

```
○ Oui / Non
○ Texte court (une ligne)
○ Texte long (textarea)
○ Nombre
○ Date (avec calendrier)
○ Choix dans une liste (options définies manuellement)
  [Ajouter une option] [option 1] [option 2] ...

Validation de format : ○ Aucune  ○ Email  ○ Téléphone  ○ SIRET
Obligatoire : ○ Oui  ○ Non
Valeur par défaut : [___________]
```

**Si SOURCE = Catalogue+SA :**
Combiner les options des deux sources ci-dessus selon ce qui est pertinent.

**Pour TOUTES les sources :**

```
Libellé de la question (toujours personnalisable) :
[____________________________________________]
Variables dynamiques disponibles : {sa.adresse} {reponse.id_question} ...

Description / aide contextuelle (optionnel) :
[____________________________________________]
```

---

#### BLOC 4 — RÉSULTAT

_"Que fait la réponse ?"_

```
Variable SP renseignée :
[Dropdown — variables SP existantes du template uniquement]
  ┌ Variables SP standard (liste complète des sp_* prédéfinis)
  └ Variables SP custom de ce template (créées dans config template)
  [ℹ️ survol : "Ces variables doivent déjà être placées dans votre document Word.
               Pour créer une nouvelle variable, rendez-vous dans la configuration du template."]

Priorité pour l'IA :
○ Normale  ○ Haute (l'IA doit absolument tenir compte de cette réponse)

Conséquences selon la réponse :
  Bouton "+ Ajouter une conséquence"
  Pour chaque conséquence :
    Si réponse est [valeur / Oui / Non / n'importe laquelle] :
    → [Afficher question X / Masquer question X / Aller à question X / Filtrer question X avec ...]
```

---

### 10.4 APIs nécessaires pour le constructeur

```
GET  /api/templates                          — liste des templates Word de l'org
GET  /api/templates/[id]/sp-questions        — questions SP d'un template
POST /api/templates/[id]/sp-questions        — créer une question
PUT  /api/templates/[id]/sp-questions/[qid] — modifier une question
DEL  /api/templates/[id]/sp-questions/[qid] — supprimer une question
PUT  /api/templates/[id]/sp-questions/order  — réordonner

GET  /api/catalogue/categories               — catégories uniques du catalogue (dynamique)
GET  /api/catalogue/fournisseurs             — fournisseurs uniques (dynamique, filtre par categorie)
GET  /api/templates/[id]/sa-variables        — variables SA actives du template (champs_actifs)
GET  /api/templates/[id]/sp-variables        — variables SP du template (standard + custom)
```

---

## PARTIE 11 — API UPDATE

Modifier `app/api/propositions/[id]/update/route.ts` pour accepter :

- `suggestions_sp_completes`
- `sp_reponses`

---

## ORDRE D'IMPLÉMENTATION

1. `types/index.ts`
2. `supabase/migrations/sp_questions.sql`
3. `lib/generators/sp-word-data.ts`
4. Modifier `lib/generators/index.ts`
5. Modifier `app/api/propositions/generer-suggestions/route.ts`
6. APIs catalogue/categories et catalogue/fournisseurs
7. APIs templates/[id]/sp-questions et sp-variables et sa-variables
8. Modifier `app/api/propositions/[id]/update/route.ts`
9. `components/propositions/Step5SpQuestions.tsx`
10. `components/propositions/Step5EditSp.tsx`
11. Modifier `components/propositions/PropositionWizard.tsx` (6 étapes, supprimer bouton SP en Step4)
12. Modifier `components/templates/Step2UploadTemplate.tsx` (section SP)
13. `components/settings/SpQuestionBuilder.tsx`
14. `components/settings/SpQuestionsManager.tsx`
15. Modifier `app/(client)/settings/page.tsx`

---

Commence par `types/index.ts` et confirme avant de passer au fichier suivant.

```

```
