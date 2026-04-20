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


---

# 🐛 Debug : `POST /api/templates/ai/render-pages 500` (20 avril 2026)

## Ce que j'ai besoin de toi pour trancher

La route renvoie déjà le détail de l'erreur dans la réponse JSON (`{ error, details }` — voir `@c:\Users\ilan\CascadeProjects\Saas_propal\app\api\templates\ai\render-pages\route.ts:86-95`). Donc **ouvre l'onglet Network de Chrome**, clique sur la requête `render-pages` en erreur, onglet **Response** / **Preview**, et donne-moi la valeur du champ `details`. OU donne-moi les logs serveur (`docker logs` ou équivalent) filtrés sur `[AI] render-pages error:`.

Sans ce message, je ne peux que lister les causes probables ci-dessous par ordre de vraisemblance.

## Causes probables (par ordre décroissant)

### 1. LibreOffice manquant / inaccessible dans le conteneur (le plus probable)

`renderDocxToPdf` appelle `libreoffice-convert`, qui spawn le binaire **`soffice`** (il cherche dans le `PATH`, il **n'utilise pas** ta variable `LIBREOFFICE_PATH`). Symptômes typiques :

```
Error: spawn soffice ENOENT
```
ou
```
Error: Could not find soffice binary
```

**Fix** : dans ton `Dockerfile`, s'assurer que l'image contient :
```dockerfile
RUN apt-get update && apt-get install -y libreoffice libreoffice-writer --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
```
et que `soffice` est accessible (`which soffice` doit renvoyer `/usr/bin/soffice`).

Si le binaire est à un chemin non-standard, le plus simple est un symlink :
```dockerfile
RUN ln -sf /usr/bin/libreoffice /usr/bin/soffice
```

### 2. Le `fetch(fileUrl)` côté serveur échoue (bucket privé)

La route reçoit `{ fileUrl }` et fait `await fetch(fileUrl)` pour récupérer le .docx. Si le bucket Supabase `templates` est **privé**, le `publicUrl` renvoie bien une URL, mais un `GET` direct dessus renvoie **400/403**, et `resp.ok` est `false` → `readInput` renvoie `null` → la route répond **400 "No file provided"**, pas 500.

Donc si ton erreur est un 500 et pas un 400, ce n'est probablement PAS cette cause. Mais à vérifier si tu as migré le bucket en privé récemment.

**Fix possible** : soit laisser le bucket public, soit remplacer le flux actuel par un upload direct de fichier (multipart) — la route supporte déjà les deux (voir `readInput` lignes 15-39).

### 3. `pdf-to-img` / rendu PDF

La lib `pdf-to-img` (qui utilise `pdfjs-dist` + `@napi-rs/canvas` en interne) peut planter à l'exécution si une dépendance native manque dans le conteneur Alpine (fontconfig, libjpeg, etc.). Symptômes :
```
Error: Cannot find module '@napi-rs/canvas-linux-x64-musl'
```
ou
```
Error: libfontconfig.so.1: cannot open shared object file
```

**Fix (Alpine)** :
```dockerfile
RUN apk add --no-cache fontconfig ttf-dejavu cairo pango giflib libjpeg-turbo
```
**Fix (Debian/Ubuntu — plus probable chez toi)** : normalement OK si LibreOffice est déjà installé, car il tire les fonts.

### 4. RLS Supabase Storage refuse l'INSERT

L'upload utilise le path `${user.id}/ai/${tempId}/pages/page-N.png`. Si ta policy RLS sur `storage.objects` bucket `templates` vérifie `organization_id` (et pas `user.id`), l'upload échoue. Mais le code **log juste l'erreur et `continue`** (lignes 64-67), donc ça n'émet pas de 500 — ça retourne juste `pageImageUrls: []`. Donc **pas la cause du 500**, mais à vérifier si après correction tu n'as pas d'images.

### 5. Mémoire / timeout LibreOffice

Sur des .docx complexes, `soffice` peut mettre >60s ou manquer de mémoire → le convert reject. `maxDuration = 120` est déjà à 2 min, mais certaines plateformes (Vercel hors Pro) capent avant.

## Améliorations à appliquer en tout cas

1. **Logger davantage** dans `render-pages/route.ts` avant chaque étape pour isoler la phase qui plante :
   ```ts
   console.log('[AI] 1/ Téléchargement fichier...');
   console.log('[AI] 2/ docx -> pdf');
   console.log('[AI] 3/ pdf -> images');
   ```
2. **Propager explicitement** l'erreur si `pageImageUrls.length === 0` au lieu de renvoyer `success: true` avec un tableau vide (ça masque le vrai problème RLS).
3. **Honorer `LIBREOFFICE_PATH`** : puisque tu as déjà cette variable d'env, la passer à `libreoffice-convert` en l'injectant dans le `PATH` au démarrage, ou utiliser le 4ᵉ argument `filter` pour forcer le chemin (la lib expose un champ `tmpOptions` depuis la v1.6). Sinon, symlinker `soffice`.

## Action demandée

Renvoie-moi le **`details`** du JSON de la réponse 500 (Network tab → Response). Je pourrai alors faire le correctif ciblé plutôt que de patcher toutes les causes à l'aveugle.

---

# ✅ Diagnostic confirmé (20 avril 2026, 14h34)

Tu m'as envoyé deux erreurs distinctes. Voilà le verdict.

## Erreur 1 — `Could not find soffice binary` → **cause du 500**

```
[AI] render-pages error: Error: Could not find soffice binary
 POST /api/templates/ai/render-pages 500
```

C'était exactement la **cause #1** que je listais plus haut. Le chemin `C:\Users\ilan\AppData\Local\Temp\libreofficeConvert_...` confirme que **tu tournes en local sous Windows** (pas dans Docker). Ton `Dockerfile` installe bien LibreOffice (`@c:\Users\ilan\CascadeProjects\Saas_propal\Dockerfile:26-37`) donc la **prod est OK**, c'est uniquement **ton poste de dev** qui n'a pas `soffice` dans le `PATH`.

### Fix Windows (à faire une fois)

1. **Installer LibreOffice** : https://www.libreoffice.org/download/download/ → installe la version "Fresh" 64-bit. Par défaut ça pose le binaire dans :
   ```
   C:\Program Files\LibreOffice\program\soffice.exe
   ```
2. **Ajouter au PATH** (⚠️ c'est ce que `libreoffice-convert` regarde, il ignore `LIBREOFFICE_PATH`) :
   - `Win + R` → `sysdm.cpl` → onglet **Avancé** → **Variables d'environnement**.
   - Dans **Path** (utilisateur ou système), ajoute : `C:\Program Files\LibreOffice\program`
3. **Redémarrer ton terminal ET le serveur Next** (sinon le nouveau PATH n'est pas vu par `node`).
4. Vérifier :
   ```powershell
   soffice --version
   ```
   doit renvoyer quelque chose comme `LibreOffice 24.x ...`.

Après ça, `/api/templates/ai/render-pages` retournera 200.

## Erreur 2 — `ENOTEMPTY: rmdir ... libreofficeConvert_...` → **bug connu de la lib sur Windows**

```
Error: ENOTEMPTY: directory not empty, rmdir 'C:\Users\ilan\AppData\Local\Temp\libreofficeConvert_...'
 ⨯ unhandledRejection
```

Bug récurrent de `libreoffice-convert` sur Windows : la lib supprime son dossier temporaire **juste après** avoir lu le PDF, mais `soffice.exe` garde parfois un handle ouvert quelques ms → `rmdir` échoue avec `ENOTEMPTY`. Comme c'est déclenché dans un callback détaché (pas dans notre `await`), ça remonte en **`unhandledRejection`** et **crash le dev server Next**.

Ce n'est **pas** ce qui provoque le 500 (le 500 vient de l'erreur 1), mais une fois l'erreur 1 corrigée, **l'erreur 2 restera** et continuera à spammer. Deux options :

### Option A — Ignorer proprement ce rejet spécifique (recommandé, 1 fichier)

Ajoute un handler global qui silencie **uniquement** ce cas (le reste continue de remonter). Créer `@c:\Users\ilan\CascadeProjects\Saas_propal\lib\ai\libreoffice-cleanup-guard.ts` :

```ts
// Guard contre les ENOTEMPTY de libreoffice-convert sur Windows.
// Bug upstream : https://github.com/elwerene/libreoffice-convert/issues/…
let installed = false;
export function installLibreofficeCleanupGuard() {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', (err) => {
    const e = err as NodeJS.ErrnoException;
    if (
      e?.code === 'ENOTEMPTY' &&
      typeof e?.path === 'string' &&
      e.path.includes('libreofficeConvert_')
    ) {
      // Ignoré : cleanup non critique
      return;
    }
    throw err;
  });
}
```

Puis appelle `installLibreofficeCleanupGuard()` au tout début de `getConvertAsync()` dans `@c:\Users\ilan\CascadeProjects\Saas_propal\lib\ai\template-analyzer.ts:39-52`.

### Option B — Forcer un dossier temp dédié et le nettoyer nous-mêmes

Plus propre sur le long terme mais plus de code : patcher `renderDocxToPdf` pour écrire le .docx dans un tmp à nous, spawn `soffice --headless --convert-to pdf` directement, et supprimer le dossier en `try/finally` avec retry. Abandonne `libreoffice-convert`. À faire **seulement** si l'option A ne suffit pas.

## Recap

| # | Erreur | Cause | Fix |
|---|---|---|---|
| 1 | `Could not find soffice binary` (500) | LibreOffice pas dans le PATH Windows local | Installer + PATH + redémarrer |
| 2 | `ENOTEMPTY rmdir libreofficeConvert_...` (unhandledRejection) | Bug connu `libreoffice-convert` sur Windows | Handler global qui swallow ce code précis (option A) |

Dis-moi si tu veux que j'applique **l'option A** directement (fichier + hook dans `template-analyzer.ts`) — c'est 5 lignes.
