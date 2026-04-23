```
Tu es un développeur senior expert en Next.js 14+, TypeScript, Supabase et Anthropic Claude API. 
Tu travailles sur une plateforme SaaS de génération de propositions commerciales (PropoBoost) 
déjà en production. Tu dois implémenter une fonctionnalité complète sans rien casser de l'existant.

---

## CONTEXTE DU PROJET

Stack : Next.js 14+ App Router, TypeScript strict, Supabase (PostgreSQL + Auth + Storage), 
Claude API (Anthropic), TailwindCSS, shadcn/ui, docxtemplater + pizzip (Word), exceljs (Excel).

Les fichiers clés existants à connaître avant de toucher quoi que ce soit :
- `types/index.ts` — tous les types TypeScript de l'app
- `components/propositions/PropositionWizard.tsx` — wizard 5 étapes (actuellement)
- `components/propositions/Step4EditData.tsx` — édition SA avec EditableSuggestionsView
- `components/propositions/EditableSuggestionsView.tsx` — vue éditable des suggestions SP
- `app/api/propositions/generer-suggestions/route.ts` — génération SP par IA
- `lib/generators/index.ts` — générateur Word/Excel (doc.render via docxtemplater)
- `components/templates/Step2UploadTemplate.tsx` — config template avec variables SA
- `components/admin/organizationFormConfig.ts` — définition ARRAY_FIELDS SA par secteur

Types existants importants :
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

// PropositionData dans PropositionWizard
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

// STEPS actuels du wizard (5 étapes)
// 1: Template, 2: Documents, 3: Extraction, 4: Édition SA, 5: Génération fichier
```

---

## CE QUE TU DOIS IMPLÉMENTER

### Vue d'ensemble

Le wizard proposition passe de 5 à 6 étapes :
- Étape 1 : Sélection template (inchangée)
- Étape 2 : Upload documents (inchangée)
- Étape 3 : Extraction SA par IA (inchangée)
- Étape 4 : Édition/validation SA (inchangée)
- **Étape 5 : Questions IA + Génération SP (NOUVELLE)**
- **Étape 6 : Génération du fichier Word (ancienne étape 5)**

La SP (Situation Proposée) est désormais une entité structurée avec des variables simples ET des tableaux 
(lignes mobiles, fixes, internet, matériel), injectés dans le template Word comme la SA.

---

### PARTIE 1 — TYPES (`types/index.ts`)

Ajoute/modifie ces types sans supprimer l'existant :

