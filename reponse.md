# Refonte Word — Mode IA : ce qui a été fait

Ajout d'un **mode IA** de création de templates Word, **en parallèle** du mode classique (Step1SelectFields + Step2UploadTemplate). **Aucune régression** : le mode classique reste intact, le toggle permet de basculer sur Word uniquement (Excel/PDF restent classiques).

Le modèle Claude utilisé dans tout le pipeline IA suit cette priorité :
**`organization.claude_model`** → **`DEFAULT_CLAUDE_MODEL`** (défini dans `components/admin/organizationFormConfig.ts`, valeur actuelle : `claude-sonnet-4-6`).

---

## 1. Base de données

- **Migration créée** : `supabase/migrations/2026-04-20_ai_template_mode.sql`
  - Ajoute `creation_mode VARCHAR(20)` (`classic` | `ai`) avec défaut `classic`.
  - Ajoute `ai_analysis JSONB` pour stocker l'état complet (pages, variables, tableaux, chat).
  - Ajoute un index sur `creation_mode`.

## 2. Librairies IA (`lib/ai/`)

- **`fields-catalog.ts`** — Catalogue des champs télécom pour le prompt Claude (import de `TELEPHONIE_FIELDS`, `ARRAY_FIELDS.telephonie`, `TELECOM_LINES_CATEGORIES`). Structure extensible pour `bureautique` plus tard.
- **`template-analyzer.ts`** — Pipeline complet :
  - `renderDocxToPdf` via `libreoffice-convert`.
  - `renderPdfToImages` via `pdf-to-img`.
  - `extractTextByPage` via `mammoth` (split par `\f`).
  - `extractTablesXml` via `pizzip`.
  - `analyzeWithClaude` : envoie image + texte + XML tableaux page par page.
  - `chatRefineAnalysis` : chat pour raffiner (add/remove/rename/merge).
  - `resolveClaudeModel()` : helper qui retourne `org.claude_model ?? DEFAULT_CLAUDE_MODEL`.
  - Prompt système détaillé (vierge/rempli/mixte, format JSON strict, positions relatives 0..1).
- **`docx-injector.ts`** — Injection des `{{variables}}` dans le .docx :
  - Variables simples : remplace la valeur détectée ou injecte après le label.
  - Tableaux : wrap `{{#id}}…{{/id}}` + remplacement des cellules par `{{colonne}}`.
  - `buildFileConfigFromAnalysis()` produit un `file_config` **strictement compatible** avec `lib/generators/index.ts` (`formatVariables`, `fieldMappings`, `custom_fields`, `custom_array_fields`).

## 3. API routes (`app/api/templates/ai/`)

- **`render-pages/route.ts`** (POST) — `.docx` → PDF → PNGs → upload Supabase Storage (`templates/{org_id}/ai/{tempId}/pages/page-N.png`).
- **`analyze/route.ts`** (POST) — Lance l'analyse IA sur les pages sélectionnées, utilise `resolveClaudeModel(org.claude_model)`.
- **`chat/route.ts`** (POST) — Chat IA pour raffiner l'analyse.
- **`apply/route.ts`** (POST) — Injecte les `{{variables}}` dans le .docx, upload le nouveau fichier, retourne `fileUrl + fileConfig + champsActifs + aiAnalysis`.
- **`re-analyze/route.ts`** (POST) — Relance `render-pages` + `analyze` pour un template existant (édition).

Toutes les routes :
- protégées par l'auth Supabase,
- `runtime = 'nodejs'`,
- aucun décompte de crédits (gratuit).

## 4. Composants UI (`components/templates/ai-mode/`)

| Fichier | Rôle |
|---|---|
| `types.ts` | Ré-export des types depuis `lib/ai/template-analyzer`. |
| `Step2AIMode.tsx` | Conteneur principal (sous-étapes : `upload` → `page-selection` → `analyzing` → `review` → `final`). |
| `PageSelector.tsx` | Grille responsive 2/3/4 colonnes avec thumbnails + checkboxes. |
| `InteractivePreview.tsx` | Aperçu page par page avec pagination. |
| `VariableOverlay.tsx` | Overlay SVG (jaune = variable simple, violet = tableau), tooltips, clics. |
| `AIChatPanel.tsx` | Chat + actions rapides + récap (12 variables, 2 tableaux…). |
| `AIAnalysisResult.tsx` | Layout split 60/40 (preview + chat). |
| `Step3AIReview.tsx` | Vérif finale, `suggestedDataKey` éditables, bouton **Sauvegarder**. |

