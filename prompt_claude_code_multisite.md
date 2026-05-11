# Prompt Claude Code — Multisite + Synchronisation Simulation/Réel

## Contexte

PropoBoost est une application Next.js 14+ App Router / TypeScript / Supabase / TailwindCSS / shadcn/ui.

Le wizard de création de proposition (`PropositionWizard`) suit ces étapes :
Step1 (template) → Step2 (upload docs) → Step3 (extraction SA) → Step4 (édition SA) → Step5 (questions SP via `Step5SpQuestions`) → Step6 (génération via `Step5Generate`).

Le questionnaire SP (`Step5SpQuestions`) est un chat bot séquentiel qui pose les questions configurées dans les paramètres. Il existe aussi un simulateur (`SpWorkflowSimulatorModal`) dans les paramètres qui est censé reproduire ce questionnaire, mais il a son propre design différent.

La SA extraite est stockée dans `propositionData.donnees_extraites` (type `Record<string, unknown>`).
Les propositions sont stockées dans la table `propositions` (champs : `id`, `organization_id`, `template_id`, `extracted_data`, `statut`, `nom_client`, etc.).
Les crédits sont gérés via `debit_credits(org_id, amount)` (fonction SQL) et `tarif_par_proposition` dans la table `organizations`.
Les fichiers sont générés par `generatePropositionFile` dans `lib/generators/index.ts`.

---

## Travail à réaliser — 3 parties

---

## PARTIE 1 — Extraction d'un composant partagé `SpQuestionnaireUI`

### Objectif

Le questionnaire SP réel (`Step5SpQuestions`) et le simulateur (`SpWorkflowSimulatorModal`) doivent partager **exactement le même composant UI**. Si on modifie le design de l'un, l'autre est automatiquement mis à jour. La seule différence est la source des données SA.

### Ce qu'il faut faire

**1. Créer `components/sp/SpQuestionnaireUI.tsx`**

Extraire toute la logique UI et chat de `Step5SpQuestions.tsx` dans ce composant partagé. Props :

```typescript
interface SpQuestionnaireUIProps {
  // Questions SP à poser
  questions: SpQuestion[];
  // Données SA pour pré-remplissage (source différente selon contexte)
  donneesExtraites: Record<string, unknown>;
  // Catalogue produits et fournisseurs
  catalogue: CatalogueProduit[];
  fournisseurs: string[];
  // Callback quand toutes les questions sont répondues
  onComplete: (reponses: SpQuestionReponse[]) => void;
  // Réponses initiales (pour reprise ou navigation retour)
  initialReponses?: SpQuestionReponse[];
  // Mode simulation : pas de bouton "Générer SP", juste affichage des réponses collectées
  isSimulation?: boolean;
  // Label optionnel affiché en haut (ex: "Site 1 sur 3 — Paris")
  siteLabel?: string;
}
```

Ce composant contient :

- Toute la logique de chat (messages, bulles, auto-avance, isTyping)
- Toute la logique de conditions (groupes_conditions, consequences, hiddenByConsequence, etc.)
- Toute la logique de boucles (expandedQuestions, groupe_boucle_id)
- Tous les rendus de types de questions (boutons, oui/non, texte, nombre, liste, adresse, etc.)
- Le bouton "Générer la SP" (masqué si `isSimulation === true`)

**2. Refactoriser `Step5SpQuestions.tsx`**

Doit devenir un wrapper léger qui :

- Charge les questions, catalogue, fournisseurs depuis l'API
- Appelle `SpQuestionnaireUI` avec les données réelles (`propositionData.donnees_extraites`)
- Reçoit le callback `onComplete` → appelle `/api/propositions/generer-suggestions` → `onNext()`

```typescript
// Step5SpQuestions.tsx — après refactorisation
export function Step5SpQuestions({ propositionData, updatePropositionData, onNext, onPrev }) {
  // charge questions, catalogue, fournisseurs...
  return (
    <SpQuestionnaireUI
      questions={questions}
      donneesExtraites={propositionData.donnees_extraites ?? {}}
      catalogue={catalogue}
      fournisseurs={fournisseurs}
      initialReponses={propositionData.sp_reponses}
      onComplete={async (reponses) => {
        // appel API generer-suggestions existant
        // puis onNext()
      }}
    />
  );
}
```

