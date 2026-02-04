MISSION : Implémentation du système d'édition des suggestions IA avec garde-fou PDF
📋 CONTEXTE DU PROJET
Tu travailles sur PropoBoost, une plateforme SaaS Next.js 14 (TypeScript) qui génère des propositions commerciales télécom avec l'aide de Claude AI.
Stack technique actuelle :

Next.js 14 (App Router) + TypeScript
Supabase (PostgreSQL + Auth + Storage)
TailwindCSS + shadcn/ui
Anthropic Claude API
pdf-lib pour génération PDF

Structure existante :
/app
  /api
    /propositions
      /[id]
        /export-comparatif/route.ts
      /generer-suggestions/route.ts
/components
  /propositions
    /PropositionDetailClient.tsx
    /SuggestionsView.tsx
    /Step4EditData.tsx
/lib
  /pdf/comparatif-generator.ts
/types/index.ts
/hooks
🎯 OBJECTIF
Implémenter un système complet permettant aux utilisateurs de :

Modifier les produits suggérés par l'IA avec recalcul automatique des prix/économies
Éditer ou régénérer les justifications (texte "NOTRE ANALYSE") manuellement ou via IA
Éditer ou régénérer la synthèse finale manuellement ou via IA
Garde-fou avant téléchargement PDF : alerter si des modifications de produits n'ont pas été suivies d'une mise à jour des textes

📊 SCHÉMA DE BASE DE DONNÉES À MODIFIER
Migration Supabase requise :
sql-- Ajouter le champ suggestions_editees à la table propositions
ALTER TABLE propositions 
ADD COLUMN IF NOT EXISTS suggestions_editees JSONB DEFAULT NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_propositions_suggestions_editees 
ON propositions USING GIN (suggestions_editees);
Logique :

suggestions_generees (JSONB) = Version originale de l'IA (jamais modifiée)
suggestions_editees (JSONB) = Version modifiée par l'utilisateur (si existe)

📁 FICHIERS À CRÉER
1. Hook de tracking des modifications
Fichier : hooks/useSuggestionsTracker.ts
Responsabilité : Détecter automatiquement les changements de produits et si les justifications/synthèse ont été mises à jour
Fonctionnalités :

Comparer les suggestions actuelles vs originales
Détecter les changements de produit_propose_id ou produit_propose_nom
Vérifier si les justification ont été modifiées après changement de produit
Vérifier si la synthese.ameliorations a été modifiée
Fournir un indicateur needsWarning() pour savoir si un avertissement est nécessaire

2. Composant modal d'avertissement
Fichier : components/propositions/DownloadWarningModal.tsx
Responsabilité : Afficher un modal élégant avertissant l'utilisateur avant le téléchargement PDF
Props requises :
typescriptinterface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changedProductsCount: number;
  hasAnalysisUpdates: boolean;
  hasSynthesisUpdate: boolean;
}
Design requis :

Icône d'alerte ambrée
Liste des problèmes détectés
Encadré bleu avec recommandations (régénérer IA ou éditer manuellement)
2 boutons : "Retour pour modifier" (gris) et "Télécharger quand même" (ambré)

3. Composant de produit proposé éditable
Fichier : components/propositions/EditableProposedProduct.tsx
Responsabilité : Permettre de changer le produit proposé avec un sélecteur
Fonctionnalités :

Icône Edit2 en haut à droite pour basculer en mode édition
Select dropdown avec tous les produits du catalogue
Recalcul automatique de prix_propose et economie_mensuelle lors du changement
Mise à jour du produit_propose_fournisseur

4. Composant d'analyse éditable
Fichier : components/propositions/EditableAnalysis.tsx
Responsabilité : Permettre l'édition manuelle ou la régénération IA de la justification
Fonctionnalités :

2 icônes en haut à droite :

Wand2 (baguette magique) : Régénérer avec l'IA
Edit2 (crayon) : Éditer manuellement


Textarea pour modification manuelle
Appel API /api/propositions/regenerer-analyse pour régénération IA
Animation de chargement pendant régénération

5. Composant de synthèse éditable
Fichier : components/propositions/EditableSynthesis.tsx
Responsabilité : Permettre l'édition manuelle ou la régénération IA de la synthèse
Fonctionnalités :