## 5. Intégration

- **`components/templates/TemplateWizard.tsx`** :
  - `TemplateData` étendu avec `creation_mode` et `ai_analysis`.
  - Toggle **Mode IA / Mode Classique** affiché pour Word (icônes `Sparkles` / `Wrench`).
  - Mode IA par défaut pour Word en création (et réouverture automatique en mode IA si `creation_mode === 'ai'` en édition).
  - `handleComplete` envoie `creation_mode` à l'API.
- **`app/api/templates/create/route.ts`** : accepte `creation_mode` et `ai_analysis` et les insère en DB.
- **`app/api/templates/[id]/route.ts`** : inchangé — le PATCH forwarde déjà tout le body, donc `creation_mode` et `ai_analysis` sont persistés en édition.

## 6. Utilisation de `DEFAULT_CLAUDE_MODEL`

Toutes les nouvelles routes IA utilisent **`resolveClaudeModel()`** qui résout ainsi :

```ts
return (org.claude_model && org.claude_model.trim()) || DEFAULT_CLAUDE_MODEL;
```

`DEFAULT_CLAUDE_MODEL` est importé depuis `components/admin/organizationFormConfig.ts`. Il pointe toujours sur la **première entrée** de `CLAUDE_MODELS`, donc sur **le dernier modèle recommandé**. Mettre à jour `CLAUDE_MODELS[0]` dans ce fichier propage automatiquement à tout le pipeline IA.

---

# ⚠️ Ce qu'il te reste à faire

## 1. Appliquer la migration SQL

Sur ton instance Supabase (CLI ou Studio) :

```sql
ALTER TABLE proposition_templates
  ADD COLUMN IF NOT EXISTS creation_mode VARCHAR(20) DEFAULT 'classic'
    CHECK (creation_mode IN ('classic', 'ai')),
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

CREATE INDEX IF NOT EXISTS idx_templates_creation_mode
  ON proposition_templates(creation_mode);
```

Ou via la CLI Supabase :
```
supabase db push
```
Le fichier est déjà prêt : `supabase/migrations/2026-04-20_ai_template_mode.sql`.

## 2. Vérifier les dépendances `package.json`

Toutes déjà présentes (✅) : `@anthropic-ai/sdk`, `libreoffice-convert`, `pdf-to-img`, `mammoth`, `pizzip`, `sharp`.
**Rien à installer.** Aucun package ajouté.

## 3. S'assurer que LibreOffice est disponible

Sur ton serveur/hébergement, `libreoffice-convert` appelle la binaire `soffice`. Tu as déjà :
- `LIBREOFFICE_PATH=/usr/bin/libreoffice`
- `TEMP_CONVERSION_DIR=/tmp/propoboost-conversions`
- `LIBREOFFICE_PROFILE_DIR=/var/lib/libreoffice-profile`

Confirme que c'est bien installé sur l'environnement où tourne Next.js (Docker : ton `Dockerfile` doit contenir `apt-get install libreoffice`).

## 4. Bucket Supabase Storage