**3. Refactoriser `SpWorkflowSimulatorModal.tsx`**

Doit :

- Récupérer la dernière proposition générée de l'organisation via `GET /api/propositions/latest-extracted-data?template_id={templateId}`
- Charger catalogue et fournisseurs
- Appeler `SpQuestionnaireUI` avec `isSimulation={true}` et les données SA de la dernière proposition
- Afficher un résumé des réponses collectées à la fin (à la place du bouton "Générer")
- Si aucune proposition existante → afficher un message "Aucune proposition générée pour ce template. Créez d'abord une proposition pour utiliser le simulateur avec des données réelles."

**4. Créer `GET /api/propositions/latest-extracted-data`**

Route qui retourne `extracted_data` de la dernière proposition (par `updated_at DESC`) pour l'organisation courante et le `template_id` passé en query param.

```typescript
// Retour
{ extracted_data: Record<string, unknown> | null, proposition_id: string | null }
```

---

## PARTIE 2 — Détection multisite post-extraction et flow séquentiel par site

### Objectif

Quand l'IA extrait une SA avec `sites.length > 1`, afficher une modale de choix après le Step3. Si l'utilisateur choisit "par site", le wizard enchaîne les questions SP pour chaque site séquentiellement dans la même session, sans interruption.

### Ce qu'il faut faire

**1. Migration Supabase — `tarif_clone_site` dans `organizations`**

Créer le fichier `supabase/migrations/[timestamp]_add_tarif_clone_site.sql` :

```sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS tarif_clone_site DECIMAL(10,2) DEFAULT 1.00;

COMMENT ON COLUMN organizations.tarif_clone_site IS
'Coût en crédits pour générer une proposition supplémentaire à partir d une SA multisite déjà extraite (clone par site).';
```

**2. Ajouter `tarif_clone_site` dans l'interface admin des organisations**

Dans la page/composant admin qui affiche les champs d'une organisation (là où `tarif_par_proposition` est déjà affiché), ajouter juste en dessous un champ :

```
Tarif clone site (€)
[input number, step=0.01, min=0]
Coût débité pour chaque proposition site supplémentaire (multisite, sans re-extraction)
```

Brancher sur le PATCH existant de l'organisation.

**3. Ajouter `is_multisite`, `parent_proposition_id`, `site_nom` dans `propositions`**

```sql
-- supabase/migrations/[timestamp]_add_multisite_fields.sql
ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS is_multisite BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_proposition_id UUID REFERENCES propositions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS site_nom VARCHAR(255);

COMMENT ON COLUMN propositions.parent_proposition_id IS
'Pour les propositions clonées depuis un multisite, référence la proposition parente dont les données SA ont été extraites.';
COMMENT ON COLUMN propositions.site_nom IS
'Nom du site pour les propositions multisite (ex: Paris, Lyon).';
```

**4. Créer `POST /api/propositions/:id/clone-site`**

Route qui :

1. Récupère la proposition parente (vérifie qu'elle appartient à l'organisation)
2. Récupère `site_nom` depuis le body
3. Filtre `extracted_data` pour ne garder que les données du site concerné :
   - `sites` → garder seulement le site dont `nom === site_nom`
   - `lignes`, `abonnements`, `locations`, `engagements` → garder seulement ceux dont `site === site_nom`
   - `client`, `fournisseur`, `totaux`, `indemnites` → conserver intégralement
   - Recalculer `totaux` (sum des éléments filtrés)
4. Débite `tarif_clone_site` crédits (pas `tarif_par_proposition`)
5. Crée une nouvelle proposition avec :
   - `extracted_data` filtré
   - `parent_proposition_id` = id de la proposition parente
   - `is_multisite` = true
   - `site_nom` = site_nom
   - `template_id`, `organization_id`, `nom_client` copiés du parent
   - `statut` = 'ready' (pas besoin de re-extraction)
