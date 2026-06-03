# Plan d'implémentation — Features SP Télécom v2

Refonte complète du système SP télécom pour couvrir : prix par tranche de quantité, destinations produit, config loyer conditionnelle par template, type d'affichage "marge", nouvelles variables Word riches, catégorie cadeau, et export comparatif SA/SP autonome.

---

## Décisions validées

| Sujet | Choix |
|---|---|
| Prix par tranche | Bouton "Ajouter une règle de prix" dans fiche produit, application auto selon quantité SP |
| Destinations produit | 3 cases : Proposition / BDC Opérateur / BDC Matériel |
| Config loyer | **Par template** (comme questions SP), barèmes ordonnés, premier qui matche |
| Marge | Affichage "marge" sur question `source=aucune` → champ libre + recalcul live du loyer |
| Package / Non-Package | 2 templates séparés (pas de question dédiée) |
| Catégorie cadeau | Slug `cadeau`, label "Cadeau" |
| Catégorie installation | Slug `installation`, label "Installation" |
| Indemnités résiliation | Champ libre + suggestion auto = `loyer_actuel × mois_restants` (SA) |
| Mentions auto (phrases) | ❌ pas nécessaire — phrases déjà dans les templates Word, seules les variables de montants/dates sont injectées |
| Images matériel dans Word | Embarquées via `docxtemplater-image-module-free` (téléchargement URL → buffer) |
| Récap "complet" | Champs unifiés : Catégorie / Désignation / Référence / Qté / PU HT / Total HT / Fréquence / FAS / Commentaire |
| Export comparatif SA/SP | Bouton fin de wizard + accessible depuis fiche proposition |

---

## Lot 1 — Catalogue : prix par tranche, destinations, catégories cadeau + installation

### 1.1 Migration SQL
`supabase/migrations/2026-05-20_catalogue_tranches_destinations_cadeau.sql` :

```sql
ALTER TABLE catalogue_produits
  ADD COLUMN prix_par_tranche JSONB DEFAULT NULL,
  ADD COLUMN destinations JSONB DEFAULT '{"proposition":true,"bdc_operateur":true,"bdc_materiel":true}';

-- Pas de migration pour la catégorie : le champ est libre (text) côté DB.
-- L'enum CatalogueCategorie côté TS est étendu.
```

Format `prix_par_tranche` (array, vide = pas de tranches) :
```ts
[
  { id: string; qte_min: number; qte_max: number | null; prix_vente?: number; prix_mensuel?: number; prix_installation?: number },
  ...
]
```

### 1.2 Types
`types/index.ts` :
- `CatalogueCategorie` : ajouter `'cadeau'` et `'installation'`
- Nouveau `CatalogueProduitTranche`
- Nouveau `ProduitDestinations`
- Étendre `CatalogueProduit` avec `prix_par_tranche?` et `destinations?`

### 1.3 UI fiche produit (`components/catalogue/CatalogueProduitForm.tsx`)
- Ajouter **'Cadeau'** et **'Installation'** dans `categorieOptions`.
- Nouvelle section **"Destinations dans les documents"** : 3 cases à cocher (Proposition / BDC Opérateur / BDC Matériel), toutes cochées par défaut.
- Nouvelle section **"Tarifs par quantité"** :
  - Toggle "Activer les tarifs par tranche"
  - Bouton **"+ Ajouter une règle"** qui ajoute une ligne (qte_min, qte_max, prix_vente, prix_mensuel, prix_installation)
  - Possibilité de supprimer / réordonner les tranches
  - Validation : pas de chevauchement, `qte_max=null` autorisé seulement sur la dernière (= ∞)

### 1.4 Helper de résolution prix
Nouveau `lib/catalogue/resolvePrix.ts` :
```ts
export function resolvePrixPourQuantite(
  produit: CatalogueProduit,
  quantite: number,
): { prix_vente: number | null; prix_mensuel: number | null; prix_installation: number | null }
```
- Si `prix_par_tranche` non vide → retourne la première tranche dont `qte_min ≤ quantite ≤ (qte_max ?? ∞)`.
- Fallback sur `prix_vente`/`prix_mensuel`/`prix_installation` historiques.

