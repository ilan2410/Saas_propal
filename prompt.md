## CONTEXTE
Je travaille sur PropoBoost (Next.js 14 + TypeScript + Supabase + TailwindCSS).
La page `/settings` existe déjà avec 6 onglets. Je veux refondre uniquement la SECTION 5 "Gestion des données" (onglet `donnees`) pour la rendre beaucoup plus utile et informative.

## CE QUI EXISTE
- Le composant `SettingsPage.tsx` (ou équivalent) contient déjà l'onglet `donnees` avec un export JSON et un bouton supprimer. Je veux REMPLACER tout le contenu de cet onglet.
- Table `propositions`: colonnes id, template_id, organization_id, nom_client, extracted_data, filled_data, duplicated_template_url, generated_file_name, statut, created_at, exported_at, source_documents (JSONB), tokens_used (JSONB), cout_ia
- Table `proposition_templates`: colonnes id, organization_id, nom, file_url, file_name, file_type, statut, created_at
- Table `stripe_transactions`: colonnes id, organization_id, montant, credits_ajoutes, statut, created_at
- Supabase Storage: bucket 'propositions' pour les fichiers générés, bucket 'templates' pour les templates master, bucket 'documents' pour les documents source
- Limite de 15 propositions max, les plus anciennes sont supprimées automatiquement
- `lib/utils/formatting.ts` exporte `formatCurrency` et `formatDate`

## NOUVELLES DONNÉES NÉCESSAIRES CÔTÉ SERVER COMPONENT
Le server component `app/(client)/settings/page.tsx` doit récupérer et passer en props:
- `propositions`: toutes les propositions du client (SELECT id, nom_client, template_id, statut, created_at, exported_at, duplicated_template_url, generated_file_name, source_documents)
- `templates`: tous les templates (SELECT id, nom, file_type, statut)
- `propositionsCount`: nombre total de propositions
- `storageUsage`: calculé en sommant les tailles (optionnel, on peut l'estimer ou l'afficher comme "non disponible")
- `oldestProposition`: la plus ancienne proposition (date)

Si ces données ne sont pas encore passées en props, MODIFIE le server component pour les ajouter.

## NOUVEAU DESIGN DE LA SECTION 5

### Partie 1 — Tableau de bord de mes données (en haut)
4 cartes de stats en grille (grid-cols-2 sur mobile, grid-cols-4 sur desktop):

1. **Propositions** — Barre de progression visuelle
   - Affiche "X / 15" en gros
   - Barre de progression en dessous (bg-gray-200 avec fill)
   - Couleur: bleu si < 10, orange si 10-13, rouge si 14-15
   - Sous-texte: "propositions utilisées"

2. **Templates actifs**
   - Nombre en gros
   - Icône FileText
   - Sous-texte: "templates configurés"

3. **Plus ancienne proposition**
   - Date formatée en gros (ex: "12 jan. 2026")
   - Sous-texte: "sera supprimée en premier"
   - Si aucune proposition: afficher "—" avec sous-texte "aucune proposition"

4. **Données exportables**
   - Afficher le nombre total d'éléments (propositions + templates + transactions)
   - Sous-texte: "éléments au total"

### Partie 2 — Exports utiles (milieu)
Titre de section: "Exporter mes données"
Description: "Téléchargez vos données dans le format de votre choix"

2 cartes d'export côte à côte (grid-cols-1 md:grid-cols-2):

**Carte 1 — Exporter mes propositions (ZIP)**
- Icône: Archive (lucide-react) avec fond bleu
- Titre: "Mes propositions (ZIP)"
- Description: "Téléchargez tous vos fichiers de propositions générés (Word, Excel, PDF) dans une archive ZIP"
- Sous-info en gris: "X fichiers disponibles" (count des propositions qui ont un duplicated_template_url non null)
- Bouton: "Télécharger le ZIP"
- API route: `/api/settings/export-propositions-zip`
- État de loading pendant le téléchargement
- Si aucune proposition avec fichier: bouton désactivé avec texte "Aucun fichier à exporter"

**Carte 2 — Historique d'activité (Excel)**
- Icône: Table (lucide-react) avec fond vert
- Titre: "Historique d'activité (Excel)"
- Description: "Tableau récapitulatif de vos propositions et transactions, idéal pour votre comptabilité"
- Sous-info en gris: "X propositions · X transactions"
- Bouton: "Télécharger le Excel"
- API route: `/api/settings/export-history-xlsx`
- Génère un fichier Excel avec 2 onglets:
  - Onglet "Propositions": date, nom client, template utilisé, statut, date export
  - Onglet "Transactions": date, montant, crédits obtenus, statut