6. Retourne `{ proposition_id, extracted_data_filtered, credits_debited }`

Body :

```typescript
{
  site_nom: string;
}
```

**5. Ajouter la modale `MultisiteChoiceModal.tsx` dans `components/propositions/`**

Props :

```typescript
interface MultisiteChoiceModalProps {
  sites: Array<{
    nom: string;
    adresse: string;
    ville: string;
    nb_lignes: number;
  }>;
  onChoiceParSite: () => void;
  onChoiceToutInclure: () => void;
  onChoicePasMultisite: () => void;
}
```

La modale affiche :

- Titre : "Plusieurs sites détectés"
- Sous-titre : "L'IA a identifié {n} adresses distinctes dans les documents. Vérifiez et choisissez comment procéder."
- Liste des sites détectés avec : nom, ville, nombre de lignes/abonnements
- 3 boutons d'action :
  1. **"Générer une proposition par site"** (recommandé, badge vert) — `tarif_clone_site` × (n-1) crédits supplémentaires affichés
  2. **"Tout inclure dans une seule proposition"** — coût normal
  3. **"Ce n'est pas un multisite"** (grisé, discret) — "L'IA a confondu une adresse fournisseur ou annexe avec un site client. Continuer normalement." — 0 crédit supplémentaire

**6. Modifier `PropositionWizard.tsx` pour gérer le flow multisite**

Ajouter dans `PropositionData` :

```typescript
interface PropositionData {
  // ... existant ...
  // Multisite
  multisite_sites?: Array<{
    nom: string;
    adresse: string;
    ville: string;
    nb_lignes: number;
  }>;
  multisite_mode?: "par_site" | "tout_inclure" | null;
  multisite_current_site_index?: number;
  multisite_propositions?: Array<{
    site_nom: string;
    proposition_id: string;
    reponses?: SpQuestionReponse[];
    generated?: boolean;
  }>;
}
```

Logique à ajouter dans `PropositionWizard` :

Au Step3 (`onNext` depuis `Step3ExtractData`) :

1. Lire `propositionData.donnees_extraites.situation_actuelle.sites`
2. Si `sites.length > 1` → extraire les stats par site (nb_lignes) → ouvrir `MultisiteChoiceModal`
3. Selon le choix :
   - **"Pas un multisite"** → `nextStep()` normalement
   - **"Tout inclure"** → `nextStep()` normalement
   - **"Par site"** → initialiser `multisite_mode: 'par_site'`, `multisite_current_site_index: 0`, `multisite_propositions: sites.map(s => ({ site_nom: s.nom, proposition_id: null, generated: false }))` → `nextStep()`

Ajouter dans le rendu de `Step5SpQuestions` quand `multisite_mode === 'par_site'` :

```tsx
// En haut du Step5 : indicateur de progression des sites
// "● Paris  ○ Lyon  ○ Bordeaux — Site 1 sur 3"
// Sites complétés = cliquables pour révision
// Sites pas encore faits = grisés
```

Modifier le `onComplete` du Step5 en mode multisite :

1. Sauvegarder les réponses pour le site courant dans `multisite_propositions[currentIndex].reponses`
2. Appeler `POST /api/propositions/:parentId/clone-site` avec `site_nom`
3. Appeler `/api/propositions/generer-suggestions` avec le `proposition_id` du clone et les `extracted_data` filtrés
4. Marquer `multisite_propositions[currentIndex].generated = true`
5. Si `currentIndex < sites.length - 1` → incrémenter `multisite_current_site_index` → recommencer Step5 pour le site suivant (sans changer de step dans le wizard, juste re-render avec le nouveau site)
6. Si dernier site → `onNext()` vers Step6

Dans `Step5SpQuestions` en mode multisite, passer `siteLabel` à `SpQuestionnaireUI` :

```typescript
siteLabel={`Site ${currentIndex + 1} sur ${totalSites} — ${currentSiteNom}`}
```

**Navigation entre sites (révision)** :