### 1.5 Intégration questionnaire SP
`components/sp/SpQuestionnaireUI.tsx` :
- Dans `pendingCatalogueSelection`, lorsque l'utilisateur modifie `quantityValue`, appeler `resolvePrixPourQuantite(product, qte)` et **mettre à jour `prixValue` et `fasValue` en live** (sauf si l'utilisateur a explicitement modifié manuellement → garder son override).
- Indicateur visuel discret « Prix appliqué selon tranche (qté X-Y) » quand une tranche est active.

---

## Lot 2 — Config Loyer par template + barèmes conditionnels

### 2.1 Déplacement du stockage
- **Avant** : `OrganizationPreferences.sp_config_loyer`
- **Après** : `proposition_templates.file_config.sp_config_loyer` (par template, comme `spVariablesCustom`)
- Migration : script `lib/migrations/migrate-loyer-config.ts` qui copie `org.preferences.sp_config_loyer` vers chaque template existant (one-shot, idempotent).

### 2.2 Refonte du type `SpConfigLoyer`
```ts
interface SpBareme {
  id: string;
  nom: string;                          // libellé visible (ex: "63 mois standard")
  ordre: number;                        // ordre d'évaluation
  groupes_conditions?: SpGroupeConditions[];  // mêmes structures que SpRegleRemise
  logique_declencheur?: SpConditionLogique;
  taux_durees: SpTauxDuree[];           // {duree_mois, taux_loyer, mois_offerts, trimestres}
}

interface SpConfigLoyer {
  baremes: SpBareme[];   // évalués dans l'ordre, premier qui matche
}
```
- **Suppression** de `marge_suggestion_active`, `marge_pourcentage_defaut`.
- **Suppression** de la fonction `suggererMarge()` dans `lib/sp/calculLoyer.ts`.