Affichage automatique des chiffres recalculés (cout_total_actuel, cout_total_propose, economie_mensuelle, economie_annuelle)
2 icônes en haut à droite :

Wand2 : Régénérer la liste des améliorations avec l'IA
Edit2 : Éditer manuellement la liste


Textarea multi-lignes (une amélioration par ligne)
Appel API /api/propositions/regenerer-synthese pour régénération IA

6. Composant principal avec intégration complète
Fichier : components/propositions/EditableSuggestionsView.tsx
Responsabilité : Orchestrer tous les composants et gérer la sauvegarde globale
Fonctionnalités :

Utiliser le hook useSuggestionsTracker pour le tracking
Afficher un badge d'avertissement si modifications non synchronisées
Recalculer automatiquement la synthèse (chiffres) quand un produit change
Bouton "Sauvegarder les modifications" → Appelle /api/propositions/[id]/update-suggestions
Bouton "Télécharger le PDF" → Vérifie avec needsWarning() et affiche le modal si nécessaire
Si OK, procède au téléchargement via /api/propositions/[id]/export-comparatif

🔌 API ROUTES À CRÉER
1. Route de mise à jour des suggestions
Fichier : app/api/propositions/[id]/update-suggestions/route.ts
Méthode : PATCH
Body :
typescript{
  suggestions: Suggestion[],
  synthese: SuggestionsSynthese
}
Action :

Valider les données reçues
Sauvegarder dans propositions.suggestions_editees (JSONB)
Retourner { success: true, suggestions_editees }

2. Route de régénération d'analyse
Fichier : app/api/propositions/regenerer-analyse/route.ts
Méthode : POST
Body :
typescript{
  ligne_actuelle: Record<string, unknown>,
  produit_propose_nom: string,
  produit_propose_fournisseur: string,
  prix_actuel: number,
  prix_propose: number,
  economie_mensuelle: number
}
```

**Action :**
- Construire un prompt ciblé pour Claude expliquant pourquoi ce produit est recommandé
- Appeler Claude API (modèle: `claude-3-7-sonnet-20250219`)
- Retourner `{ justification: string }`

**Prompt template :**
```
Tu es un expert en télécommunications.

SITUATION ACTUELLE DU CLIENT:
{ligne_actuelle en JSON}

PRODUIT PROPOSÉ:
- Nom: {produit_propose_nom}
- Fournisseur: {produit_propose_fournisseur}
- Prix actuel: {prix_actuel}€/mois
- Prix proposé: {prix_propose}€/mois
- Économie mensuelle: {economie_mensuelle}€/mois

INSTRUCTIONS:
Rédige une analyse concise (2-4 phrases) expliquant pourquoi ce produit est recommandé.
Mets en avant:
- Les avantages techniques
- L'aspect économique
- L'adéquation avec les besoins du client

Réponds UNIQUEMENT avec le texte de l'analyse, sans titre ni introduction.
3. Route de régénération de synthèse
Fichier : app/api/propositions/regenerer-synthese/route.ts
Méthode : POST
Body :
typescript{
  suggestions: Suggestion[],
  situation_actuelle?: Record<string, unknown>
}
```

**Action :**
- Construire un prompt demandant une liste de 3-5 points clés
- Appeler Claude API
- Parser le JSON retourné
- Retourner `{ ameliorations: string[] }`

**Prompt template :**
```
Tu es un expert en télécommunications.

SITUATION ACTUELLE DU CLIENT:
{situation_actuelle en JSON}

RECOMMANDATIONS PROPOSÉES:
{liste des suggestions avec détails}

INSTRUCTIONS:
Génère une liste de 3-5 points clés résumant les principaux avantages de cette proposition globale.

Réponds UNIQUEMENT avec un JSON:
{
  "ameliorations": [
    "Point clé 1",
    "Point clé 2",
    "Point clé 3"
  ]
}
🔧 MODIFICATIONS DE FICHIERS EXISTANTS
1. Modifier l'export PDF pour utiliser suggestions_editees
Fichier : app/api/propositions/[id]/export-comparatif/route.ts
Modification :
typescript// AVANT (ligne ~40)
const suggestionsToUse = proposition.suggestions_generees;