- État de loading pendant la génération

### Partie 3 — Gestion et suppression (bas)
Titre de section: "Gestion des propositions"

Carte avec fond jaune/ambre léger (alerte informative):
- Icône AlertTriangle
- "Vos propositions sont limitées à 15. Quand cette limite est atteinte, la plus ancienne proposition est automatiquement supprimée pour faire place à la nouvelle."
- Si le client a 12+ propositions: ajouter en gras "Vous approchez de la limite (X/15)"

Carte de suppression avec bordure rouge:
- Titre: "Supprimer des propositions"
- 2 options de suppression (radio ou boutons):
  
  Option A: "Supprimer toutes mes propositions" (X propositions)
  Option B: "Supprimer les propositions de plus de 30 jours" (X propositions concernées — calculer le nombre côté client en filtrant par date)
  
- Bouton "Supprimer" en rouge, désactivé tant qu'aucune option n'est sélectionnée
- Modal de confirmation qui affiche:
  - Le nombre exact de propositions qui seront supprimées
  - "Cette action est irréversible. Les fichiers associés seront également supprimés."
  - Champ texte où l'utilisateur doit taper "SUPPRIMER" pour confirmer (sécurité)
  - Boutons Annuler / Confirmer la suppression

Lien "Politique de confidentialité" en bas (lien externe placeholder #)

### Partie 4 — API Routes

#### `app/api/settings/export-propositions-zip/route.ts`
- GET
- Auth requise
- Récupère toutes les propositions du client qui ont un `duplicated_template_url`
- Pour chaque proposition, télécharge le fichier depuis Supabase Storage
- Utilise la librairie `archiver` (npm install archiver, @types/archiver) pour créer un ZIP en streaming
- Nomme chaque fichier dans le ZIP: `{nom_client}_{date}_{generated_file_name}` (ou juste generated_file_name si pas de nom_client)
- Retourne le ZIP avec headers: Content-Type application/zip, Content-Disposition attachment
- Si aucun fichier: retourner 404 avec message

#### `app/api/settings/export-history-xlsx/route.ts`
- GET
- Auth requise
- Utilise `exceljs` (déjà installé dans le projet) pour créer un fichier Excel
- Onglet 1 "Propositions": colonnes Date, Client, Template, Statut, Exporté le
  - Récupère les propositions avec un JOIN sur templates pour avoir le nom du template
  - Formate les dates en DD/MM/YYYY
  - Ajoute des styles: header en gras avec fond bleu, alternance de couleurs sur les lignes
- Onglet 2 "Transactions": colonnes Date, Montant (€), Crédits obtenus (€), Statut
  - Récupère les transactions du client
  - Ajoute une ligne de total en bas
  - Mêmes styles que l'onglet 1
- Retourne le fichier avec headers: Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, Content-Disposition attachment filename=historique-propoboost-{date}.xlsx

#### `app/api/settings/delete-propositions/route.ts` (modifier l'existant)
- DELETE
- Auth requise
- Body: `{ mode: 'all' | 'older_than_30_days' }`
- Si mode 'all': supprimer toutes les propositions
- Si mode 'older_than_30_days': supprimer seulement celles créées il y a plus de 30 jours
- Pour chaque proposition supprimée:
  - Si `duplicated_template_url` existe: supprimer le fichier du bucket 'propositions' dans Supabase Storage
  - Si `source_documents` existe: supprimer les fichiers du bucket 'documents'
- Supprimer les entrées dans la table propositions
- Retourner { success: true, deleted_count: X }

## CONTRAINTES TECHNIQUES
- Utiliser TailwindCSS natif (pas de shadcn sauf si Button/composants déjà utilisés dans le fichier)
- Vérifier quels composants sont déjà importés dans le fichier et les réutiliser
- Icônes: lucide-react (Archive, Table, Download, Trash2, AlertTriangle, FileText, ExternalLink, etc.)
- Toasts via sonner (toast.success, toast.error)
- Les téléchargements de fichiers doivent utiliser un pattern avec fetch + blob + URL.createObjectURL pour déclencher le download côté client
- Garder le même style que les autres sections de la page settings
- NE PAS toucher aux autres onglets/sections, modifier UNIQUEMENT l'onglet donnees et les API routes associées