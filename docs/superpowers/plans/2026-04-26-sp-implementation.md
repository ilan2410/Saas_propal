# SP (Situation Proposée) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full "Situation Proposée" wizard step (Step 5) to the proposition flow, with AI-powered questions, SP data generation, Word template variables, and a settings-based question builder.

**Architecture:** Extend the existing 5-step PropositionWizard to 6 steps by inserting a new SP step (Word only) between Step 4 (Edit SA) and the final generation step. SP data is generated via Claude, post-processed into typed structs, merged into Word templates alongside SA data, and configured per-template through a drag-and-drop question builder in settings.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase, Anthropic Claude API, shadcn/ui, docxtemplater, @hello-pangea/dnd

---

### Task 1: Update `types/index.ts` — SP type definitions

**Files:**
- Modify: `types/index.ts`

The existing file already has partial SP types (SpAdresse, SpLigneMobile, SpMateriel, etc.) but they are incomplete vs. the spec. We need to:
1. Add `sp_produit_fournisseur?` and `sp_type_ligne: "Mobile"` to SpLigneMobile
2. Fix SpLigneFixe/SpInternet to use Omit pattern with correct sp_type_ligne
3. Add `sp_materiel_fournisseur?` and `sp_type_ligne: "Materiel"` to SpMateriel
4. Add `[key: string]: unknown` to SuggestionsSpCompletes
5. Update SpVariableCustom to support `tableau` type with rowFields
6. Replace SpQuestion with the full builder version (SpQuestionSource, SpQuestionAffichage, etc.)
7. Add all new SP builder types (SpCondition, SpGroupeConditions, SpFiltresCatalogue, SpConsequence)
8. Remove SP_QUESTIONS_DEFAUT constant (based on old simple SpQuestion type)

- [ ] **Step 1: Replace the `// ── Questions SP ──` section onwards in types/index.ts**

Replace everything from line 308 (`// ── Questions SP ──`) to end of file with:

```typescript
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
  | 'oui_non'
  | 'confirmation_sa'
  | 'edition_sa'
  | 'texte_court'
  | 'texte_long'
  | 'nombre'
  | 'date'
  | 'choix_liste_manuelle'
  | 'adresse_complete';

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

export interface SpFiltresCatalogue {
  categories?: string[];
  fournisseurs?: string[];
  type_facturation?: 'mensuel' | 'unique' | 'tous';
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
    | 'aller_question';
  variable_cible?: string;
  question_id?: string;
  filtre?: SpFiltresCatalogue;
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
  consequences: SpConsequence[];
  priorite_ia: 'normale' | 'haute';
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

export interface SpLigneFixe extends Omit<SpLigneMobile, 'sp_type_ligne'> {
  sp_type_ligne: 'Fixe';
}

export interface SpInternet extends Omit<SpLigneMobile, 'sp_type_ligne'> {
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
  [key: string]: unknown;

  sp_economie_mensuelle: string;
  sp_economie_annuelle: string;
  sp_total_actuel: string;
  sp_total_propose: string;
  sp_ameliorations: string;
  sp_nb_lignes: string;
  sp_est_economie: string;
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to SP types (there may be pre-existing errors elsewhere).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): update SP types to full builder model"
```

---

### Task 2: Create Supabase migration

**Files:**
- Create: `supabase/migrations/sp_questions.sql`

- [ ] **Step 1: Create the migration file**

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

- [ ] **Step 2: Apply migration in Supabase dashboard or via CLI**

Run in Supabase SQL editor or:
```bash
# If using supabase CLI:
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/sp_questions.sql
git commit -m "feat(db): add sp_questions, suggestions_sp_completes, sp_reponses columns"
```

---

### Task 3: Create `lib/generators/sp-word-data.ts`