```typescript
// ── Questions SP (configurables par le client) ──────────────────

export type SpQuestionType = 
  | 'choix_catalogue'  // boutons issus du catalogue (ex: fournisseurs)
  | 'oui_non'          // choix binaire avec condition
  | 'adresse'          // affichage adresse SA + confirmation/édition
  | 'libre';           // saisie texte libre

export interface SpQuestion {
  id: string;
  ordre: number;
  actif: boolean;
  type: SpQuestionType;
  question: string;               // texte affiché, peut contenir {sa.champ}
  description?: string;           // aide contextuelle
  condition?: string;             // ex: "sa.materiel.length > 0" (évalué côté serveur)
  variable_cible: string;         // variable SP renseignée par cette question
  obligatoire: boolean;
  options_libres?: boolean;       // pour choix_catalogue: ajouter champ "Autre" libre
}

// 4 questions par défaut (à insérer en BDD à la création du compte)
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

// ── Réponses aux questions SP ────────────────────────────────────

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

// ── Données SP structurées (enrichissement de SuggestionsGenerees) ──

export interface SpLigneMobile {
  sp_nom_ligne: string;
  sp_produit: string;
  sp_produit_id?: string;
  sp_prix_actuel: string;      // formaté "45,00 €"
  sp_prix_propose: string;
  sp_economie: string;
  sp_analyse: string;
  sp_justification: string;
  // champs bruts pour calculs
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

// Extension de SuggestionsGenerees pour inclure les tableaux SP et les adresses
export interface SuggestionsSpCompletes extends SuggestionsGenerees {
  // Données des questions
  sp_fournisseur_propose?: string;
  sp_adresse_facturation?: SpAdresse;
  sp_adresse_livraison?: SpAdresse | null;  // null = identique à facturation
  sp_livraison_identique?: boolean;
  
  // Tableaux par catégorie
  sp_lignes_mobiles: SpLigneMobile[];
  sp_lignes_fixes: SpLigneFixe[];
  sp_internet: SpInternet[];
  sp_materiel: SpMateriel[];
  
  // Tableaux fusionnés pré-calculés (selon config template)
  sp_fixes_mobiles?: (SpLigneMobile | SpLigneFixe)[];
  sp_fixes_mobiles_internet?: (SpLigneMobile | SpLigneFixe | SpInternet)[];
  sp_toutes_lignes?: (SpLigneMobile | SpLigneFixe | SpInternet)[];
  sp_tout?: (SpLigneMobile | SpLigneFixe | SpInternet | SpMateriel)[];
  
  // Variables simples
  sp_economie_mensuelle: string;
  sp_economie_annuelle: string;
  sp_total_actuel: string;
  sp_total_propose: string;
  sp_ameliorations: string;
  sp_nb_lignes: string;
  sp_est_economie: string;
}

// ── Extension WordConfig ─────────────────────────────────────────

export interface WordConfig {
  formatVariables: string;
  fieldMappings: Record<string, string>;
  tableauxDynamiques?: unknown[];
  imagesARemplacer?: Record<string, string>;
  
  // NOUVEAU : configuration des variables SP
  spEnabled?: boolean;
  spVariablesActives?: string[];   // liste des variables SP utilisées dans ce template
  spTableauxFusionnes?: SpTableauFusionne[];  // tableaux fusionnés configurés
  spVariablesCustom?: SpVariableCustom[];     // variables SP personnalisées
}

export interface SpTableauFusionne {
  id: string;           // ex: "sp_fixes_mobiles"
  label: string;        // ex: "Fixes + Mobiles"
  categories: Array<'mobiles' | 'fixes' | 'internet' | 'materiel'>;
}

export interface SpVariableCustom {
  key: string;           // ex: "sp_avantage_concurrentiel"
  label: string;         // ex: "Avantage concurrentiel"
  description: string;   // instruction pour l'IA
  type: 'string' | 'number';
}

// ── Extension PropositionData ────────────────────────────────────
// (dans PropositionWizard.tsx, ajouter ces champs à l'interface)
// suggestions_sp_completes?: SuggestionsSpCompletes | null;
// sp_reponses?: SpQuestionReponse[];
```

---

### PARTIE 2 — BASE DE DONNÉES

Ajoute ces migrations SQL (à documenter dans un fichier `supabase/migrations/sp_questions.sql`) :

```sql
-- Ajout de sp_questions dans organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS sp_questions JSONB DEFAULT '[]'::jsonb;

-- Ajout de suggestions_sp_completes dans propositions
ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS suggestions_sp_completes JSONB DEFAULT NULL;

ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS sp_reponses JSONB DEFAULT '[]'::jsonb;

-- Fonction pour initialiser les questions par défaut
CREATE OR REPLACE FUNCTION initialize_sp_questions_defaut()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sp_questions IS NULL OR NEW.sp_questions = '[]'::jsonb THEN
    NEW.sp_questions = '[
      {"id":"q_fournisseur","ordre":1,"actif":true,"type":"choix_catalogue",
       "question":"Quel fournisseur préférez-vous pour cette offre ?",
       "variable_cible":"sp_fournisseur_propose","obligatoire":true,"options_libres":true},
      {"id":"q_materiel","ordre":2,"actif":true,"type":"oui_non",
       "question":"Proposer du matériel ?",
       "variable_cible":"sp_materiel","obligatoire":false},
      {"id":"q_adresse_fact","ordre":3,"actif":true,"type":"adresse",
       "question":"L''adresse de facturation est bien au : {sa.adresse} ?",
       "variable_cible":"sp_adresse_facturation","obligatoire":true},
      {"id":"q_adresse_liv","ordre":4,"actif":true,"type":"oui_non",
       "question":"L''adresse de livraison est la même que l''adresse de facturation ?",
       "variable_cible":"sp_adresse_livraison","obligatoire":true}
    ]'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sp_questions_defaut
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION initialize_sp_questions_defaut();
```