// APRÈS
const suggestionsToUse = proposition.suggestions_editees || proposition.suggestions_generees;
Explication : Prioriser les suggestions éditées si elles existent, sinon utiliser les originales
2. Intégrer le nouveau composant éditable
Fichier : components/propositions/Step4EditData.tsx OU components/propositions/PropositionDetailClient.tsx
Modification :
Remplacer l'utilisation de <SuggestionsView> par <EditableSuggestionsView> avec les props appropriées incluant le catalogue de produits
📦 TYPES TYPESCRIPT
Ajouter dans types/index.ts :
typescriptexport interface ModificationState {
  hasProductChanges: boolean;
  hasAnalysisUpdates: boolean;
  hasSynthesisUpdate: boolean;
  changedProductsCount: number;
}
🎨 DESIGN & UX
Principes :

Utiliser TailwindCSS pour tous les styles
Icônes via lucide-react
Couleurs :

Bleu pour produit proposé
Orange/Ambré pour analyse
Gris/Slate pour synthèse
Ambré pour les avertissements
Émeraude pour économie, Orange pour surcoût


Animations : animate-spin pour loaders
Transitions douces : transition-colors

Accessibilité :

Boutons avec title pour tooltips
disabled states visuellement clairs
Messages d'erreur explicites

✅ CRITÈRES DE SUCCÈS

✅ Migration Supabase exécutée sans erreur
✅ Tous les fichiers créés compilent sans erreur TypeScript
✅ Le hook useSuggestionsTracker détecte correctement les modifications
✅ Le changement de produit recalcule automatiquement prix et économie
✅ La régénération IA des analyses fonctionne
✅ La régénération IA de la synthèse fonctionne
✅ L'édition manuelle fonctionne pour analyses et synthèse
✅ Le modal d'avertissement s'affiche uniquement quand nécessaire
✅ La sauvegarde persiste les modifications dans suggestions_editees
✅ Le PDF généré utilise les suggestions éditées
✅ L'UX est fluide avec animations et feedbacks appropriés

🚨 POINTS D'ATTENTION

Gestion des erreurs API : Toujours wrapper les appels fetch dans try/catch
État de chargement : Afficher des spinners pendant les opérations asynchrones
Validation des données : Vérifier que les suggestions et synthèse sont valides avant sauvegarde
Recalcul automatique : La synthèse (chiffres) doit se recalculer dès qu'un produit change
Comparaison intelligente : Le tracker doit comparer les données originales vs actuelles, pas les états React successifs

📝 ORDRE D'IMPLÉMENTATION RECOMMANDÉ

Migration Supabase
Types TypeScript
Hook useSuggestionsTracker
API Routes (update-suggestions, regenerer-analyse, regenerer-synthese)
Composants atomiques (EditableProposedProduct, EditableAnalysis, EditableSynthesis)
Modal DownloadWarningModal
Composant orchestrateur EditableSuggestionsView
Modifications des fichiers existants (export-comparatif, intégration)
Tests manuels de bout en bout

🧪 TESTS À EFFECTUER

Changer un produit → vérifier recalcul prix/économie
Changer plusieurs produits → vérifier compteur dans l'avertissement
Régénérer une analyse → vérifier appel API et mise à jour texte
Éditer manuellement une analyse → vérifier sauvegarde
Régénérer la synthèse → vérifier appel API et mise à jour
Éditer manuellement la synthèse → vérifier sauvegarde
Changer un produit SANS mettre à jour textes → vérifier avertissement
Cliquer "Télécharger quand même" → vérifier PDF généré
Sauvegarder puis recharger page → vérifier persistance
Générer PDF après édition → vérifier contenu correct


🎯 COMMENCE PAR :

Exécuter la migration Supabase
Créer le hook useSuggestionsTracker.ts
Créer les 3 API routes
Créer les composants dans l'ordre : EditableProposedProduct → EditableAnalysis → EditableSynthesis → DownloadWarningModal → EditableSuggestionsView
Modifier export-comparatif/route.ts pour utiliser suggestions_editees

Bonne chance ! N'hésite pas à me demander des clarifications si besoin. 🚀