**Files:**
- Create: `lib/generators/sp-word-data.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { SuggestionsSpCompletes, SpAdresse, SpTableauFusionne } from '@/types';

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
    sp_economie_mensuelle: sp.sp_economie_mensuelle ?? '',
    sp_economie_annuelle: sp.sp_economie_annuelle ?? '',
    sp_total_actuel: sp.sp_total_actuel ?? '',
    sp_total_propose: sp.sp_total_propose ?? '',
    sp_ameliorations: sp.sp_ameliorations ?? '',
    sp_nb_lignes: sp.sp_nb_lignes ?? '',
    sp_est_economie: sp.sp_est_economie ?? '',
    sp_fournisseur_propose: sp.sp_fournisseur_propose ?? '',

    sp_adresse_facturation: adresseFact ? formatAdresse(adresseFact) : '',
    sp_adresse_facturation_rue: adresseFact?.adresse ?? '',
    sp_adresse_facturation_cp: adresseFact?.code_postal ?? '',
    sp_adresse_facturation_ville: adresseFact?.ville ?? '',

    sp_adresse_livraison: adresseLiv ? formatAdresse(adresseLiv) : '',
    sp_adresse_livraison_rue: adresseLiv?.adresse ?? adresseFact?.adresse ?? '',
    sp_adresse_livraison_cp: adresseLiv?.code_postal ?? adresseFact?.code_postal ?? '',
    sp_adresse_livraison_ville: adresseLiv?.ville ?? adresseFact?.ville ?? '',
    sp_livraison_identique: sp.sp_livraison_identique ? 'Oui' : 'Non',

    sp_lignes_mobiles: sp.sp_lignes_mobiles ?? [],
    sp_lignes_fixes: sp.sp_lignes_fixes ?? [],
    sp_internet: sp.sp_internet ?? [],
    sp_materiel: sp.sp_materiel ?? [],

    sp_fixes_mobiles: sp.sp_fixes_mobiles ?? [],
    sp_fixes_mobiles_internet: sp.sp_fixes_mobiles_internet ?? [],
    sp_toutes_lignes: sp.sp_toutes_lignes ?? [],
    sp_tout: sp.sp_tout ?? [],
  };

  if (tableauxFusionnes) {
    for (const fusion of tableauxFusionnes) {
      if (sp[fusion.id] !== undefined) {
        data[fusion.id] = sp[fusion.id];
      } else {
        const items: unknown[] = [];
        const map: Record<string, unknown[]> = {
          mobiles: sp.sp_lignes_mobiles ?? [],
          fixes: sp.sp_lignes_fixes ?? [],
          internet: sp.sp_internet ?? [],
          materiel: sp.sp_materiel ?? [],
        };
        for (const cat of fusion.categories) {
          items.push(...(map[cat] ?? []));
        }
        data[fusion.id] = items;
      }
    }
  }

  return data;
}

function formatAdresse(a: SpAdresse): string {
  return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`, a.pays]
    .filter(Boolean)
    .join(', ');
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/generators/sp-word-data.ts
git commit -m "feat(generators): add buildSpWordData helper"
```

---

### Task 4: Modify `lib/generators/index.ts` — inject SP data

**Files:**
- Modify: `lib/generators/index.ts`

The `GenerateOptions` interface needs a `suggestions_sp_completes` field, and `generateWordFile` must merge SP data before `doc.render()`.

- [ ] **Step 1: Add import + extend GenerateOptions**

Add at top of file (after existing imports):
```typescript
import { buildSpWordData } from './sp-word-data';
import type { SuggestionsSpCompletes, WordConfig } from '@/types';
```

Extend the `GenerateOptions` interface (around line 97):
```typescript
interface GenerateOptions {
  template: {
    id: string;
    file_type: 'excel' | 'word' | 'pdf';
    file_url: string;
    file_config: unknown;
    champs_actifs: string[];
  };
  donnees: UnknownRecord;
  organization_id: string;
  proposition_id: string;
  suggestions_sp_completes?: SuggestionsSpCompletes | null;  // ADD THIS
}
```

- [ ] **Step 2: Replace `doc.render(...)` call in `generateWordFile`**

Find the existing `doc.render({ ...mappedData, ...flatData });` call (around line 437) and replace:

```typescript
  // Inject SP data (SP keys cannot overwrite SA keys — SA has priority)
  const spCompletes = (options.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
  const wordCfg = (isPlainObject(fileConfig) ? fileConfig : {}) as WordConfig;
  const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
  const finalData = { ...spData, ...mappedData, ...flatData };

  try {
    doc.render(finalData);
  } catch (error) {
```

Note: SA keys (mappedData + flatData) have priority over SP keys by being spread last.

- [ ] **Step 3: Update `generate/route.ts` to pass `suggestions_sp_completes`**

In `app/api/propositions/[id]/generate/route.ts`, update the Supabase select and `generatePropositionFile` call:

```typescript
// Change select('*') to include the new field (select('*') already gets all columns, so just pass it through):
const fileUrl = await generatePropositionFile({
  template,
  donnees,
  organization_id: user.id,
  proposition_id: id,
  suggestions_sp_completes: proposition.suggestions_sp_completes ?? null,
});
```

- [ ] **Step 4: Commit**

```bash
git add lib/generators/index.ts app/api/propositions/[id]/generate/route.ts
git commit -m "feat(generators): merge SP data into Word template render"
```

---

### Task 5: Add catalogue API endpoints

**Files:**
- Create: `app/api/catalogue/categories/route.ts`
- Create: `app/api/catalogue/fournisseurs/route.ts`

- [ ] **Step 1: Create categories endpoint**

```typescript
// app/api/catalogue/categories/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('catalogues_produits')
      .select('categorie')
      .eq('actif', true)
      .eq('organization_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const categories = [...new Set((data ?? []).map((r) => r.categorie))].sort();
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create fournisseurs endpoint**

```typescript
// app/api/catalogue/fournisseurs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categories = searchParams.get('categories')?.split(',').filter(Boolean) ?? [];

    let query = supabase
      .from('catalogues_produits')
      .select('fournisseur')
      .eq('actif', true)
      .eq('organization_id', user.id)
      .not('fournisseur', 'is', null);

    if (categories.length > 0) {
      query = query.in('categorie', categories);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const fournisseurs = [...new Set((data ?? []).map((r) => r.fournisseur).filter(Boolean))].sort();
    return NextResponse.json({ fournisseurs });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/catalogue/categories/route.ts app/api/catalogue/fournisseurs/route.ts
git commit -m "feat(api): add catalogue categories and fournisseurs endpoints"
```

---

### Task 6: Add template SP/SA API endpoints

**Files:**
- Create: `app/api/templates/[id]/sp-questions/route.ts`
- Create: `app/api/templates/[id]/sp-questions/[qid]/route.ts`
- Create: `app/api/templates/[id]/sp-questions/order/route.ts`
- Create: `app/api/templates/[id]/sp-variables/route.ts`
- Create: `app/api/templates/[id]/sa-variables/route.ts`

SP questions are stored in `organizations.sp_questions` as a JSONB array, filtered by `template_id`.

- [ ] **Step 1: Create `sp-questions/route.ts` (GET all, POST new)**

```typescript
// app/api/templates/[id]/sp-questions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const questions = all.filter((q) => q.template_id === template_id);
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const existing: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const forTemplate = existing.filter((q) => q.template_id === template_id);
  const newQuestion: SpQuestion = {
    ...body,
    id: uuidv4(),
    template_id,
    ordre: forTemplate.length + 1,
  };

  const updated = [...existing, newQuestion];
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ question: newQuestion });
}
```

- [ ] **Step 2: Create `sp-questions/[qid]/route.ts` (PUT, DELETE)**

```typescript
// app/api/templates/[id]/sp-questions/[qid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string; qid: string }> }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id: template_id, qid } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data: org } = await supabase.from('organizations').select('sp_questions').eq('id', user.id).single();
  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];

  const updated = all.map((q) =>
    q.id === qid && q.template_id === template_id ? { ...q, ...body, id: qid, template_id } : q
  );
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: template_id, qid } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: org } = await supabase.from('organizations').select('sp_questions').eq('id', user.id).single();
  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const updated = all.filter((q) => !(q.id === qid && q.template_id === template_id));
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create `sp-questions/order/route.ts` (PUT reorder)**

```typescript
// app/api/templates/[id]/sp-questions/order/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderedIds }: { orderedIds: string[] } = await req.json();
  const { data: org } = await supabase.from('organizations').select('sp_questions').eq('id', user.id).single();
  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];

  const reordered = all.map((q) => {
    if (q.template_id !== template_id) return q;
    const newOrdre = orderedIds.indexOf(q.id);
    return newOrdre >= 0 ? { ...q, ordre: newOrdre + 1 } : q;
  });

  await supabase.from('organizations').update({ sp_questions: reordered }).eq('id', user.id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create `sp-variables/route.ts`**

```typescript
// app/api/templates/[id]/sp-variables/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WordConfig } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

const SP_STANDARD_VARIABLES = [
  'sp_economie_mensuelle', 'sp_economie_annuelle', 'sp_total_actuel', 'sp_total_propose',
  'sp_ameliorations', 'sp_fournisseur_propose', 'sp_nb_lignes', 'sp_est_economie',
  'sp_adresse_facturation', 'sp_adresse_facturation_rue', 'sp_adresse_facturation_cp',
  'sp_adresse_facturation_ville', 'sp_adresse_livraison', 'sp_adresse_livraison_rue',
  'sp_adresse_livraison_cp', 'sp_adresse_livraison_ville', 'sp_livraison_identique',
];

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('file_config')
    .eq('id', id)
    .single();

  const cfg = (template?.file_config ?? {}) as WordConfig;
  const custom = cfg.spVariablesCustom ?? [];

  return NextResponse.json({ standard: SP_STANDARD_VARIABLES, custom });
}
```

- [ ] **Step 5: Create `sa-variables/route.ts`**

```typescript
// app/api/templates/[id]/sa-variables/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('champs_actifs')
    .eq('id', id)
    .single();

  return NextResponse.json({ variables: template?.champs_actifs ?? [] });
}
```

Note: `uuid` package may need installing. Check: `grep -r "from 'uuid'" app/` — if not present, use `crypto.randomUUID()` instead.

- [ ] **Step 6: Check for uuid usage and adjust if needed**

```bash
grep -r "from 'uuid'" /c/Users/ilan/CascadeProjects/Saas_propal/app/ | head -5
```

If not found, replace `import { v4 as uuidv4 } from 'uuid'` + `uuidv4()` with `crypto.randomUUID()` in sp-questions/route.ts.

- [ ] **Step 7: Commit**

```bash
git add app/api/templates/[id]/sp-questions/ app/api/templates/[id]/sp-variables/ app/api/templates/[id]/sa-variables/ app/api/catalogue/categories/ app/api/catalogue/fournisseurs/
git commit -m "feat(api): add SP questions, sp-variables, sa-variables, catalogue endpoints"
```

---

### Task 7: Modify `app/api/propositions/[id]/update/route.ts`

**Files:**
- Modify: `app/api/propositions/[id]/update/route.ts`

- [ ] **Step 1: Add the two new allowed fields**

After the existing `if (body.statut !== undefined)` block (around line 49), add:

```typescript
    if (body.suggestions_sp_completes !== undefined) {
      updateData.suggestions_sp_completes = body.suggestions_sp_completes;
    }
    if (body.sp_reponses !== undefined) {
      updateData.sp_reponses = body.sp_reponses;
    }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/propositions/[id]/update/route.ts
git commit -m "feat(api): accept suggestions_sp_completes and sp_reponses in update endpoint"
```

---

### Task 8: Modify `app/api/propositions/generer-suggestions/route.ts`

**Files:**
- Modify: `app/api/propositions/generer-suggestions/route.ts`

This is a significant extension. We need to:
1. Accept `sp_questions_reponses` + address/preference fields from body
2. Build a new enriched SP prompt with the 3 ABSOLUTE RULES
3. Post-process raw IA response into `SuggestionsSpCompletes`
4. Save `suggestions_sp_completes` to DB

- [ ] **Step 1: Add SP types import at top**

Add after existing imports:
```typescript
import type { SuggestionsSpCompletes, SpLigneMobile, SpLigneFixe, SpInternet, SpMateriel, SpQuestionReponse, SpAdresse, WordConfig } from '@/types';
```

- [ ] **Step 2: Add formatting helpers**

Add before the `POST` function:

```typescript
function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function buildSpLigne(raw: Record<string, unknown>): Omit<SpLigneMobile, 'sp_type_ligne'> {
  const prixActuel = typeof raw._prix_actuel_raw === 'number' ? raw._prix_actuel_raw : 0;
  const prixPropose = typeof raw._prix_propose_raw === 'number' ? raw._prix_propose_raw : prixActuel;
  const economie = prixActuel - prixPropose;
  return {
    sp_nom_ligne: String(raw.sp_nom_ligne ?? ''),
    sp_produit: String(raw.sp_produit ?? 'Aucun produit semblable trouvé'),
    sp_produit_id: typeof raw.sp_produit_id === 'string' ? raw.sp_produit_id : undefined,
    sp_produit_fournisseur: typeof raw.sp_produit_fournisseur === 'string' ? raw.sp_produit_fournisseur : undefined,
    sp_prix_actuel: formatEuro(prixActuel),
    sp_prix_propose: formatEuro(prixPropose),
    sp_economie: formatEuro(economie),
    sp_analyse: String(raw.sp_analyse ?? ''),
    sp_justification: String(raw.sp_justification ?? ''),
    _prix_actuel_raw: prixActuel,
    _prix_propose_raw: prixPropose,
    _economie_raw: economie,
  };
}

function buildSpMateriel(raw: Record<string, unknown>): SpMateriel {
  const prix = typeof raw._prix_mensuel_raw === 'number' ? raw._prix_mensuel_raw : 0;
  return {
    sp_materiel_nom: String(raw.sp_materiel_nom ?? ''),
    sp_materiel_ref: typeof raw.sp_materiel_ref === 'string' ? raw.sp_materiel_ref : undefined,
    sp_materiel_prix_mensuel: formatEuro(prix),
    sp_materiel_duree_engagement: String(raw.sp_materiel_duree_engagement ?? ''),
    sp_materiel_commentaire: String(raw.sp_materiel_commentaire ?? ''),
    sp_materiel_produit_id: typeof raw.sp_materiel_produit_id === 'string' ? raw.sp_materiel_produit_id : undefined,
    sp_materiel_fournisseur: typeof raw.sp_materiel_fournisseur === 'string' ? raw.sp_materiel_fournisseur : undefined,
    sp_type_ligne: 'Materiel',
    _prix_mensuel_raw: prix,
  };
}

function buildSpCompletes(
  raw: Record<string, unknown>,
  baseResult: SuggestionResult,
  adresseFacturation: SpAdresse | undefined,
  adresseLivraison: SpAdresse | null | undefined,
  livraisonIdentique: boolean,
  wordCfg: WordConfig,
): SuggestionsSpCompletes {
  const rawMobiles = Array.isArray(raw.sp_lignes_mobiles) ? raw.sp_lignes_mobiles as Record<string, unknown>[] : [];
  const rawFixes = Array.isArray(raw.sp_lignes_fixes) ? raw.sp_lignes_fixes as Record<string, unknown>[] : [];
  const rawInternet = Array.isArray(raw.sp_internet) ? raw.sp_internet as Record<string, unknown>[] : [];
  const rawMateriel = Array.isArray(raw.sp_materiel) ? raw.sp_materiel as Record<string, unknown>[] : [];

  const sp_lignes_mobiles: SpLigneMobile[] = rawMobiles.map((r) => ({ ...buildSpLigne(r), sp_type_ligne: 'Mobile' as const }));
  const sp_lignes_fixes: SpLigneFixe[] = rawFixes.map((r) => ({ ...buildSpLigne(r), sp_type_ligne: 'Fixe' as const }));
  const sp_internet: SpInternet[] = rawInternet.map((r) => ({ ...buildSpLigne(r), sp_type_ligne: 'Internet' as const }));
  const sp_materiel: SpMateriel[] = rawMateriel.map(buildSpMateriel);

  const toutes = [...sp_lignes_mobiles, ...sp_lignes_fixes, ...sp_internet];
  const economieTotale = toutes.reduce((s, l) => s + l._economie_raw, 0);
  const totalActuel = toutes.reduce((s, l) => s + l._prix_actuel_raw, 0);
  const totalPropose = toutes.reduce((s, l) => s + l._prix_propose_raw, 0);

  const sp_fixes_mobiles = [...sp_lignes_fixes, ...sp_lignes_mobiles];
  const sp_fixes_mobiles_internet = [...sp_lignes_fixes, ...sp_lignes_mobiles, ...sp_internet];
  const sp_tout = [...toutes, ...sp_materiel];

  const result: SuggestionsSpCompletes = {
    ...baseResult,
    sp_fournisseur_propose: typeof raw.sp_fournisseur_propose === 'string' ? raw.sp_fournisseur_propose : undefined,
    sp_adresse_facturation: adresseFacturation,
    sp_adresse_livraison: livraisonIdentique ? undefined : adresseLivraison,
    sp_livraison_identique: livraisonIdentique,
    sp_lignes_mobiles,
    sp_lignes_fixes,
    sp_internet,
    sp_materiel,
    sp_fixes_mobiles,
    sp_fixes_mobiles_internet,
    sp_toutes_lignes: toutes,
    sp_tout,
    sp_economie_mensuelle: formatEuro(economieTotale),
    sp_economie_annuelle: formatEuro(economieTotale * 12),
    sp_total_actuel: formatEuro(totalActuel),
    sp_total_propose: formatEuro(totalPropose),
    sp_ameliorations: typeof raw.sp_ameliorations === 'string' ? raw.sp_ameliorations : '',
    sp_nb_lignes: String(toutes.length),
    sp_est_economie: economieTotale > 0 ? 'Oui' : 'Non',
  };

  // Custom tableaux fusionnés from template config
  if (wordCfg.spTableauxFusionnes) {
    for (const fusion of wordCfg.spTableauxFusionnes) {
      const items: unknown[] = [];
      const map: Record<string, unknown[]> = {
        mobiles: sp_lignes_mobiles,
        fixes: sp_lignes_fixes,
        internet: sp_internet,
        materiel: sp_materiel,
      };
      for (const cat of fusion.categories) {
        items.push(...(map[cat] ?? []));
      }
      result[fusion.id] = items;
    }
  }

  return result;
}
```

- [ ] **Step 3: Update the POST handler body parsing**

Replace the existing body destructuring:
```typescript
const { situation_actuelle, catalogue, preferences, proposition_id } = body ?? {};
```
with:
```typescript
const {
  situation_actuelle,
  catalogue,
  preferences,
  proposition_id,
  sp_questions_reponses,
  force_regenerate,
} = body ?? {};

const fournisseur_prefere: string | undefined = preferences?.fournisseur_prefere;
const proposer_materiel: boolean = preferences?.proposer_materiel === true;
const adresse_facturation: SpAdresse | undefined = preferences?.adresse_facturation;
const adresse_livraison: SpAdresse | null | undefined = preferences?.adresse_livraison;
const livraison_identique: boolean = preferences?.livraison_identique === true;
const spReponses: SpQuestionReponse[] = Array.isArray(sp_questions_reponses) ? sp_questions_reponses : [];
```

- [ ] **Step 4: Skip cache if `force_regenerate` is true**

In the existing early-return cache block, add `&& !force_regenerate` condition:
```typescript
if (proposition.suggestions_generees && !force_regenerate) {
  return NextResponse.json(proposition.suggestions_generees);
}
```

- [ ] **Step 5: Replace the prompt with the new SP-aware version**

Replace the existing `const prompt = ...` with:

```typescript
    const reponsesSummary = spReponses.length > 0
      ? `\nRÉPONSES AUX QUESTIONS SP:\n${JSON.stringify(spReponses, null, 2)}`
      : '';

    const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle et génère une proposition complète.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle ?? {}, null, 2)}

LIGNES À ANALYSER (${lignesAAnalyser.length} éléments, ordre imposé):
${JSON.stringify(lignesAAnalyser, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}
${reponsesSummary}
${fournisseur_prefere ? `\nFOURNISSEUR PRÉFÉRÉ: ${fournisseur_prefere}` : ''}

RÈGLE ABSOLUE 1 — PRODUITS:
- Tu ne peux proposer QUE des produits qui existent dans NOTRE CATALOGUE avec leur ID exact.
- Si aucun produit du catalogue ne convient: produit_propose_nom = "Aucun produit semblable trouvé", produit_propose_id = null, prix_propose = prix_actuel, economie_mensuelle = 0
- INTERDICTION ABSOLUE de reprendre un produit de la situation actuelle ou d'inventer un produit.

RÈGLE ABSOLUE 2 — FOURNISSEUR:
- ${fournisseur_prefere ? `Fournisseur préféré: ${fournisseur_prefere}. Privilégier ses produits EN PRIORITÉ.` : 'Aucun fournisseur préféré spécifié.'}
- Si aucun produit du fournisseur préféré ne convient: retourner "Aucun produit semblable trouvé".

RÈGLE ABSOLUE 3 — MATÉRIEL:
- N'inclure sp_materiel QUE si proposer_materiel = ${proposer_materiel}.
- Le matériel doit venir du catalogue (catégorie equipement) uniquement.

INSTRUCTIONS:
1. Pour chaque ligne dans LIGNES À ANALYSER (même ordre), une entrée dans "suggestions".
2. Catégoriser chaque ligne: Mobile, Fixe, Internet selon son type.
3. Retourner aussi les tableaux sp_lignes_mobiles, sp_lignes_fixes, sp_internet${proposer_materiel ? ', sp_materiel' : ''}.
4. Utiliser les _raw pour les nombres (non formatés), ex: _prix_actuel_raw: 29.9

RETOURNE UN JSON (UNIQUEMENT le JSON, sans markdown):
{
  "suggestions": [{"ligne_actuelle": {...}, "produit_propose_id": "uuid", "produit_propose_nom": "...", "prix_actuel": 0, "prix_propose": 0, "economie_mensuelle": 0, "justification": "..."}],
  "synthese": {"cout_total_actuel": 0, "cout_total_propose": 0, "economie_mensuelle": 0, "economie_annuelle": 0, "ameliorations": ["..."]},
  "sp_lignes_mobiles": [{"sp_nom_ligne": "...", "sp_produit": "...", "sp_produit_id": "uuid", "sp_produit_fournisseur": "...", "sp_type_ligne": "Mobile", "_prix_actuel_raw": 0, "_prix_propose_raw": 0, "_economie_raw": 0, "sp_analyse": "...", "sp_justification": "..."}],
  "sp_lignes_fixes": [],
  "sp_internet": [],
  ${proposer_materiel ? '"sp_materiel": [{"sp_materiel_nom": "...", "sp_materiel_ref": "...", "sp_materiel_produit_id": "uuid", "sp_materiel_fournisseur": "...", "sp_type_ligne": "Materiel", "_prix_mensuel_raw": 0, "sp_materiel_duree_engagement": "...", "sp_materiel_commentaire": "..."}],' : ''}
  "sp_fournisseur_propose": "...",
  "sp_ameliorations": "..."
}`;
```

- [ ] **Step 6: Update post-processing to build SP completes**

After `const normalized = normalizeResult(result, lignesAAnalyser, catalogue);`, add:

```typescript
    // Build SP completes if the raw result has SP data
    let suggestionsSpCompletes: SuggestionsSpCompletes | null = null;
    const rawResult = isPlainObject(result) ? result as Record<string, unknown> : {};
    if (rawResult.sp_lignes_mobiles || rawResult.sp_lignes_fixes || rawResult.sp_internet) {
      // Fetch template config for spTableauxFusionnes
      let wordCfg: WordConfig = { formatVariables: '', fieldMappings: {} };
      if (typeof proposition_id === 'string' && proposition_id.length > 0) {
        const { data: prop } = await supabase
          .from('propositions')
          .select('template_id')
          .eq('id', proposition_id)
          .single();
        if (prop?.template_id) {
          const { data: tmpl } = await supabase
            .from('proposition_templates')
            .select('file_config')
            .eq('id', prop.template_id)
            .single();
          wordCfg = ((tmpl?.file_config ?? {}) as WordConfig);
        }
      }
      suggestionsSpCompletes = buildSpCompletes(
        rawResult,
        normalized,
        adresse_facturation,
        adresse_livraison,
        livraison_identique,
        wordCfg,
      );
    }
```

- [ ] **Step 7: Update the Supabase save block**

Replace the existing update block:
```typescript
    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const updatePayload: Record<string, unknown> = { suggestions_generees: normalized };
      if (suggestionsSpCompletes) {
        updatePayload.suggestions_sp_completes = suggestionsSpCompletes;
      }
      await supabase.from('propositions').update(updatePayload).eq('id', proposition_id).eq('organization_id', user.id);
    }

    return NextResponse.json(suggestionsSpCompletes ?? normalized);
```

- [ ] **Step 8: Commit**

```bash
git add app/api/propositions/generer-suggestions/route.ts
git commit -m "feat(api): enhance generer-suggestions with SP data generation"
```

---

### Task 9: Create `components/propositions/Step5SpQuestions.tsx`

**Files:**
- Create: `components/propositions/Step5SpQuestions.tsx`

This is the chat-style interface. For brevity we build a functional MVP that:
- Loads SP questions for the selected template
- Displays them as a conversational flow
- Collects answers
- Shows a "Générer la SP" button once obligatory questions are answered

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, User, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PropositionData } from './PropositionWizard';
import type { SpQuestion, SpQuestionReponse, SpAdresse, SuggestionsSpCompletes, CatalogueProduit } from '@/types';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

type MessageBubble =
  | { from: 'bot'; text: string; questionId?: string }
  | { from: 'user'; text: string };

function formatReponseText(valeur: SpQuestionReponse['valeur']): string {
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (Array.isArray(valeur)) return valeur.join(', ');
  if (typeof valeur === 'object' && valeur !== null) {
    const a = valeur as SpAdresse;
    return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`].filter(Boolean).join(', ');
  }
  return String(valeur);
}

