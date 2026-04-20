Je veux ajouter un nouveau mode de création de template Word propulsé par l'IA, en parallèle du mode classique existant. Ne casse RIEN de l'existant — c'est un ajout, pas une réécriture.

## CONTEXTE DU PROJET

Mon projet est une plateforme SaaS multi-tenant de génération de propositions commerciales (secteur téléphonie d'entreprise principalement). Stack : Next.js 14 App Router, Supabase, Anthropic Claude API, docxtemplater, mammoth. Le flow actuel de création de template Word oblige le client à sélectionner manuellement ses champs (Step1), puis copier-coller manuellement chaque `{{variable}}` dans son fichier Word (Step2). C'est long et frustrant.

Je veux ajouter un MODE IA où le client upload simplement son .docx + un nom, et Claude fait tout le reste : détection des pages, analyse, proposition de variables simples + tableaux + fusions, placement automatique des `{{variables}}` dans le .docx, mapping auto vers les clés de données.

## PRINCIPES NON-NÉGOCIABLES

1. **Aucune régression** : le mode classique (Step1SelectFields + Step2UploadTemplate) doit continuer à fonctionner exactement comme aujourd'hui.
2. **Compatibilité totale** : le mode IA doit produire un `file_config` identique en structure à celui du mode classique (mêmes clés : `fieldMappings`, `custom_fields`, `custom_array_fields`, etc.) pour que `lib/generators/index.ts` fonctionne sans modification.
3. **Secteur** : uniquement `telephonie` pour l'instant. Structure le code pour qu'on puisse ajouter `bureautique` plus tard.
4. **Gratuit** pour le client : pas de décompte de crédits sur l'analyse IA.
5. **Édition** : un template créé en mode IA doit se rouvrir dans la même interface IA (aperçu + surlignage + chat) lors de l'édition.

## CHOIX TECHNIQUES VALIDÉS

### Rendu des pages
- Conversion `.docx → .pdf → images PNG par page` via LibreOffice (déjà installé sur le serveur) + `libreoffice-convert` + `pdf-to-img` + `sharp`.
- Les images rendues sont stockées dans un dossier temporaire ou dans Supabase Storage pour l'affichage.

### Analyse par Claude
- Approche hybride : pour chaque page sélectionnée, on envoie à Claude :
  1. L'image rendue de la page (vision)
  2. Le texte extrait de cette page (via mammoth + séparation par sauts de page)
  3. La structure XML des tableaux de cette page
- Modèle : `claude-sonnet-4-6` (lire depuis `organization.claude_model` ou fallback env var).

### Modification du .docx
- Claude propose les variables + positions. Le serveur modifie ensuite le .docx via manipulation du XML (pizzip) en insérant les `{{variables}}` aux bons endroits (matching par texte détecté + contexte).
- Pour les tableaux, insérer `{{#nom_tableau}}...{{/nom_tableau}}` autour de la ligne répétable.

### Détection vierge vs rempli
- Claude gère automatiquement les deux cas sans demander à l'utilisateur. Dans le prompt système, on lui donne l'instruction de détecter si les valeurs sont des données génériques (labels, placeholders) ou de vraies données, et d'agir en conséquence.

## STRUCTURE À CRÉER

### 1. Migration DB (Supabase)

Ajoute à la table `proposition_templates` :
```sql
ALTER TABLE proposition_templates 
  ADD COLUMN creation_mode VARCHAR(20) DEFAULT 'classic' CHECK (creation_mode IN ('classic', 'ai')),
  ADD COLUMN ai_analysis JSONB;

CREATE INDEX idx_templates_creation_mode ON proposition_templates(creation_mode);
```

Crée le fichier `supabase/migrations/YYYYMMDD_ai_template_mode.sql` avec ce SQL.

Structure de `ai_analysis` :
```typescript
{
  selectedPages: number[],
  documentType: 'vierge' | 'rempli' | 'mixte',
  simpleVariables: Array<{
    id: string,              // ex: 'nom_client'
    label: string,           // ex: 'Nom du client'
    suggestedDataKey: string,// ex: 'client.nom_entreprise'
    pageNumber: number,
    position: { x: number, y: number, width: number, height: number },
    detectedValue?: string,  // Si template rempli
    category: string,        // 'client', 'fournisseur', etc.
    isCustom: boolean        // true si pas dans le catalogue télécom
  }>,
  tables: Array<{
    id: string,
    label: string,
    pageNumber: number,
    position: { x: number, y: number, width: number, height: number },
    columns: Array<{ id: string, header: string, columnIndex: number, suggestedDataKey: string }>,
    rowsDetected: number,
    mergedWith?: string[]    // IDs des tableaux fusionnés dans celui-ci
  }>,
  chatHistory: Array<{ role: 'user' | 'assistant', content: string, timestamp: string }>,
  lastAnalyzedAt: string,
  pageImageUrls: string[]    // URLs Supabase Storage des images par page
}
```

### 2. Nouveaux composants (dans `components/templates/ai-mode/`)

Crée ces fichiers :

**`Step2AIMode.tsx`** — Conteneur principal du mode IA :
- Gère les sous-étapes internes : `upload` → `page-selection` → `analyzing` → `review`
- Props : `templateData`, `updateTemplateData`, `secteur`, `onNext`, `onPrev`, `onSave`
- Synchronise `ai_analysis` avec le state

**`PageSelector.tsx`** — Grille de thumbnails cliquables :
- Affiche les images de chaque page (grille responsive 3-4 colonnes)
- Case à cocher par page + "Tout sélectionner"
- Par défaut, toutes les pages sélectionnées
- Bouton "Analyser avec l'IA" en bas

**`InteractivePreview.tsx`** — Aperçu image + surlignage SVG :
- Affiche une page à la fois avec pagination `[◀] Page X/Y [▶]`
- Overlay SVG par-dessus l'image avec rectangles colorés sur chaque variable détectée
- Couleurs : jaune pour variables simples, violet pour tableaux
- Hover → tooltip avec détails
- Clic sur variable → sélection + panneau action
- Clic sur zone vide → menu contextuel "Ajouter une variable ici"

**`VariableOverlay.tsx`** — Composant SVG réutilisable :
- Props : `variables`, `tables`, `imageWidth`, `imageHeight`, `onVariableClick`, `onTableClick`
- Rend les rectangles avec labels

**`AIChatPanel.tsx`** — Chat IA + actions rapides :
- Historique du chat affiché en haut
- Textarea pour écrire un message
- Boutons d'actions rapides en bas : `[+ Variable]`, `[Fusionner]`, `[Renommer]`, `[Supprimer]`
- Récap à droite : "12 variables | 2 tableaux | 1 fusion proposée"

**`AIAnalysisResult.tsx`** — Layout split 60/40 :
- Gauche (60%) : `InteractivePreview`
- Droite (40%) : `AIChatPanel`
- Bouton "Valider et continuer" en bas à droite

**`Step3AIReview.tsx`** — Vérif finale avec mapping auto :
- Liste des variables simples (groupées par catégorie) avec leur `suggestedDataKey` éditable
- Liste des tableaux avec colonnes et leur mapping
- Preview du `file_config` final qui sera sauvegardé
- Boutons "Précédent" / "Sauvegarder le template"

### 3. Modifications des composants existants

**`components/templates/TemplateWizard.tsx`** :
- Ajouter un state `creationMode: 'classic' | 'ai'` (défaut: 'ai' pour Word uniquement, 'classic' pour Excel/PDF)
- Ajouter un toggle en haut de Step2 : `[✨ Mode IA (Recommandé)] [🔧 Mode Classique]`
- Si mode IA et file_type === 'word' : afficher `<Step2AIMode />` et skipper Step1
- Si mode classique : afficher `<Step1SelectFields />` + `<Step2UploadTemplate />` comme aujourd'hui
- Passer `creationMode` à l'API de sauvegarde

**`components/templates/TemplateWizard.tsx` — Gestion édition** :
- À l'ouverture d'un template existant, si `initialTemplate.creation_mode === 'ai'`, ouvrir directement en `Step2AIMode` avec `ai_analysis` pré-chargé
- Le `ai_analysis` doit être passé à `Step2AIMode` pour reprendre l'interface dans l'état où elle a été sauvegardée

### 4. Nouvelles API Routes

**`app/api/templates/ai/render-pages/route.ts`** (POST) :
```typescript
// Input: { fileUrl: string } ou FormData avec file
// 1. Télécharge le .docx (ou le reçoit en FormData)
// 2. Convertit en PDF via libreoffice-convert
// 3. Convertit le PDF en images PNG (une par page) via pdf-to-img
// 4. Upload chaque image dans Supabase Storage (bucket 'templates', sous-dossier '{org_id}/{temp_id}/pages/')
// 5. Retourne: { pageImageUrls: string[], pageCount: number, docxText: string (texte complet via mammoth) }
```

**`app/api/templates/ai/analyze/route.ts`** (POST) :
```typescript
// Input: { 
//   fileUrl: string,                 // .docx original
//   pageImageUrls: string[],         // Images des pages
//   selectedPages: number[],          // Pages à analyser (index 1-based)
//   secteur: 'telephonie',
//   organizationId: string
// }
// 1. Récupère organization.claude_model
// 2. Récupère les champs connus télécom depuis organizationFormConfig.ts (TELEPHONIE_FIELDS + ARRAY_FIELDS.telephonie)
// 3. Pour chaque page sélectionnée :
//    - Télécharge l'image
//    - Extrait le XML des tableaux de cette page depuis le .docx (parser pizzip + filtre par page)
//    - Extrait le texte de cette page via mammoth
// 4. Construit le prompt (voir section PROMPT ci-dessous)
// 5. Appel Claude avec [image + texte + xml tableaux] pour chaque page
// 6. Parse la réponse JSON (avec json repair si besoin)
// 7. Retourne l'objet `ai_analysis` complet
```

**`app/api/templates/ai/chat/route.ts`** (POST) :
```typescript
// Input: {
//   message: string,
//   currentAnalysis: AIAnalysis,     // L'état actuel
//   chatHistory: Array<{role, content}>,
//   organizationId: string
// }
// 1. Construit un prompt avec l'état actuel + l'historique + le nouveau message
// 2. Demande à Claude de retourner :
//    - Une réponse textuelle pour l'utilisateur
//    - Un JSON patch des modifications à appliquer (variables ajoutées/supprimées/renommées, fusions, etc.)
// 3. Applique le patch sur currentAnalysis
// 4. Retourne: { response: string, updatedAnalysis: AIAnalysis }
```

**`app/api/templates/ai/apply/route.ts`** (POST) :
```typescript
// Input: {
//   fileUrl: string,             // .docx original
//   analysis: AIAnalysis,
//   templateName: string,
//   organizationId: string
// }
// 1. Télécharge le .docx original
// 2. Ouvre avec pizzip
// 3. Modifie le XML pour insérer les {{variables}} aux positions détectées :
//    - Variables simples : remplace le texte détecté par {{variable}}
//    - Tableaux : entoure la ligne répétable avec {{#tableau}} et {{/tableau}}, remplace chaque cellule par {{variable}}
//    - Si template vierge (documentType === 'vierge') : insère les {{variables}} à côté/dans les labels
//    - Si template rempli : remplace les données par les {{variables}}
// 4. Construit le `file_config` au format existant :
//    {
//      formatVariables: '{{var}}',
//      fieldMappings: { '{{nom_client}}': 'client.nom_entreprise', ... },
//      custom_fields: [...],       // Variables custom détectées
//      custom_array_fields: [...]  // Tableaux custom détectés
//    }
// 5. Upload le .docx modifié dans Supabase Storage
// 6. Construit `champs_actifs` à partir des variables (format compatible avec l'existant)
// 7. Retourne: { fileUrl, fileConfig, champsActifs, aiAnalysis }
```

**`app/api/templates/ai/re-analyze/route.ts`** (POST) :
```typescript
// Input: { templateId: string }
// 1. Récupère le template depuis la DB
// 2. Appelle render-pages puis analyze
// 3. Met à jour ai_analysis en DB
// 4. Retourne la nouvelle analyse
```

### 5. Librairies utilitaires

**`lib/ai/template-analyzer.ts`** — Fonctions core :
- `renderDocxToPdf(buffer): Promise<Buffer>` — Utilise libreoffice-convert
- `renderPdfToImages(buffer): Promise<Buffer[]>` — Utilise pdf-to-img
- `extractTextByPage(docxBuffer): Promise<string[]>` — Mammoth + découpage par page breaks
- `extractTablesXml(docxBuffer, pageNumber): Promise<string[]>` — Via pizzip + parsing XML
- `analyzeWithClaude(pages, secteur, claudeModel, knownFields): Promise<AIAnalysis>` — Appel Claude avec prompt optimisé
- `chatRefineAnalysis(message, analysis, history, claudeModel): Promise<{response, updatedAnalysis}>`

**`lib/ai/docx-injector.ts`** — Injection des variables dans le .docx :
- `injectVariablesIntoDocx(docxBuffer, analysis): Promise<Buffer>`
- Utilise pizzip pour manipuler le XML
- Stratégie matching : recherche le texte détecté + contexte pour localiser le `<w:t>` exact, puis remplace
- Pour les tableaux : identifie la `<w:tr>` cible, wrap avec `{{#tableau}}...{{/tableau}}`, remplace les `<w:t>` des cellules

**`lib/ai/fields-catalog.ts`** — Catalogue des champs télécom pour le prompt :
- Export `TELEPHONIE_FIELDS_FOR_AI` : version formatée du catalogue pour injection dans le prompt Claude
- Import les champs existants depuis `components/admin/organizationFormConfig.ts` (TELEPHONIE_FIELDS, ARRAY_FIELDS.telephonie, TELECOM_LINES_CATEGORIES)

### 6. Prompt système pour l'analyse (dans `lib/ai/template-analyzer.ts`)