---

### PARTIE 3 — PARAMÈTRES CLIENT (page settings)

Crée ou modifie `app/(client)/settings/page.tsx` pour ajouter une section 
**"Questions de génération SP"**.

Crée `components/settings/SpQuestionsManager.tsx` :

**Fonctionnalités :**
- Affiche la liste des questions dans l'ordre (drag-and-drop pour réordonner via `@hello-pangea/dnd`)
- Chaque question affiche : son texte, son type (badge coloré), un toggle actif/inactif, bouton supprimer
- Bouton "Ajouter une question" → formulaire avec champs : texte, type, variable_cible, description, obligatoire, options_libres
- Bouton "Restaurer les questions par défaut" → remet les 4 questions initiales
- Sauvegarde via `PATCH /api/organizations/me` avec le champ `sp_questions`
- UX cohérente avec le design existant (shadcn/ui, Tailwind, couleurs de l'app)

---

### PARTIE 4 — ÉTAPE 5 DU WIZARD (Questions IA + Génération SP)

Crée `components/propositions/Step5SpQuestions.tsx`.

**Phase A : Questions interactives**

Affiche les questions actives de l'organisation une par une dans l'ordre.

Pour chaque type :

**`choix_catalogue`** (ex: fournisseur) :
- Récupère la liste des fournisseurs uniques du catalogue (`/api/catalogue?fields=fournisseur`)
- Affiche des boutons cliquables pour chaque fournisseur (1 seul choix)
- Si `options_libres: true` → champ texte "Autre" en bas
- Variable renseignée : string (nom du fournisseur)

**`oui_non`** (ex: matériel, adresse livraison) :
- 2 boutons "Oui" / "Non"
- Pour `q_materiel` : si la SA contient du matériel (`donnees_extraites.materiel` ou équivalent), 
  afficher une note "Matériel détecté dans la SA : [liste]" et pré-sélectionner "Oui"
- Variable renseignée : boolean

**`adresse`** (ex: adresse facturation) :
- Extraire l'adresse depuis `donnees_extraites` (chercher `adresse`, `adresse_client`, `client.adresse`)
- Afficher l'adresse trouvée avec boutons "Oui, c'est correct" / "Non, modifier"
- Si "Non" → formulaire éditable : adresse, complément, code_postal, ville, pays
- Variable renseignée : SpAdresse

**Navigation :** boutons Précédent/Suivant entre les questions, barre de progression.

**Phase B : Bouton "Générer la SP"**

Une fois toutes les questions répondues, afficher un récapitulatif des réponses et un bouton 
"Générer la situation proposée avec l'IA".

Appelle `POST /api/propositions/generer-suggestions` avec le body enrichi :
```json
{
  "proposition_id": "...",
  "situation_actuelle": { /* donnees_extraites */ },
  "catalogue": [ /* produits du catalogue */ ],
  "preferences": {
    "objectif": "equilibre",
    "fournisseur_prefere": "Orange",  // réponse Q1
    "proposer_materiel": true,         // réponse Q2
    "adresse_facturation": { ... },    // réponse Q3
    "adresse_livraison": null          // null si identique
  },
  "sp_questions_reponses": [ /* toutes les réponses */ ]
}
```

**Phase C : Résultat SP éditable**

Après génération, afficher `Step5EditSp` (voir ci-dessous) pour édition avant de passer à l'étape 6.

---

### PARTIE 5 — COMPOSANT D'ÉDITION SP (`Step5EditSp.tsx`)

Crée `components/propositions/Step5EditSp.tsx`.

Affiche les tableaux SP éditable avec possibilité d'**ajouter et supprimer des lignes** :

**Section "Lignes mobiles proposées"** :
- Tableau avec colonnes : Ligne actuelle | Produit proposé | Prix actuel | Prix proposé | Économie | Analyse
- Chaque ligne : éditable inline (produit via dropdown catalogue filtré par fournisseur choisi, prix editables)
- Bouton "+" en bas du tableau pour ajouter une ligne vide
- Bouton 🗑️ sur chaque ligne pour supprimer
- Même structure pour Lignes fixes, Internet

**Section "Matériel proposé"** (visible si réponse Q2 = Oui) :
- Colonnes : Nom | Référence | Prix mensuel | Durée engagement | Commentaire
- Produit via dropdown catalogue (catégorie `equipement`)
- Ajout/suppression de lignes

**Section "Synthèse"** :
- Économie mensuelle totale (recalculée automatiquement à chaque modification)
- Économie annuelle
- Total actuel / Total proposé
- Points d'amélioration (textarea éditable)

**Section "Adresses"** :
- Affichage récapitulatif adresse facturation et livraison avec bouton éditer

Bouton "Valider la SP" → sauvegarde `suggestions_sp_completes` via `PATCH /api/propositions/[id]/update` et passe à l'étape 6.

---

### PARTIE 6 — API GÉNÉRATION SP (modifier l'existante)

Modifie `app/api/propositions/generer-suggestions/route.ts` :

**Nouvelles responsabilités du prompt Claude :**

Le prompt doit maintenant demander à l'IA de retourner une structure JSON enrichie :

```json
{
  "suggestions": [ /* tableau existant, une entrée par ligne analysée */ ],
  "synthese": { /* existant */ },
  
  // NOUVEAU : tableaux SP par catégorie
  "sp_lignes_mobiles": [
    {
      "sp_nom_ligne": "06 12 34 56 78",
      "sp_produit": "Forfait Pro 100Go",
      "sp_produit_id": "uuid-du-produit",
      "sp_prix_actuel_raw": 29.90,
      "sp_prix_propose_raw": 19.90,
      "sp_economie_raw": 10.00,
      "sp_analyse": "Réduction de 33% avec mêmes data",
      "sp_justification": "Le forfait Pro 100Go d'Orange couvre les besoins..."
    }
  ],
  "sp_lignes_fixes": [ /* même structure */ ],
  "sp_internet": [ /* même structure */ ],
  "sp_materiel": [   /* uniquement si proposer_materiel: true */
    {
      "sp_materiel_nom": "Copieur Canon ImageRUNNER",
      "sp_materiel_ref": "IR-2625i",
      "sp_materiel_prix_mensuel_raw": 89.00,
      "sp_materiel_duree_engagement": "36 mois",
      "sp_materiel_commentaire": "Remplacement du matériel vieillissant",
      "sp_materiel_produit_id": "uuid-du-produit"
    }
  ],
  
  // Variables SP simples
  "sp_fournisseur_propose": "Orange",
  "sp_ameliorations": "Réduction de 25% sur les lignes mobiles. Meilleure couverture 5G."
}
```

Le prompt doit inclure :
- Le fournisseur préféré → filtrer les produits proposés par ce fournisseur en priorité
- `proposer_materiel` → inclure ou non la section matériel
- Les adresses → les intégrer directement dans la réponse

**Post-traitement :** Formater toutes les valeurs numériques en string (`"45,00 €"`) et calculer les tableaux fusionnés selon `spTableauxFusionnes` de la config template.

Sauvegarder dans `propositions.suggestions_sp_completes` via Supabase.

---

### PARTIE 7 — GÉNÉRATEUR WORD (modifier l'existant)

Crée `lib/generators/sp-word-data.ts` :

```typescript
import type { SuggestionsSpCompletes, SpAdresse } from '@/types';

/**
 * Convertit SuggestionsSpCompletes en objet injectable dans Docxtemplater.
 * Compatible avec la syntaxe {{variable}} pour les simples
 * et {{#tableau}}...{{/tableau}} pour les tableaux.
 */
export function buildSpWordData(
  sp: SuggestionsSpCompletes | null | undefined
): Record<string, unknown> {
  if (!sp) return {};

  const adresseFactStr = sp.sp_adresse_facturation 
    ? formatAdresse(sp.sp_adresse_facturation) 
    : '';
  
  const adresseLivStr = sp.sp_livraison_identique 
    ? adresseFactStr 
    : (sp.sp_adresse_livraison ? formatAdresse(sp.sp_adresse_livraison) : '');

  return {
    // Variables simples
    sp_economie_mensuelle: sp.sp_economie_mensuelle,
    sp_economie_annuelle: sp.sp_economie_annuelle,
    sp_total_actuel: sp.sp_total_actuel,
    sp_total_propose: sp.sp_total_propose,
    sp_ameliorations: sp.sp_ameliorations,
    sp_nb_lignes: sp.sp_nb_lignes,
    sp_est_economie: sp.sp_est_economie,
    sp_fournisseur_propose: sp.sp_fournisseur_propose ?? '',
    
    // Adresses
    sp_adresse_facturation: adresseFactStr,
    sp_adresse_facturation_rue: sp.sp_adresse_facturation?.adresse ?? '',
    sp_adresse_facturation_cp: sp.sp_adresse_facturation?.code_postal ?? '',
    sp_adresse_facturation_ville: sp.sp_adresse_facturation?.ville ?? '',
    sp_adresse_livraison: adresseLivStr,
    sp_adresse_livraison_rue: sp.sp_adresse_livraison?.adresse ?? adresseFactStr,
    sp_adresse_livraison_cp: sp.sp_adresse_livraison?.code_postal ?? sp.sp_adresse_facturation?.code_postal ?? '',
    sp_adresse_livraison_ville: sp.sp_adresse_livraison?.ville ?? sp.sp_adresse_facturation?.ville ?? '',
    sp_livraison_identique: sp.sp_livraison_identique ? 'Oui' : 'Non',

    // Tableaux individuels
    sp_lignes_mobiles: sp.sp_lignes_mobiles ?? [],
    sp_lignes_fixes: sp.sp_lignes_fixes ?? [],
    sp_internet: sp.sp_internet ?? [],
    sp_materiel: sp.sp_materiel ?? [],
    
    // Tableaux fusionnés (pré-calculés, peuvent être vides [])
    sp_fixes_mobiles: sp.sp_fixes_mobiles ?? [],
    sp_fixes_mobiles_internet: sp.sp_fixes_mobiles_internet ?? [],
    sp_toutes_lignes: sp.sp_toutes_lignes ?? [],
    sp_tout: sp.sp_tout ?? [],
  };
}

function formatAdresse(a: SpAdresse): string {
  const parts = [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays].filter(Boolean);
  return parts.join(', ');
}
```

**Modifier `lib/generators/index.ts`** dans la fonction Word (`generateWordFile`) :

```typescript
// Ajouter cet import
import { buildSpWordData } from './sp-word-data';
import type { SuggestionsSpCompletes } from '@/types';

// Dans generateWordFile, juste avant doc.render(mappedData) :
const spCompletes = options.suggestions_sp_completes as SuggestionsSpCompletes | null ?? null;
const spData = buildSpWordData(spCompletes);

// Fusion : spData ne peut pas écraser les clés SA (priorité SA)
const finalData = { ...mappedData, ...spData };

doc.render(finalData); // ← remplace doc.render(mappedData)
```

S'assurer que `options` dans `generateFile` inclut `suggestions_sp_completes` et que la query Supabase dans l'API generate sélectionne ce champ.

---

### PARTIE 8 — CONFIG TEMPLATE (variables SP dans Step2UploadTemplate)

Modifie `components/templates/Step2UploadTemplate.tsx` pour ajouter, après la section des champs simples SA existants, une section **"Variables Situation Proposée (SP)"**.

**Variables simples SP à afficher avec bouton Copier :**
```
{{sp_economie_mensuelle}}      — Économie mensuelle (ex: "45,00 €")
{{sp_economie_annuelle}}       — Économie annuelle (ex: "540,00 €")
{{sp_total_actuel}}            — Total situation actuelle HT
{{sp_total_propose}}           — Total situation proposée HT
{{sp_ameliorations}}           — Points clés de l'offre proposée
{{sp_fournisseur_propose}}     — Fournisseur retenu
{{sp_nb_lignes}}               — Nombre de lignes analysées
{{sp_adresse_facturation}}     — Adresse facturation complète
{{sp_adresse_facturation_rue}} — Rue facturation
{{sp_adresse_facturation_cp}}  — Code postal facturation
{{sp_adresse_facturation_ville}} — Ville facturation
{{sp_adresse_livraison}}       — Adresse livraison complète
{{sp_adresse_livraison_rue}}   — Rue livraison
{{sp_adresse_livraison_cp}}    — Code postal livraison
{{sp_adresse_livraison_ville}} — Ville livraison
{{sp_livraison_identique}}     — "Oui" ou "Non"
```

**Tableaux SP avec bloc à copier :**

Pour chaque tableau, afficher le bloc complet prêt à copier dans Word :
```
{{#sp_lignes_mobiles}}
Ligne : {{sp_nom_ligne}} | Produit : {{sp_produit}} | Actuel : {{sp_prix_actuel}} | Proposé : {{sp_prix_propose}} | Économie : {{sp_economie}}
{{/sp_lignes_mobiles}}
```
Idem pour `sp_lignes_fixes`, `sp_internet`, `sp_materiel` (avec ses champs spécifiques).

**Section tableaux fusionnés :**
- Permettre au SP d'ajouter des tableaux fusionnés dans `WordConfig.spTableauxFusionnes`
- UI : liste des fusions configurées + bouton "Ajouter une fusion"
- Formulaire : nom du tableau (auto-généré ex: `sp_fixes_mobiles`), sélection multi des catégories (checkboxes : Mobiles, Fixes, Internet, Matériel)
- Pour chaque fusion configurée : afficher le bloc Word correspondant à copier

**Variables custom SP :**
- Section "Variables personnalisées SP" avec bouton "Ajouter"
- Formulaire : nom de la variable (préfixe `sp_` forcé), label, description (instruction pour l'IA)
- Ces variables s'ajoutent à `WordConfig.spVariablesCustom`

---

### PARTIE 9 — WIZARD (mise à jour PropositionWizard)

Modifie `components/propositions/PropositionWizard.tsx` :

```typescript
// Nouveau STEPS
const STEPS = [
  { id: 1, name: 'Template', description: 'Sélection' },
  { id: 2, name: 'Documents', description: 'Upload' },
  { id: 3, name: 'Extraction', description: 'IA' },
  { id: 4, name: 'Édition SA', description: 'Vérification' },
  { id: 5, name: 'Situation Proposée', description: 'IA + Validation' },
  { id: 6, name: 'Génération', description: 'Finalisation' },
];

// Ajouter dans PropositionData
suggestions_sp_completes?: SuggestionsSpCompletes | null;
sp_reponses?: SpQuestionReponse[];

// nextStep passe de < 5 à < 6
// Ajouter le rendu de l'étape 5 (Step5SpQuestions) et décaler Step5Generate en étape 6

// Mettre à jour la logique de resume/page.tsx pour gérer 6 étapes
```

---

### PARTIE 10 — API ROUTE UPDATE (pour sauvegarder SP complète)

Modifie `app/api/propositions/[id]/update/route.ts` pour accepter et sauvegarder :
- `suggestions_sp_completes`
- `sp_reponses`

---

## CONTRAINTES IMPORTANTES

1. **Ne rien casser** : les templates Word existants sans variables SP doivent continuer à fonctionner exactement comme avant. `buildSpWordData(null)` retourne `{}`.

2. **Rétrocompatibilité** : `suggestions_generees` et `suggestions_editees` restent en place. `suggestions_sp_completes` est additionnel.

3. **TypeScript strict** : aucun `any`, utiliser les types définis.

4. **Cohérence UI** : utiliser shadcn/ui, les couleurs et patterns existants. Pas de nouvelle bibliothèque UI sauf `@hello-pangea/dnd` pour le drag-and-drop des questions.

5. **Implémentation dans l'ordre** :
   - D'abord `types/index.ts`
   - Puis `supabase/migrations/sp_questions.sql`
   - Puis `lib/generators/sp-word-data.ts`
   - Puis modifier `lib/generators/index.ts`
   - Puis `app/api/propositions/generer-suggestions/route.ts`
   - Puis `components/propositions/Step5SpQuestions.tsx`
   - Puis `components/propositions/Step5EditSp.tsx`
   - Puis modifier `components/propositions/PropositionWizard.tsx`
   - Puis modifier `components/templates/Step2UploadTemplate.tsx`
   - Puis `components/settings/SpQuestionsManager.tsx`
   - Puis modifier `app/(client)/settings/page.tsx`

6. **Demander confirmation** avant de modifier un fichier existant si l'impact n'est pas clair.

## PÉRIMÈTRE

7. **Word uniquement** : Toute cette implémentation concerne UNIQUEMENT les templates de type 
   `file_type === 'word'`. Les templates Excel et PDF ne sont pas impactés et seront traités 
   dans une phase ultérieure. Dans tous les composants, vérifier `file_type === 'word'` avant 
   d'afficher quoi que ce soit lié à la SP (variables, tableaux, section config template, 
   étape 5 du wizard). Si le template sélectionné n'est pas Word, l'étape 5 est sautée 
   automatiquement et on passe directement à l'étape 6 (génération).

8. **Persistance de chaque étape** : Chaque étape du wizard doit être sauvegardée 
   automatiquement dès que l'utilisateur clique "Suivant" OU "Précédent", ET toutes les 
   30 secondes si des données ont changé (autosave). 
   
   Règles de persistance :
   - Étape 1 → sauvegarder `template_id`
   - Étape 2 → sauvegarder `documents_urls`
   - Étape 3 → sauvegarder `donnees_extraites`, `extraction_confidence`
   - Étape 4 → sauvegarder `filled_data` (données SA éditées)
   - Étape 5 → sauvegarder `sp_reponses` (réponses aux questions) ET 
     `suggestions_sp_completes` (SP générée et éditée)
   - Étape 6 → rien à sauvegarder (génération finale)
   
   Quand l'utilisateur reprend une proposition en cours (`/propositions/[id]/resume`), 
   le wizard se positionne sur la dernière étape complétée et les données déjà saisies 
   sont pré-remplies. Si l'utilisateur revient en arrière (ex: étape 4 → étape 3), 
   les données de l'étape 4 restent sauvegardées et sont toujours là quand il revient 
   en étape 4 — il ne doit jamais tout refaire.
   
   La sauvegarde se fait via `PATCH /api/propositions/[id]/update` avec uniquement 
   les champs modifiés (pas de réécriture complète). Afficher un indicateur visuel 
   discret "Sauvegardé" / "Sauvegarde en cours..." dans le coin supérieur droit du wizard.

Commence par `types/index.ts` et confirme avant de passer au fichier suivant.
```