- Cliquer sur un site déjà complété (`generated === true`) → afficher ses réponses dans `SpQuestionnaireUI` en mode lecture avec un bouton "Modifier"
- Cliquer sur "Modifier" → afficher un dialog d'avertissement :

```
⚠️ Modifier ce site consomme des crédits
Cette action va re-générer la proposition pour "{site_nom}".
Coût : {tarif_clone_site} crédit(s)
[Annuler]  [Modifier quand même]
```

Si confirmé → recharger le questionnaire SP pour ce site avec ses réponses initiales → à la re-soumission, rappeler `/api/propositions/:cloneId/regenerate` (POST simple qui re-appelle generer-suggestions avec les nouvelles réponses et débite `tarif_clone_site`).

**7. Créer `POST /api/propositions/:id/regenerate`**

Route qui :

1. Vérifie que la proposition appartient à l'organisation
2. Vérifie que la proposition a `parent_proposition_id` (c'est bien un clone)
3. Débite `tarif_clone_site` crédits
4. Re-appelle la logique de génération SP avec les nouvelles `sp_reponses` passées dans le body
5. Met à jour `propositions.filled_data` et `propositions.generated_file_name`
6. Retourne `{ success: true, credits_debited }`

Body :

```typescript
{ sp_reponses: SpQuestionReponse[] }
```

---

## PARTIE 3 — Ajustements Step6 pour le multisite

### Objectif

L'écran de génération finale (Step6 / `Step5Generate`) doit s'adapter en mode multisite pour afficher un récapitulatif de toutes les propositions générées.

### Ce qu'il faut faire

**1. Modifier `Step5Generate.tsx`**

Si `propositionData.multisite_mode === 'par_site'` :

- Afficher un récapitulatif "Propositions générées" avec la liste des sites :

```
✅ Proposition Paris — [Télécharger]
✅ Proposition Lyon — [Télécharger]
✅ Proposition Bordeaux — [Télécharger]
```

- Bouton "Terminer" → retour dashboard
- Pas de génération supplémentaire à faire (tout a été généré en Step5)

Si mode normal → comportement existant inchangé.

---

## Fichiers à créer ou modifier (dans l'ordre de dépendance)

1. `supabase/migrations/[ts]_add_tarif_clone_site.sql` — nouveau
2. `supabase/migrations/[ts]_add_multisite_fields.sql` — nouveau
3. `components/sp/SpQuestionnaireUI.tsx` — nouveau (extrait de Step5SpQuestions)
4. `components/propositions/Step5SpQuestions.tsx` — modifier (wrapper léger)
5. `components/settings/SpWorkflowSimulatorModal.tsx` — modifier (utilise SpQuestionnaireUI)
6. `app/api/propositions/latest-extracted-data/route.ts` — nouveau
7. `app/api/propositions/[id]/clone-site/route.ts` — nouveau
8. `app/api/propositions/[id]/regenerate/route.ts` — nouveau
9. `components/propositions/MultisiteChoiceModal.tsx` — nouveau
10. `components/propositions/PropositionWizard.tsx` — modifier (logique multisite)
11. `components/propositions/Step5Generate.tsx` — modifier (récap multisite)
12. `[page admin organisations]` — modifier (champ tarif_clone_site)

---

## Règles à respecter

- TypeScript strict — pas de `any`
- Tous les appels API vérifient l'authentification Supabase (`createServerClient`)
- Les crédits sont débités via la fonction SQL `debit_credits(org_id, amount)` existante
- Vérifier les crédits disponibles AVANT de débiter — si insuffisants, retourner une erreur 402 avec message clair
- Ne pas modifier le design ou la logique existante de `Step3ExtractData`, `Step4EditData`, `Step5Generate` sauf les ajustements multisite décrits
- Utiliser les composants shadcn/ui existants (Button, Dialog, Badge)
- TailwindCSS uniquement pour le style
- Conserver le comportement exact du questionnaire SP (chat séquentiel, auto-avance, bulles) dans `SpQuestionnaireUI`