### 2.3 Onglet Settings "Calculer Loyer" refondu
`components/client/SettingsPage.tsx` onglet `sp-loyer` :
- En-tête : **sélecteur de template** (comme l'onglet questions SP)
- Pour chaque template, liste de barèmes avec :
  - Drag-drop pour réordonner
  - Bouton **"+ Nouveau barème"**
- Chaque carte barème (dépliable) :
  - Nom
  - Sous-section **Conditions** : réutilise `SpConditionEditor` (groupes + ET/OU), conditions sur `reponse_question`, `sa`, `catalogue`
  - Sous-section **Taux par durée** : table existante (duree_mois, taux_loyer, mois_offerts, trimestres)
- Suppression complète du bloc "Suggestion de marge".

### 2.4 Helper évaluateur de barème
Nouveau `lib/sp/evaluateBareme.ts` :
```ts
export function findApplicableBareme(
  baremes: SpBareme[],
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue?: CatalogueProduit[],
): SpBareme | null
```
- Itère sur `baremes` triés par `ordre`, retourne le **premier** dont les groupes_conditions s'évaluent à `true` (réutilise `evaluateQuestionVisibility` / `evaluateGroup`).
- Un barème sans condition matche toujours (fallback).

### 2.5 Adaptation `calculerLoyer`
- Signature inchangée mais accepte un `SpBareme` (au lieu de `SpConfigLoyer` global) :
```ts
calculerLoyer(bareme: SpBareme, totalPonctuel: number, dureeMois: number, marge: number)
```
- Les call-sites (`generer-suggestions/route.ts`, `Step5EditSp`) résolvent d'abord le barème via `findApplicableBareme` puis appellent `calculerLoyer`.

---

## Lot 3 — Type d'affichage "marge" (question SP)

### 3.1 Type
`types/index.ts` : étendre `SpQuestionAffichage` avec `'marge'`.

### 3.2 Builder de question SP
`components/settings/SpQuestionBuilder.tsx` :
- Ajouter `{ value: 'marge', label: 'Marge (calcul loyer)' }` dans `AFFICHAGE_BY_SOURCE.aucune`.
- Tooltip : « Champ libre où l'utilisateur saisit sa marge en €. Le loyer mensuel/trimestriel est calculé en live selon le barème applicable du template. »

### 3.3 UI questionnaire
`components/sp/SpQuestionnaireUI.tsx` :
- Nouveau bloc de rendu pour `currentQuestion.affichage === 'marge'` :
  - Input numérique « Marge (€) »
  - Sous l'input, panneau live : **Loyer mensuel HT / Loyer trimestriel HT / Durée / Trimestres / Mois offerts** (recalculé à chaque frappe via `findApplicableBareme` + `calculerLoyer`)
  - Si aucun barème ne matche → message "Aucun barème applicable, configurez-en un dans Paramètres → Calculer Loyer"
  - Le bouton "Valider" appelle `recordAnswer(instanceId, margeStr, [{ question_id: 'loyer_mensuel_<id>', valeur: '…' }, { question_id: 'loyer_trimestriel_<id>', valeur: '…' }, …])`
- Pour fonctionner, `SpQuestionnaireUI` reçoit en props la `SpConfigLoyer` du template courant.

### 3.4 Récupération de la durée
- La durée du contrat doit être disponible dans les réponses (variable `sp_duree_mois`, déjà géré).
- Si pas encore renseignée → marge bloquée avec message « Répondez d'abord à la question "Durée du contrat" ».

### 3.5 Pipeline `generer-suggestions`
- Lire la marge depuis les réponses (question d'affichage `marge`)
- Utiliser cette marge dans `calculerLoyer()`
- Ne plus appeler `suggererMarge()` (supprimé).

---

## Lot 4 — Variables Word : synthèse et nouvelles variables

### 4.1 Tableau récapitulatif des variables

| Variable | Status | Action |
|---|---|---|
| `sp_economie_mensuelle`, `sp_economie_annuelle`, `sp_total_actuel`, `sp_total_propose`, `sp_ameliorations`, `sp_fournisseur_propose`, `sp_nb_lignes`, `sp_est_economie` | ✅ existant | Garder |
| `sp_adresse_facturation*`, `sp_adresse_livraison*`, `sp_livraison_identique` | ✅ existant | Garder |
| `sp_fas_total` | ✅ existant | Garder |
| `sp_lignes_mobiles`, `sp_lignes_fixes`, `sp_internet`, `sp_materiel` (tableaux) | ✅ existant | Garder |
| `sp_recap_total_operateur_apres_remise` | proposé | **Supprimer** (remplacé par `sp_total_bdc_operateur`) |
| `sp_recap_remise_mois_offert` | proposé | **Renommer** → `sp_remise_mois_offert` |
| `sp_recap_total_materiel_geste` | proposé | **Supprimer** (remplacé par `sp_total_bdc_materiel`) |
| `sp_recap_total_fas`, `sp_recap_total_installation`, `sp_recap_total_indemnites`, `sp_recap_total_complet` | proposé | **Garder** (renommés sans `_recap`) |
| `sp_bdc_operateur_table`, `sp_bdc_materiel_table`, `sp_proposition_table` | proposé | **Garder** (renommés en `sp_bdc_*`, `sp_situation_proposee_complet`) |
| `sp_geste_commercial_mention`, `sp_remboursement_mention` | proposé | **Supprimer** (phrases déjà rédigées dans les templates Word) |
| `sp_date_limite_souscription` | proposé | **Garder** (montant/date injectés dans les phrases existantes) |

### 4.2 Nouvelles variables — Tableaux dynamiques

**`sp_situation_proposee_complet`** (TOUT : lignes + matériel + cadeaux + options)
```
{{#sp_situation_proposee_complet}}
{{sp_categorie}}  {{sp_designation}}  {{sp_reference}}  {{sp_quantite}}  
{{sp_prix_unitaire_ht}}  {{sp_prix_total_ht}}  {{sp_frequence}}  
{{sp_fas}}  {{sp_commentaire}}
{{/sp_situation_proposee_complet}}
```

**`sp_materiel_detail`** (catégorie `equipement` uniquement, enrichi)
```
{{#sp_materiel_detail}}
{{sp_mat_fournisseur}}  {{sp_mat_nom}}  {{sp_mat_description}}  
{{sp_mat_quantite}}  {{sp_mat_prix_unitaire_ht}}  {{sp_mat_prix_total_ht}}  
{{sp_mat_fas}}  {{%sp_mat_image}}
{{/sp_materiel_detail}}
```
+ variable simple `sp_total_materiel_ht`.

**`sp_situation_proposee_forfaits`** (lignes mobiles + fixes + internet)
```
{{#sp_situation_proposee_forfaits}}
{{sp_sp_numero}}  {{sp_sp_quantite}}  {{sp_sp_type}}  {{sp_sp_nom}}  {{sp_sp_produit}}
{{sp_sp_fournisseur}}  {{sp_sp_prix_propose}}  {{sp_sp_analyse}}
{{/sp_situation_proposee_forfaits}}
```
+ variable simple `sp_total_forfaits_mensuel_ht`.

**`sp_bdc_operateur_table`** (forfaits fixe + mobile uniquement, filtré par `destinations.bdc_operateur=true`)
```
{{#sp_bdc_operateur_table}}
{{sp_op_numero}}  {{sp_op_forfait}}  {{sp_op_fournisseur}}  {{sp_op_prix_mensuel_ht}}
{{/sp_bdc_operateur_table}}
```
+ variable simple `sp_total_bdc_operateur_ht`.

**`sp_bdc_internet_table`** (forfaits internet uniquement)
```
{{#sp_bdc_internet_table}}
{{sp_int_designation}}  {{sp_int_fournisseur}}  {{sp_int_debit}}  {{sp_int_prix_mensuel_ht}}
{{/sp_bdc_internet_table}}
```
+ variable simple `sp_total_bdc_internet_ht`.

**`sp_bdc_materiel_table`** (matériel filtré par `destinations.bdc_materiel=true`)
```
{{#sp_bdc_materiel_table}}
{{sp_mat_nom}}  {{sp_mat_reference}}  {{sp_mat_quantite}}  
{{sp_mat_prix_unitaire_ht}}  {{sp_mat_prix_total_ht}}
{{/sp_bdc_materiel_table}}
```
+ variable simple `sp_total_bdc_materiel_ht`.

**`sp_cadeaux_table`** (catégorie `cadeau` uniquement)
```
{{#sp_cadeaux_table}}
{{sp_cadeau_nom}}  {{sp_cadeau_description}}  {{sp_cadeau_reference}}  
{{sp_cadeau_quantite}}  {{sp_cadeau_prix_unitaire_ht}}  {{sp_cadeau_prix_total_ht}}
{{/sp_cadeaux_table}}
```
+ variable simple `sp_total_cadeaux_ht`.

### 4.3 Nouvelles variables simples

| Variable | Calcul |
|---|---|
| `sp_date_limite_souscription` | Dernier jour du mois courant, format français (ex. « 31 mai 2026 »). Calcul `endOfMonth(new Date())` avec `date-fns-tz` Europe/Paris. |
| `sp_duree_trimestres` | Conversion `ceil(duree_mois / 3)` à partir de la réponse SP `sp_duree_mois`. |
| `sp_remise_mois_offert` | Calcul existant `calculerRemiseMoisOffert()`. |
| `sp_total_fas` | Somme des FAS de tous les produits sélectionnés. |
| `sp_total_installation` | Somme des produits catégorie `installation` du catalogue sélectionnés. |
| `sp_total_indemnites` | Champ libre saisi via question SP `affichage=nombre`, **avec suggestion auto** = `loyer_actuel_sa × mois_restants_sa` (calculée depuis `donnees_extraites.contrat_actuel`). |
| `sp_total_complet` | Somme : total opérateur après remise + remise mois offert + IDR + matériel + cadeau + FAS + installation. |

### 4.4 Implémentation
- `app/api/templates/[id]/sp-variables/route.ts` : étendre `SP_STANDARD_VARIABLES` avec les nouvelles clés (les tableaux dynamiques sont listés séparément avec leurs sous-champs).
- `app/api/propositions/generer-suggestions/route.ts` → `buildSpCompletes()` :
  - Construire les 6 tableaux filtrés selon `destinations` et `categorie`.
  - Calculer les totaux dérivés.
- **Images dans Word** : intégrer `docxtemplater-image-module-free` dans `lib/generators/word.ts` :
  - Module configuré avec `getImage(tagValue)` qui télécharge l'URL en buffer et `getSize()` (taille standard ex. 80×80 px).
  - La variable `{{%sp_mat_image_url}}` (préfixe `%` = image) sera remplacée par l'image embarquée dans le tableau matériel.
- **Suggestion auto pour indemnités** : helper `lib/sp/suggererIndemnites.ts` qui lit `donnees_extraites.contrat_actuel.loyer_mensuel` et `mois_restants` (ou date_fin) et retourne le montant suggéré. Affiché dans l'UI de la question SP `nombre` comme placeholder/hint cliquable.
- Mise à jour de la doc visible dans le builder de template (panneau "Variables SP disponibles") avec descriptions et exemples.

---

## Lot 5 — Export comparatif SA / SP (nouveau)

### 5.1 Stratégie
- Composants 100 % indépendants du système de templates Word.
- 2 boutons : "Exporter Excel" / "Exporter Word".
- Génère un fichier autonome contenant 2 tableaux (Situation Actuelle / Situation Proposée) avec max de détails.

### 5.2 Endpoint
`app/api/propositions/[id]/export-comparatif-sa-sp/route.ts` :
- Body : `{ format: 'excel' | 'word' }`
- Récupère `proposition.donnees_extraites` (SA) + `proposition.suggestions_editees ?? suggestions_generees` (SP).
- Appelle le générateur correspondant, retourne le buffer.

### 5.3 Générateur Excel
`lib/excel/comparatif-sa-sp-generator.ts` (lib `exceljs`) :
- Feuille 1 « Situation Actuelle » : colonnes Catégorie / Désignation / Fournisseur / Numéro / Qté / Prix mensuel HT / Prix annuel HT / Engagement.
- Feuille 2 « Situation Proposée » : mêmes colonnes + section ponctuelle (Matériel, FAS, Installation, Cadeau, IDR).
- Feuille 3 « Synthèse » : totaux SA, SP, économie mensuelle/annuelle, loyer mensuel/trimestriel, remise mois offert.

### 5.4 Générateur Word
`lib/word/comparatif-sa-sp-generator.ts` :
- HTML→`.doc` (même approche que `comparatif-generator.ts` existant).
- 3 sections claires : Situation Actuelle (tableau), Situation Proposée (tableau), Synthèse (cartes totaux + loyer).

### 5.5 UI bouton fin de wizard
`components/propositions/Step5Generate.tsx` :
- Ajouter après la génération réussie, en plus du téléchargement du fichier template, 2 boutons "Comparatif Excel" / "Comparatif Word".

### 5.6 UI bouton fiche proposition
`app/(client)/propositions/[id]/page.tsx` :
- Ajouter dans la sidebar d'actions un bloc "Comparatif SA/SP" avec les 2 boutons.

---

## Ordre d'exécution recommandé

1. **Lot 1** — Catalogue (fondation, sans casser l'existant).
2. **Lot 2** — Config loyer par template (migration prudente, fallback DEFAULT_CONFIG_LOYER).
3. **Lot 3** — Affichage "marge" (dépend de Lot 2 pour les barèmes).
4. **Lot 4** — Variables Word (dépend de Lot 1 pour destinations & cadeau).
5. **Lot 5** — Export SA/SP (indépendant, peut être fait en parallèle de 4).

---

## Risques & points d'attention

- **Migration des barèmes loyer** : conserver l'ancien `sp_config_loyer` lu en fallback pendant 1-2 semaines pour ne pas casser les templates non migrés.
- **Tranches de prix** : valider visuellement les chevauchements dans le formulaire (sinon comportement imprévisible).
- **Type d'affichage "marge"** : exige que la durée SP soit déjà renseignée → forcer cette question en amont ou bloquer le rendu avec un message clair.
- **Catégories `cadeau` et `installation`** : champ texte côté DB, donc l'ajout des slugs est immédiat. Vérifier les filtres existants (Settings discount rules, builder SP) pour qu'ils incluent les nouvelles catégories.
- **Images Word** : `docxtemplater-image-module-free` requiert un fetch HTTP côté serveur pour chaque image. Prévoir un cache mémoire pour ne pas retélécharger 10× la même URL. Fallback gracieux si l'image est introuvable (placeholder transparent 1×1 px).
- **Suggestion indemnités** : la donnée `contrat_actuel.loyer_mensuel` n'est pas toujours extraite. Si absente, l'input reste libre sans suggestion (pas d'erreur).
- **Destinations par défaut** : `{proposition:true, bdc_operateur:true, bdc_materiel:true}` pour tous les produits existants → aucun impact.
- **Variables tableaux** : docxtemplater utilise `{{#nom}}…{{/nom}}` ; bien tester que la nouvelle structure de tableau unifié est sérialisable.
- **Tests** : `resolvePrixPourQuantite`, `findApplicableBareme`, `calculerLoyer` avec barème conditionnel, génération mentions auto, exports Excel/Word.

---

## Estimation effort

| Lot | Effort |
|---|---|
| 1 — Catalogue tranches + destinations + cadeau | 1.5 j |
| 2 — Config loyer par template + barèmes conditionnels | 1.5 j |
| 3 — Affichage "marge" | 1 j |
| 4 — Variables Word (6 tableaux + 9 simples + mentions auto) | 1.5 j |
| 5 — Export comparatif SA/SP (Excel + Word + 2 UI) | 1.5 j |
| **Total** | **~7 j** |