export function Step5SpQuestions({ propositionData, updatePropositionData, onNext, onPrev }: Props) {
  const [questions, setQuestions] = useState<SpQuestion[]>([]);
  const [reponses, setReponses] = useState<SpQuestionReponse[]>(propositionData.sp_reponses ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [messages, setMessages] = useState<MessageBubble[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [adresseEdit, setAdresseEdit] = useState<SpAdresse>({ adresse: '', code_postal: '', ville: '' });
  const [editingAdresse, setEditingAdresse] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const templateId = propositionData.template_id;

  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}/sp-questions`)
      .then((r) => r.json())
      .then((d) => {
        const qs: SpQuestion[] = (d.questions ?? []).filter((q: SpQuestion) => q.actif).sort((a: SpQuestion, b: SpQuestion) => a.ordre - b.ordre);
        setQuestions(qs);
      });
    fetch('/api/catalogue/fournisseurs').then((r) => r.json()).then((d) => setFournisseurs(d.fournisseurs ?? []));
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.produits ?? []));
  }, [templateId]);

  useEffect(() => {
    if (questions.length > 0 && messages.length === 0) {
      showNextQuestion(0);
    }
  }, [questions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const showNextQuestion = (idx: number) => {
    if (idx >= questions.length) return;
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setCurrentIdx(idx);
      setMessages((prev) => [...prev, { from: 'bot', text: questions[idx].libelle, questionId: questions[idx].id }]);
    }, 500);
  };

  const recordAnswer = (questionId: string, valeur: SpQuestionReponse['valeur']) => {
    const rep: SpQuestionReponse = { question_id: questionId, valeur };
    const next = reponses.filter((r) => r.question_id !== questionId).concat(rep);
    setReponses(next);
    updatePropositionData({ sp_reponses: next });
    setMessages((prev) => [...prev, { from: 'user', text: formatReponseText(valeur) }]);
    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) showNextQuestion(nextIdx);
  };

  const currentQuestion = questions[currentIdx];
  const allObligatoryAnswered = questions
    .filter((q) => q.obligatoire)
    .every((q) => reponses.some((r) => r.question_id === q.id));
  const allAnswered = currentIdx >= questions.length;

  const handleGenerateSP = async () => {
    setIsGenerating(true);
    try {
      // Find address answers from reponses
      const factQ = reponses.find((r) => questions.find((q) => q.id === r.question_id && (q.affichage === 'adresse_complete' || q.affichage === 'edition_sa')));
      const fournisseurQ = reponses.find((r) => questions.find((q) => q.id === r.question_id && typeof r.valeur === 'string' && (r.valeur as string).length < 60));
      const materielQ = reponses.find((r) => r.valeur === true || r.valeur === 'Oui');

      const body = {
        situation_actuelle: propositionData.donnees_extraites ?? {},
        catalogue,
        proposition_id: propositionData.proposition_id,
        force_regenerate: true,
        sp_questions_reponses: reponses,
        preferences: {
          fournisseur_prefere: fournisseurQ ? String(fournisseurQ.valeur) : undefined,
          proposer_materiel: materielQ !== undefined,
          adresse_facturation: factQ ? factQ.valeur as SpAdresse : undefined,
          livraison_identique: true,
        },
      };

      const res = await fetch('/api/propositions/generer-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Erreur génération SP');
      const data = await res.json() as SuggestionsSpCompletes;
      updatePropositionData({ suggestions_sp_completes: data });
      onNext();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
        <p className="text-gray-500">Aucune question SP configurée pour ce template.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev}>Précédent</Button>
          <Button onClick={onNext}>Continuer sans SP</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Situation Proposée</h2>
        <p className="text-gray-600">Répondez aux questions pour paramétrer la proposition.</p>
      </div>

      {/* Chat history */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 min-h-64 max-h-96 overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from === 'bot' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div className={`max-w-sm px-3 py-2 rounded-lg text-sm ${msg.from === 'bot' ? 'bg-white border border-gray-200 text-gray-800' : 'bg-blue-600 text-white'}`}>
              {msg.text}
            </div>
            {msg.from === 'user' && (
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-green-600" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex gap-1">
                {[0,1,2].map((i) => <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Current question input */}
      {!allAnswered && currentQuestion && !isTyping && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">{currentQuestion.libelle}</p>
          {currentQuestion.description && <p className="text-xs text-blue-700">{currentQuestion.description}</p>}

          {/* Buttons choice */}
          {(currentQuestion.affichage === 'boutons_choix_unique' || currentQuestion.affichage === 'oui_non') && (
            <div className="flex flex-wrap gap-2">
              {currentQuestion.affichage === 'oui_non'
                ? ['Oui', 'Non'].map((opt) => (
                    <Button key={opt} size="sm" variant="outline" onClick={() => recordAnswer(currentQuestion.id, opt === 'Oui')}>{opt}</Button>
                  ))
                : (currentQuestion.options_manuelles ?? fournisseurs).map((opt) => (
                    <Button key={opt} size="sm" variant="outline" onClick={() => recordAnswer(currentQuestion.id, opt)}>{opt}</Button>
                  ))
              }
            </div>
          )}

          {/* Text input */}
          {(currentQuestion.affichage === 'texte_court' || currentQuestion.affichage === 'liste_deroulante') && (
            <div className="flex gap-2">
              <Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Votre réponse..." onKeyDown={(e) => { if (e.key === 'Enter' && inputValue.trim()) { recordAnswer(currentQuestion.id, inputValue.trim()); setInputValue(''); } }} />
              <Button size="sm" onClick={() => { if (inputValue.trim()) { recordAnswer(currentQuestion.id, inputValue.trim()); setInputValue(''); } }}>Valider</Button>
            </div>
          )}

          {/* Address */}
          {(currentQuestion.affichage === 'adresse_complete' || currentQuestion.affichage === 'edition_sa') && (
            <div className="space-y-2">
              <Input placeholder="Adresse" value={adresseEdit.adresse} onChange={(e) => setAdresseEdit((p) => ({ ...p, adresse: e.target.value }))} />
              <div className="flex gap-2">
                <Input placeholder="Code postal" value={adresseEdit.code_postal} onChange={(e) => setAdresseEdit((p) => ({ ...p, code_postal: e.target.value }))} />
                <Input placeholder="Ville" value={adresseEdit.ville} onChange={(e) => setAdresseEdit((p) => ({ ...p, ville: e.target.value }))} />
              </div>
              <Button size="sm" onClick={() => { if (adresseEdit.adresse && adresseEdit.code_postal && adresseEdit.ville) { recordAnswer(currentQuestion.id, adresseEdit); setAdresseEdit({ adresse: '', code_postal: '', ville: '' }); } }}>Valider</Button>
            </div>
          )}
        </div>
      )}

      {/* Generate button */}
      {(allAnswered || allObligatoryAnswered) && (
        <div className="border border-green-200 rounded-lg bg-green-50 p-4 space-y-3">
          <p className="font-medium text-green-900">Toutes les questions obligatoires ont été répondues.</p>
          <Button onClick={handleGenerateSP} disabled={isGenerating} className="bg-green-600 hover:bg-green-700">
            {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération en cours...</> : <><ChevronRight className="w-4 h-4 mr-2" />Générer la Situation Proposée</>}
          </Button>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/propositions/Step5SpQuestions.tsx
git commit -m "feat(wizard): add Step5SpQuestions chat interface"
```

---

### Task 10: Create `components/propositions/Step5EditSp.tsx`

**Files:**
- Create: `components/propositions/Step5EditSp.tsx`

This editable view of SP data (shown after generation). MVP implementation with inline editing of lines.

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PropositionData } from './PropositionWizard';
import type { SuggestionsSpCompletes, SpLigneMobile, SpLigneFixe, SpInternet, SpMateriel } from '@/types';

interface Props {
  propositionData: Partial<PropositionData>;
  updatePropositionData: (data: Partial<PropositionData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

type AnyLigne = SpLigneMobile | SpLigneFixe | SpInternet;

function LigneRow({ ligne, onChange, onDelete }: { ligne: AnyLigne; onChange: (l: AnyLigne) => void; onDelete: () => void }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-2 py-1"><Input value={ligne.sp_nom_ligne} onChange={(e) => onChange({ ...ligne, sp_nom_ligne: e.target.value })} className="h-7 text-xs" /></td>
      <td className="px-2 py-1"><Input value={ligne.sp_produit} onChange={(e) => onChange({ ...ligne, sp_produit: e.target.value })} className="h-7 text-xs" /></td>
      <td className="px-2 py-1 text-xs text-gray-600">{ligne.sp_prix_actuel}</td>
      <td className="px-2 py-1"><Input value={ligne.sp_prix_propose} onChange={(e) => onChange({ ...ligne, sp_prix_propose: e.target.value })} className="h-7 text-xs" /></td>
      <td className="px-2 py-1 text-xs text-green-700 font-medium">{ligne.sp_economie}</td>
      <td className="px-2 py-1 text-xs text-gray-500 max-w-xs truncate">{ligne.sp_analyse}</td>
      <td className="px-2 py-1">
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-6 w-6 p-0 text-red-500 hover:text-red-700"><Trash2 className="w-3 h-3" /></Button>
      </td>
    </tr>
  );
}

const TABLE_HEADERS = ['Ligne', 'Produit proposé', 'Prix actuel', 'Prix proposé', 'Économie', 'Analyse', ''];

export function Step5EditSp({ propositionData, updatePropositionData, onNext, onPrev }: Props) {
  const [sp, setSp] = useState<SuggestionsSpCompletes | null>(propositionData.suggestions_sp_completes ?? null);
  const [isSaving, setIsSaving] = useState(false);

  const updateSp = useCallback((patch: Partial<SuggestionsSpCompletes>) => {
    setSp((prev) => prev ? { ...prev, ...patch } : prev);
  }, []);

  const handleValidate = async () => {
    if (!sp || !propositionData.proposition_id) { onNext(); return; }
    setIsSaving(true);
    try {
      await fetch(`/api/propositions/${propositionData.proposition_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions_sp_completes: sp }),
      });
      updatePropositionData({ suggestions_sp_completes: sp });
      onNext();
    } finally {
      setIsSaving(false);
    }
  };

  if (!sp) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Étape 5b : Validation SP</h2>
        <p className="text-gray-500">Aucune donnée SP générée.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev}>Précédent</Button>
          <Button onClick={onNext}>Continuer</Button>
        </div>
      </div>
    );
  }

  const renderLigneTable = (lignes: AnyLigne[], title: string, onUpdate: (ls: AnyLigne[]) => void) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{title} ({lignes.length})</h3>
        <Button size="sm" variant="outline" onClick={() => onUpdate([...lignes, { sp_nom_ligne: '', sp_produit: '', sp_prix_actuel: '', sp_prix_propose: '', sp_economie: '', sp_analyse: '', sp_justification: '', sp_type_ligne: lignes[0]?.sp_type_ligne ?? 'Mobile', _prix_actuel_raw: 0, _prix_propose_raw: 0, _economie_raw: 0 } as AnyLigne])}>
          <Plus className="w-3 h-3 mr-1" />Ajouter
        </Button>
      </div>
      {lignes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50">{TABLE_HEADERS.map((h) => <th key={h} className="px-2 py-1 text-left text-xs font-medium text-gray-600">{h}</th>)}</tr></thead>
            <tbody>{lignes.map((l, i) => <LigneRow key={i} ligne={l} onChange={(updated) => { const next = [...lignes]; next[i] = updated; onUpdate(next); }} onDelete={() => onUpdate(lignes.filter((_, j) => j !== i))} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Étape 5 : Validation de la Situation Proposée</h2>
        <p className="text-gray-600">Vérifiez et ajustez les propositions avant de générer le document.</p>
      </div>

      {/* Synthèse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Économie mensuelle', value: sp.sp_economie_mensuelle },
          { label: 'Économie annuelle', value: sp.sp_economie_annuelle },
          { label: 'Total actuel', value: sp.sp_total_actuel },
          { label: 'Total proposé', value: sp.sp_total_propose },
        ].map(({ label, value }) => (
          <div key={label} className="border border-gray-200 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Tableaux */}
      <div className="space-y-6">
        {renderLigneTable(sp.sp_lignes_mobiles as AnyLigne[], 'Lignes mobiles', (ls) => updateSp({ sp_lignes_mobiles: ls as SpLigneMobile[] }))}
        {renderLigneTable(sp.sp_lignes_fixes as AnyLigne[], 'Lignes fixes', (ls) => updateSp({ sp_lignes_fixes: ls as SpLigneFixe[] }))}
        {renderLigneTable(sp.sp_internet as AnyLigne[], 'Internet', (ls) => updateSp({ sp_internet: ls as SpInternet[] }))}
      </div>

      {/* Matériel */}
      {sp.sp_materiel.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-900">Matériel ({sp.sp_materiel.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">{['Nom', 'Référence', 'Prix mensuel', 'Durée engagement', 'Commentaire', ''].map((h) => <th key={h} className="px-2 py-1 text-left text-xs font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {sp.sp_materiel.map((m, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-2 py-1"><Input value={m.sp_materiel_nom} onChange={(e) => { const next = [...sp.sp_materiel]; next[i] = { ...m, sp_materiel_nom: e.target.value }; updateSp({ sp_materiel: next }); }} className="h-7 text-xs" /></td>
                    <td className="px-2 py-1"><Input value={m.sp_materiel_ref ?? ''} onChange={(e) => { const next = [...sp.sp_materiel]; next[i] = { ...m, sp_materiel_ref: e.target.value }; updateSp({ sp_materiel: next }); }} className="h-7 text-xs" /></td>
                    <td className="px-2 py-1 text-xs">{m.sp_materiel_prix_mensuel}</td>
                    <td className="px-2 py-1"><Input value={m.sp_materiel_duree_engagement} onChange={(e) => { const next = [...sp.sp_materiel]; next[i] = { ...m, sp_materiel_duree_engagement: e.target.value }; updateSp({ sp_materiel: next }); }} className="h-7 text-xs" /></td>
                    <td className="px-2 py-1"><Input value={m.sp_materiel_commentaire} onChange={(e) => { const next = [...sp.sp_materiel]; next[i] = { ...m, sp_materiel_commentaire: e.target.value }; updateSp({ sp_materiel: next }); }} className="h-7 text-xs" /></td>
                    <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => updateSp({ sp_materiel: sp.sp_materiel.filter((_, j) => j !== i) })} className="h-6 w-6 p-0 text-red-500"><Trash2 className="w-3 h-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onPrev}>Précédent</Button>
        <Button onClick={handleValidate} disabled={isSaving}>
          {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sauvegarde...</> : <><ChevronRight className="w-4 h-4 mr-2" />Valider la SP</>}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/propositions/Step5EditSp.tsx
git commit -m "feat(wizard): add Step5EditSp editor"
```

---

### Task 11: Modify `PropositionWizard.tsx` — 6 steps + Step4 cleanup

**Files:**
- Modify: `components/propositions/PropositionWizard.tsx`
- Modify: `components/propositions/Step4EditData.tsx` (remove "Générer SP" button)
- Modify: `app/(client)/propositions/[id]/resume/page.tsx` (update step inference)

- [ ] **Step 1: Update PropositionWizard.tsx**

Replace STEPS array (line 13-19):
```typescript
const STEPS = [
  { id: 1, name: 'Template', description: 'Sélection' },
  { id: 2, name: 'Documents', description: 'Upload' },
  { id: 3, name: 'Extraction', description: 'IA' },
  { id: 4, name: 'Édition SA', description: 'Vérification' },
  { id: 5, name: 'Situation Proposée', description: 'IA + Validation' },
  { id: 6, name: 'Génération', description: 'Finalisation' },
];
```

Update `PropositionData` interface (lines 22-30):
```typescript
export interface PropositionData {
  template_id: string;
  nom_client?: string;
  documents_urls: string[];
  donnees_extraites: Record<string, unknown>;
  proposition_id?: string;
  copieurs_count?: number;
  suggestions_generees?: SuggestionsGenerees | null;
  suggestions_editees?: SuggestionsGenerees | null;
  suggestions_sp_completes?: SuggestionsSpCompletes | null;   // NEW
  sp_reponses?: SpQuestionReponse[];                          // NEW
}
```

Update imports at top:
```typescript
import { Step5SpQuestions } from './Step5SpQuestions';
import { Step5EditSp } from './Step5EditSp';
import type { SuggestionsGenerees, SuggestionsSpCompletes, SpQuestionReponse } from '@/types';
```

Update `nextStep`:
```typescript
  const nextStep = () => {
    if (currentStep < 6) {
      const next = currentStep + 1;
      setCurrentStep(next);
      persistProgress({ current_step: next, statut: 'draft' });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      persistProgress({ current_step: prev, statut: 'draft' });
    }
  };
```

Add the new step renderers after the existing `currentStep === 4` block:
```typescript
        {currentStep === 5 && (
          <div id="step5-sp-questions">
            {/* Skip SP for non-word templates */}
            {(() => {
              const tpl = templates.find((t) => t.id === propositionData.template_id);
              if (tpl?.file_type !== 'word') {
                // Auto-skip: show minimal pass-through
                return (
                  <div className="space-y-4">
                    <p className="text-gray-500">L&apos;étape SP est disponible uniquement pour les templates Word.</p>
                    <div className="flex gap-3">
                      <button onClick={prevStep} className="px-4 py-2 border rounded">Précédent</button>
                      <button onClick={nextStep} className="px-4 py-2 bg-green-600 text-white rounded">Continuer</button>
                    </div>
                  </div>
                );
              }
              // Show SP questions, then edit
              if (propositionData.suggestions_sp_completes) {
                return <Step5EditSp propositionData={propositionData} updatePropositionData={updatePropositionData} onNext={nextStep} onPrev={prevStep} />;
              }
              return <Step5SpQuestions propositionData={propositionData} updatePropositionData={updatePropositionData} onNext={() => {}} onPrev={prevStep} />;
            })()}
          </div>
        )}
        {currentStep === 6 && (
          <div id="btn-generate-proposition">
            <Step5Generate
              propositionData={propositionData}
              onComplete={handleComplete}
              onPrev={prevStep}
            />
          </div>
        )}
```

Remove the old `{currentStep === 5 && ... Step5Generate ...}` block.

- [ ] **Step 2: Search for "Générer SP" button in Step4EditData.tsx and remove it**

```bash
grep -n "Générer SP\|generer-suggestions\|Sparkles" /c/Users/ilan/CascadeProjects/Saas_propal/components/propositions/Step4EditData.tsx | head -20
```

Find the button and remove it from the JSX.

- [ ] **Step 3: Update resume/page.tsx step inference**

Change `Math.min(5, ...)` to `Math.min(6, ...)` and update `hasSuggestions` inference:

```typescript
  const hasSpCompletes = !!proposition.suggestions_sp_completes;
  
  let inferredStep = 1;
  if (hasSpCompletes) {
    inferredStep = 6;
  } else if (hasSuggestions) {
    inferredStep = 5;
  } else if (hasExtractedData || hasFilledData) {
    inferredStep = 4;
  } else if (hasDocuments) {
    inferredStep = 3;
  } else if (proposition.template_id) {
    inferredStep = 2;
  }
  // ...
  const initialStep = Math.max(1, Math.min(6, ...));
```

Also update `initialData` in the `<PropositionWizard>` call:
```typescript
initialData={{
  proposition_id: proposition.id,
  template_id: proposition.template_id || '',
  nom_client: proposition.nom_client || undefined,
  documents_urls,
  donnees_extraites: dataToEdit,
  suggestions_generees: proposition.suggestions_generees || null,
  suggestions_editees: proposition.suggestions_editees || null,
  suggestions_sp_completes: proposition.suggestions_sp_completes || null,   // NEW
  sp_reponses: proposition.sp_reponses || [],                               // NEW
}}
```

- [ ] **Step 4: Commit**

```bash
git add components/propositions/PropositionWizard.tsx components/propositions/Step4EditData.tsx app/'(client)'/propositions/[id]/resume/page.tsx
git commit -m "feat(wizard): extend to 6 steps with SP step 5"
```

---

### Task 12: Modify `components/templates/Step2UploadTemplate.tsx` — SP section

**Files:**
- Modify: `components/templates/Step2UploadTemplate.tsx`

Add a "Variables SP" section after the SA section, visible only when `file_type === 'word'`.

- [ ] **Step 1: Read the bottom of the file to find where SA variables are shown**

```bash
grep -n "variable\|Variable\|copier\|Copier" /c/Users/ilan/CascadeProjects/Saas_propal/components/templates/Step2UploadTemplate.tsx | head -30
```

- [ ] **Step 2: Add SP variables section**

After reading the file location, insert a new section. The section should:

- Only render if `templateData.file_type === 'word'` (or the current file type is Word)
- Show a list of SP simple variables with copy buttons
- Show SP table blocks with "Copier bloc" buttons
- Use the same UI pattern as the existing SA variables section

Add this as a new component/section after the SA variables:

```typescript
// SP Variables section — insert after SA variables section
{(fileType === 'word' || templateData.file_type === 'word') && (
  <div className="mt-6 border-t border-gray-200 pt-6">
    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
      Variables Situation Proposée (SP)
      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Word uniquement</span>
    </h3>

    {/* Simple variables */}
    <div className="space-y-2 mb-6">
      <p className="text-sm text-gray-600 font-medium">Variables simples</p>
      <div className="grid grid-cols-1 gap-1">
        {SP_SIMPLE_VARS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
            <div>
              <code className="text-xs text-blue-700 font-mono">{`{{${key}}}`}</code>
              <span className="text-xs text-gray-500 ml-2">{label}</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`{{${key}}}`)}
              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-0.5 border rounded"
            >Copier</button>
          </div>
        ))}
      </div>
    </div>

    {/* Table blocks */}
    <div className="space-y-4">
      <p className="text-sm text-gray-600 font-medium">Tableaux dynamiques</p>
      {SP_TABLE_BLOCKS.map((block) => (
        <div key={block.arrayId} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800">{block.label}</p>
            <button
              onClick={() => navigator.clipboard.writeText(block.fullBlock)}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 border border-blue-200 rounded"
            >Copier le bloc complet</button>
          </div>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto">{block.fullBlock}</pre>
        </div>
      ))}
    </div>
  </div>
)}
```

Add the SP variable data constants at the top of the component file (outside the component):

```typescript
const SP_SIMPLE_VARS = [
  { key: 'sp_economie_mensuelle', label: 'Économie mensuelle (ex: "45,00 €")' },
  { key: 'sp_economie_annuelle', label: 'Économie annuelle' },
  { key: 'sp_total_actuel', label: 'Total situation actuelle HT' },
  { key: 'sp_total_propose', label: 'Total situation proposée HT' },
  { key: 'sp_ameliorations', label: "Points clés de l'offre proposée" },
  { key: 'sp_fournisseur_propose', label: 'Fournisseur retenu' },
  { key: 'sp_nb_lignes', label: 'Nombre de lignes analysées' },
  { key: 'sp_est_economie', label: '"Oui" ou "Non"' },
  { key: 'sp_adresse_facturation', label: 'Adresse facturation complète' },
  { key: 'sp_adresse_facturation_rue', label: 'Rue facturation' },
  { key: 'sp_adresse_facturation_cp', label: 'Code postal facturation' },
  { key: 'sp_adresse_facturation_ville', label: 'Ville facturation' },
  { key: 'sp_adresse_livraison', label: 'Adresse livraison complète' },
  { key: 'sp_adresse_livraison_rue', label: 'Rue livraison' },
  { key: 'sp_adresse_livraison_cp', label: 'Code postal livraison' },
  { key: 'sp_adresse_livraison_ville', label: 'Ville livraison' },
  { key: 'sp_livraison_identique', label: '"Oui" ou "Non"' },
];

const SP_TABLE_BLOCKS = [
  {
    arrayId: 'sp_lignes_mobiles',
    label: 'Tableau lignes mobiles',
    fullBlock: `{{#sp_lignes_mobiles}}\n{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}\n{{/sp_lignes_mobiles}}`,
    fields: ['sp_nom_ligne', 'sp_produit', 'sp_prix_actuel', 'sp_prix_propose', 'sp_economie', 'sp_analyse', 'sp_justification', 'sp_type_ligne'],
  },
  {
    arrayId: 'sp_lignes_fixes',
    label: 'Tableau lignes fixes',
    fullBlock: `{{#sp_lignes_fixes}}\n{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}\n{{/sp_lignes_fixes}}`,
    fields: ['sp_nom_ligne', 'sp_produit', 'sp_prix_actuel', 'sp_prix_propose', 'sp_economie', 'sp_analyse', 'sp_justification', 'sp_type_ligne'],
  },
  {
    arrayId: 'sp_internet',
    label: 'Tableau Internet',
    fullBlock: `{{#sp_internet}}\n{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}\n{{/sp_internet}}`,
    fields: ['sp_nom_ligne', 'sp_produit', 'sp_prix_actuel', 'sp_prix_propose', 'sp_economie', 'sp_analyse', 'sp_justification', 'sp_type_ligne'],
  },
  {
    arrayId: 'sp_materiel',
    label: 'Tableau matériel',
    fullBlock: `{{#sp_materiel}}\n{{sp_materiel_nom}}  {{sp_materiel_ref}}  {{sp_materiel_prix_mensuel}}  {{sp_materiel_duree_engagement}}  {{sp_materiel_commentaire}}\n{{/sp_materiel}}`,
    fields: ['sp_materiel_nom', 'sp_materiel_ref', 'sp_materiel_prix_mensuel', 'sp_materiel_duree_engagement', 'sp_materiel_commentaire', 'sp_type_ligne'],
  },
];
```

- [ ] **Step 3: Commit**

```bash
git add components/templates/Step2UploadTemplate.tsx
git commit -m "feat(templates): add SP variables section in template config"
```

---

### Task 13: Create `components/settings/SpQuestionsManager.tsx`

**Files:**
- Create: `components/settings/SpQuestionsManager.tsx`

MVP: list templates, show questions per template, add/delete, no drag-and-drop yet (dnd can be added as enhancement).

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion } from '@/types';

interface Template { id: string; nom: string; file_type: string; }

interface Props {
  templates: Template[];
}

export function SpQuestionsManager({ templates }: Props) {
  const wordTemplates = templates.filter((t) => t.file_type === 'word');
  const [expanded, setExpanded] = useState<string | null>(wordTemplates[0]?.id ?? null);
  const [questionsByTemplate, setQuestionsByTemplate] = useState<Record<string, SpQuestion[]>>({});
  const [editingQuestion, setEditingQuestion] = useState<SpQuestion | null>(null);

  useEffect(() => {
    for (const t of wordTemplates) {
      fetch(`/api/templates/${t.id}/sp-questions`)
        .then((r) => r.json())
        .then((d) => {
          setQuestionsByTemplate((prev) => ({ ...prev, [t.id]: (d.questions ?? []).sort((a: SpQuestion, b: SpQuestion) => a.ordre - b.ordre) }));
        });
    }
  }, []);

  const deleteQuestion = async (templateId: string, qid: string) => {
    await fetch(`/api/templates/${templateId}/sp-questions/${qid}`, { method: 'DELETE' });
    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).filter((q) => q.id !== qid),
    }));
  };

  const toggleActive = async (templateId: string, q: SpQuestion) => {
    const updated = { ...q, actif: !q.actif };
    await fetch(`/api/templates/${templateId}/sp-questions/${q.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setQuestionsByTemplate((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((existing) => existing.id === q.id ? updated : existing),
    }));
  };

  if (wordTemplates.length === 0) {
    return <p className="text-gray-500 text-sm">Aucun template Word disponible. Créez d&apos;abord un template Word.</p>;
  }

  return (
    <div className="space-y-4">
      {wordTemplates.map((t) => {
        const questions = questionsByTemplate[t.id] ?? [];
        const isExpanded = expanded === t.id;

        return (
          <div key={t.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              onClick={() => setExpanded(isExpanded ? null : t.id)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-medium text-gray-900">{t.nom}</span>
                <span className="text-xs text-gray-500">({questions.length} question{questions.length !== 1 ? 's' : ''})</span>
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-gray-500">Aucune question configurée pour ce template.</p>
                )}
                {questions.map((q) => (
                  <div key={q.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg bg-white">
                    <button onClick={() => toggleActive(t.id, q)} className="mt-0.5 shrink-0">
                      {q.actif
                        ? <ToggleRight className="w-5 h-5 text-green-600" />
                        : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{q.libelle}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{q.source}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{q.affichage}</span>
                        {q.obligatoire && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">Obligatoire</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setEditingQuestion(q)} className="h-7 w-7 p-0">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteQuestion(t.id, q.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    /* TODO: open SpQuestionBuilder for this template */
                    alert(`Constructeur de questions pour ${t.nom} — à implémenter dans Task 14`);
                  }}
                  className="w-full mt-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une question
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/SpQuestionsManager.tsx
git commit -m "feat(settings): add SpQuestionsManager list view"
```

---

### Task 14: Create `components/settings/SpQuestionBuilder.tsx`

**Files:**
- Create: `components/settings/SpQuestionBuilder.tsx`

4-block wizard builder. MVP covers the main flows.

- [ ] **Step 1: Create the component (4-block builder)**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SpQuestion, SpQuestionSource, SpQuestionAffichage } from '@/types';

interface Props {
  templateId: string;
  onSaved: (q: SpQuestion) => void;
  onCancel: () => void;
  initial?: Partial<SpQuestion>;
}

type Block = 1 | 2 | 3 | 4;

const SOURCES: { value: SpQuestionSource; label: string; desc: string }[] = [
  { value: 'catalogue', label: 'Catalogue produits', desc: "L'IA utilise le catalogue pour proposer des choix" },
  { value: 'sa', label: 'Données SA extraites', desc: 'La question utilise les données de la situation actuelle' },
  { value: 'aucune', label: 'Aucune (saisie manuelle)', desc: "L'utilisateur saisit une réponse libre" },
  { value: 'catalogue_et_sa', label: 'Catalogue + SA combinés', desc: 'Combine les deux sources' },
];

const AFFICHAGE_BY_SOURCE: Record<SpQuestionSource, Array<{ value: SpQuestionAffichage; label: string }>> = {
  catalogue: [
    { value: 'boutons_choix_unique', label: 'Boutons choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons choix multiple' },
    { value: 'liste_deroulante', label: 'Liste déroulante' },
  ],
  sa: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'confirmation_sa', label: 'Confirmation (affiche valeur SA)' },
    { value: 'edition_sa', label: 'Édition (affiche et permet de modifier)' },
  ],
  aucune: [
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'texte_court', label: 'Texte court' },
    { value: 'texte_long', label: 'Texte long' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'choix_liste_manuelle', label: 'Choix dans une liste' },
    { value: 'adresse_complete', label: 'Adresse complète' },
  ],
  catalogue_et_sa: [
    { value: 'boutons_choix_unique', label: 'Boutons choix unique' },
    { value: 'boutons_choix_multiple', label: 'Boutons choix multiple' },
    { value: 'confirmation_sa', label: 'Confirmation (affiche valeur SA)' },
  ],
};

export function SpQuestionBuilder({ templateId, onSaved, onCancel, initial }: Props) {
  const [activeBlock, setActiveBlock] = useState<Block>(1);
  const [source, setSource] = useState<SpQuestionSource>(initial?.source ?? 'aucune');
  const [affichage, setAffichage] = useState<SpQuestionAffichage>(initial?.affichage ?? 'texte_court');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [obligatoire, setObligatoire] = useState(initial?.obligatoire ?? true);
  const [variableCible, setVariableCible] = useState(initial?.consequences?.[0]?.variable_cible ?? '');
  const [prioriteIa, setPrioriteIa] = useState<'normale' | 'haute'>(initial?.priorite_ia ?? 'normale');
  const [isSaving, setIsSaving] = useState(false);

  const availableAffichages = AFFICHAGE_BY_SOURCE[source] ?? AFFICHAGE_BY_SOURCE.aucune;

  const handleSave = async () => {
    if (!libelle.trim()) return;
    setIsSaving(true);
    try {
      const body: Partial<SpQuestion> = {
        libelle,
        description: description || undefined,
        source,
        affichage,
        obligatoire,
        priorite_ia: prioriteIa,
        actif: true,
        consequences: variableCible ? [{ type: 'renseigner_variable', variable_cible: variableCible }] : [],
        template_id: templateId,
        ordre: 0,
      };

      const res = await fetch(`/api/templates/${templateId}/sp-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) onSaved(data.question);
    } finally {
      setIsSaving(false);
    }
  };

  const blockComplete: Record<Block, boolean> = {
    1: !!source,
    2: true,
    3: !!affichage && !!libelle,
    4: true,
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {([1, 2, 3, 4] as Block[]).map((b) => (
          <button
            key={b}
            onClick={() => setActiveBlock(b)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeBlock === b ? 'bg-blue-600 text-white' : blockComplete[b] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
          >
            {b}. {['Source', 'Conditions', 'Affichage', 'Résultat'][b - 1]}
          </button>
        ))}
      </div>

      {/* BLOCK 1 — SOURCE */}
      {activeBlock === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Bloc 1 — Source</h3>
          <p className="text-sm text-gray-500">Qu&apos;est-ce que l&apos;IA utilise pour répondre à cette question ?</p>
          <div className="space-y-2">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                onClick={() => { setSource(s.value); setAffichage(AFFICHAGE_BY_SOURCE[s.value][0].value); }}
                className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${source === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="font-medium text-sm text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setActiveBlock(2)}>Suivant →</Button>
        </div>
      )}

      {/* BLOCK 2 — CONDITIONS */}
      {activeBlock === 2 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Bloc 2 — Conditions d&apos;affichage</h3>
          <p className="text-sm text-gray-500">Quand cette question s&apos;affiche-t-elle ?</p>
          <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-sm text-gray-600">✓ Toujours afficher (par défaut)</p>
            <p className="text-xs text-gray-400 mt-1">La configuration de conditions avancées est disponible après création.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(1)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(3)}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* BLOCK 3 — AFFICHAGE */}
      {activeBlock === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Bloc 3 — Affichage</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Type d&apos;affichage</label>
            <div className="grid grid-cols-2 gap-2">
              {availableAffichages.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAffichage(a.value)}
                  className={`text-left p-2 rounded-lg border text-xs transition-colors ${affichage === a.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Libellé de la question *</label>
            <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex: Quel fournisseur souhaitez-vous retenir ?" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description / aide (optionnel)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Aide contextuelle affichée sous la question..." rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="obligatoire" checked={obligatoire} onChange={(e) => setObligatoire(e.target.checked)} />
            <label htmlFor="obligatoire" className="text-sm text-gray-700">Question obligatoire</label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(2)}>← Précédent</Button>
            <Button size="sm" onClick={() => setActiveBlock(4)} disabled={!libelle.trim()}>Suivant →</Button>
          </div>
        </div>
      )}

      {/* BLOCK 4 — RÉSULTAT */}
      {activeBlock === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Bloc 4 — Résultat</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Variable SP renseignée</label>
            <Input
              value={variableCible}
              onChange={(e) => setVariableCible(e.target.value)}
              placeholder="ex: sp_fournisseur_propose"
            />
            <p className="text-xs text-gray-400">Doit commencer par sp_. Doit être présente dans votre template Word.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Priorité pour l&apos;IA</label>
            <div className="flex gap-2">
              {(['normale', 'haute'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPrioriteIa(p)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${prioriteIa === p ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700'}`}
                >
                  {p === 'normale' ? 'Normale' : 'Haute (IA doit en tenir compte absolument)'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setActiveBlock(3)}>← Précédent</Button>
            <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
            <Button size="sm" onClick={handleSave} disabled={!libelle.trim() || isSaving}>
              {isSaving ? 'Sauvegarde...' : 'Créer la question'}
            </Button>
          </div>
        </div>
      )}

      {/* Preview */}
      {libelle && (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-2">Aperçu</p>
          <p className="text-sm font-medium text-gray-900">{libelle}</p>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
          <div className="flex gap-1 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{source}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{affichage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire SpQuestionBuilder into SpQuestionsManager**

In `SpQuestionsManager.tsx`, replace the `alert(...)` call with a modal/inline builder:

```typescript
// Add state at top of SpQuestionsManager:
const [buildingForTemplate, setBuildingForTemplate] = useState<string | null>(null);

// Replace the alert in the "Ajouter une question" button onClick:
onClick={() => setBuildingForTemplate(t.id)}

// Add after the existing accordion list:
{buildingForTemplate && (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
      <h2 className="text-lg font-bold mb-4">Nouvelle question SP</h2>
      <SpQuestionBuilder
        templateId={buildingForTemplate}
        onSaved={(q) => {
          setQuestionsByTemplate((prev) => ({
            ...prev,
            [buildingForTemplate]: [...(prev[buildingForTemplate] ?? []), q],
          }));
          setBuildingForTemplate(null);
        }}
        onCancel={() => setBuildingForTemplate(null)}
      />
    </div>
  </div>
)}
```

Also add import: `import { SpQuestionBuilder } from './SpQuestionBuilder';`

- [ ] **Step 3: Commit**

```bash
git add components/settings/SpQuestionBuilder.tsx components/settings/SpQuestionsManager.tsx
git commit -m "feat(settings): add SpQuestionBuilder 4-block wizard"
```

---

### Task 15: Modify settings page to add SP Questions tab

**Files:**
- Modify: `components/client/SettingsPage.tsx` (the main client settings component)
- Modify: `app/(client)/settings/page.tsx` (fetch templates for SP manager)

- [ ] **Step 1: Find the settings page component**

```bash
grep -n "onglet\|tab\|Tab\|section" /c/Users/ilan/CascadeProjects/Saas_propal/components/client/SettingsPage.tsx | head -20
```

- [ ] **Step 2: Add SP Questions tab**

In the settings tabs/sections, add a new "Questions SP" tab that renders `<SpQuestionsManager templates={wordTemplates} />`.

The exact location depends on current structure, but typically add alongside existing tabs:

```typescript
// Import at top:
import { SpQuestionsManager } from '@/components/settings/SpQuestionsManager';

// Add tab definition (adapt to existing pattern):
{ id: 'sp-questions', label: 'Questions SP', icon: Bot }

// Add tab content:
{activeTab === 'sp-questions' && (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Constructeur de questions SP</h2>
      <p className="text-sm text-gray-500 mt-1">Configurez les questions posées lors de la génération de la Situation Proposée, par template.</p>
    </div>
    <SpQuestionsManager templates={templates} />
  </div>
)}
```

- [ ] **Step 3: Update settings page.tsx to pass templates**

In `app/(client)/settings/page.tsx`, the templates are already fetched. Pass them to the settings component:

```typescript
// Already fetching templates — make sure it selects file_type:
const { data: templates } = await supabase
  .from('proposition_templates')
  .select('id, nom, file_type, statut')
  .eq('organization_id', user.id)
  .order('created_at', { ascending: false });
```

Then pass to SettingsPage component (check existing props and add `templates` if not already there).

- [ ] **Step 4: Final TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -40
```

Fix any type errors found.

- [ ] **Step 5: Commit**

```bash
git add components/client/SettingsPage.tsx app/'(client)'/settings/page.tsx
git commit -m "feat(settings): add Questions SP tab with manager"
```

---

## Spec Coverage Check

| Spec Part | Task | Status |
|---|---|---|
| Part 1 — Types | Task 1 | ✅ |
| Part 2 — DB Migration | Task 2 | ✅ |
| Part 3 — sp-word-data.ts | Task 3 | ✅ |
| Part 4 — generators/index.ts | Task 4 | ✅ |
| Part 5 — generer-suggestions API | Task 8 | ✅ |
| Part 6 — Catalogue APIs | Task 5 | ✅ |
| Part 7 — Template SP APIs | Task 6 | ✅ |
| Part 8 — Update API | Task 7 | ✅ |
| Part 9 — Step5SpQuestions | Task 9 | ✅ |
| Part 10 — Step5EditSp | Task 10 | ✅ |
| Part 11 — Wizard 6 steps | Task 11 | ✅ |
| Part 12 — Template config SP | Task 12 | ✅ |
| Part 13 — SpQuestionBuilder | Task 14 | ✅ |
| Part 14 — SpQuestionsManager | Task 13 | ✅ |
| Part 15 — Settings page | Task 15 | ✅ |

## Notes & Deferred

- **Drag-and-drop** (SpQuestionsManager reorder): `@hello-pangea/dnd` integration deferred — the order API (Task 6) is ready, just needs DnD wrapper added to SpQuestionsManager.
- **Step5SpQuestions consequence evaluation** (afficher/masquer/aller questions based on answers): MVP shows all active questions linearly. Full conditional logic deferred.
- **SP variables custom in template config** (Part 9.3/9.4 custom variables form): Deferred — standard variables + table blocks covered. Custom variable builder (form to create SpVariableCustom) deferred to a follow-up.
- **Autosave every 30s**: The `persistProgress` in wizard already handles step saves. Adding a 30s interval timer can be added in PropositionWizard as a `useEffect` with `setInterval`.