Le bucket **`templates`** doit exister (tu l'as déjà pour le mode classique). Les images des pages et les .docx IA sont uploadés sous :
```
templates/{org_id}/ai/{tempId}/pages/page-N.png
templates/{org_id}/ai/{tempId}/{nom}-{timestamp}.docx
```
Assure-toi que les policies RLS du bucket acceptent `INSERT/UPDATE` pour `organization_id = auth.uid()`.

## 5. Variables d'environnement

Rien à rajouter. Ton `.env.local` est déjà suffisant (`ANTHROPIC_API_KEY` + clés Supabase).

> Note : le code n'utilise **pas** `CLAUDE_MODEL_EXTRACTION` pour le mode IA, comme demandé. Il lit **toujours** `organization.claude_model` et retombe sur **`DEFAULT_CLAUDE_MODEL`**.

## 6. Tester

1. Lance `npm run dev`.
2. Crée un nouveau template Word → le toggle **Mode IA** est sélectionné par défaut.
3. Upload un `.docx` → attend ~30s (conversion + analyse).
4. Vérifie que les variables sont détectées (jaune) et les tableaux (violet).
5. Utilise le chat pour affiner.
6. Clique **Valider** → vérifie que `suggestedDataKey` sont cohérents avec le catalogue télécom.
7. Clique **Sauvegarder** → redirection vers la page du template.
8. Ré-ouvre le template → il doit revenir en mode IA avec l'analyse préchargée.

## 7. Limitations connues / à surveiller

- **Positions des variables** : Claude fournit les coordonnées relatives, mais elles peuvent être approximatives. L'overlay SVG reste utilisable.
- **Découpage par page** : `mammoth` ne préserve pas toujours les page breaks → fallback par taille de texte. Pour une précision chirurgicale, envisager plus tard `docx4js` ou un parseur XML maison.
- **Tableaux multi-pages** : traités comme un seul tableau (comportement Word natif).
- **Secteur `bureautique`** : structure prête (`buildFieldsCatalog` lèvera une erreur explicite), mais non activé — il suffira d'étendre `fields-catalog.ts`.
- **Re-analyze** : appelle les routes via `fetch` interne — fonctionne en prod mais peut être lent (2 aller-retours). OK pour un usage ponctuel.

---

Si un point bloque ou si tu veux ajuster le prompt / l'UI / la stratégie d'injection, dis-le moi et je fais la modif ciblée.

---

# 🔧 Correctif build Docker (20 avril 2026)

## Symptôme

Build Docker échoue pendant `next build` à la phase **« Collecting page data »** :

```
TypeError: The "path" argument must be of type string. Received type number (64273)
    at module evaluation (.next/server/chunks/[root-of-the-server]__...js)
    ...
    at Object.<anonymous> (.next/server/app/api/templates/ai/analyze/route.js:19:3)
Error: Failed to collect page data for /api/templates/ai/analyze
```

## Cause racine

Next.js 16 (Turbopack) **évalue le module route** pendant la phase « Collecting page data » pour détecter les flags (`runtime`, `dynamic`, etc.). Or `app/api/templates/ai/analyze/route.ts` importait au niveau top-level `@/lib/ai/template-analyzer`, qui lui-même importait **à l'évaluation du module** des dépendances natives lourdes :

- `libreoffice-convert`
- `pdf-to-img`
- `mammoth`
- `pizzip`
- `@anthropic-ai/sdk`

L'une d'elles (probablement `libreoffice-convert` ou `pdf-to-img`) exécute du code au chargement qui appelle `path.join(...)` avec un argument numérique (PID/temp dir), ce qui plante en environnement de build.

## Correctif

**Import dynamique** de toutes les deps natives, uniquement à l'intérieur des fonctions — elles ne sont plus évaluées au chargement du module route.

Fichiers modifiés :

- `lib/ai/template-analyzer.ts`
  - Import `type` uniquement pour `@anthropic-ai/sdk`.
  - `libreoffice-convert` → lazy via `getConvertAsync()` (cache).
  - `pdf-to-img` → `await import('pdf-to-img')` dans `renderPdfToImages`.
  - `mammoth` → `await import('mammoth')` dans `extractTextByPage`.
  - `pizzip` → `await import('pizzip')` dans `extractTablesXml` (fonction devenue `async`).
  - `getAnthropic()` devient `async` et instancie le SDK via import dynamique.

- `app/api/templates/ai/analyze/route.ts`
  - Suppression de `import mammoth from 'mammoth'` top-level.
  - `mammoth` importé dynamiquement dans le fallback de découpage.
  - `extractTablesXml(docxBuffer)` → désormais `await`.

- `app/api/templates/ai/render-pages/route.ts`
  - Suppression de `import mammoth from 'mammoth'` top-level.
  - `mammoth` importé dynamiquement juste avant l'extraction du texte complet.

## Impact

- Build Docker : la phase « Collecting page data » ne charge plus les binaires natifs → plus d'erreur `ERR_INVALID_ARG_TYPE`.
- Runtime : aucun changement fonctionnel. Les deps sont chargées à la première invocation de chaque route (cold-start légèrement plus long la première fois, négligeable).
- Aucune breaking change côté API / UI.

