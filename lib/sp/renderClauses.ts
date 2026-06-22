import { evaluateGroupes } from '@/lib/sp/evaluateConditions';
import type {
  SpClauseConditionnelle,
  SpClauseCollection,
  SpCadeauLigne,
  SpMaterielDetail,
  SpQuestionReponse,
  CatalogueProduit,
  SuggestionsSpCompletes,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

/** Remplace les jetons `{cle}` par leur valeur. Les jetons inconnus sont laissés tels quels. */
function replaceTokens(texte: string, ctx: Record<string, string>): string {
  return texte.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in ctx ? ctx[key] : match,
  );
}

function joinNoms(rows: SpCadeauLigne[]): string {
  return rows.map((r) => r.sp_cadeau_nom).filter(Boolean).join(', ');
}

function getCadeaux(sp: SuggestionsSpCompletes | null): SpCadeauLigne[] {
  return (sp?.sp_cadeaux_table ?? []) as SpCadeauLigne[];
}

/** Renvoie les lignes d'une collection donnée. */
function resolveCollection(
  collection: SpClauseCollection | undefined,
  sp: SuggestionsSpCompletes | null,
): Array<Record<string, unknown>> {
  const cadeaux = getCadeaux(sp);
  switch (collection) {
    case 'cadeaux_tous':
      return cadeaux as unknown as Array<Record<string, unknown>>;
    case 'cadeaux_produits':
      return cadeaux.filter((c) => !c._libre) as unknown as Array<Record<string, unknown>>;
    case 'cadeaux_libres':
      return cadeaux.filter((c) => c._libre) as unknown as Array<Record<string, unknown>>;
    case 'materiel':
      return (sp?.sp_materiel_detail ?? []) as unknown as Array<Record<string, unknown>>;
    default:
      return [];
  }
}

/** Jetons pour un élément (mode par_element) selon la collection. */
function buildElementContext(
  collection: SpClauseCollection | undefined,
  row: Record<string, unknown>,
): Record<string, string> {
  const str = (v: unknown) => (v == null ? '' : String(v));
  if (collection === 'materiel') {
    const m = row as unknown as SpMaterielDetail;
    return {
      nom: str(m.sp_matd_nom),
      ref: str(m.sp_matd_ref),
      prix: str(m.sp_matd_prix_ht),
      montant: str(m.sp_matd_prix_ht),
      quantite: str(m.sp_matd_quantite),
      fournisseur: str(m.sp_matd_fournisseur),
    };
  }
  // cadeaux_* → SpCadeauLigne
  const c = row as unknown as SpCadeauLigne;
  return {
    nom: str(c.sp_cadeau_nom),
    denomination: str(c.sp_cadeau_nom),
    ref: str(c.sp_cadeau_ref),
    montant: str(c.sp_cadeau_valeur_ht),
    valeur: str(c.sp_cadeau_valeur_ht),
  };
}

/** Jetons globaux (mode global) : agrégats + scalaires SP courants. */
function buildGlobalContext(sp: SuggestionsSpCompletes | null): Record<string, string> {
  const str = (v: unknown) => (v == null ? '' : String(v));
  const cadeaux = getCadeaux(sp);
  const produits = cadeaux.filter((c) => !c._libre);
  const libres = cadeaux.filter((c) => c._libre);
  return {
    noms_cadeaux: joinNoms(cadeaux),
    noms_cadeaux_produits: joinNoms(produits),
    noms_cadeaux_libres: joinNoms(libres),
    nb_cadeaux: String(cadeaux.length),
    nb_cadeaux_produits: String(produits.length),
    nb_cadeaux_libres: String(libres.length),
    total_cadeaux: str(sp?.sp_total_cadeaux_ht),
    economie_mensuelle: str(sp?.sp_economie_mensuelle),
    economie_annuelle: str(sp?.sp_economie_annuelle),
    total_actuel: str(sp?.sp_total_actuel),
    total_propose: str(sp?.sp_total_propose),
    fournisseur: str(sp?.sp_fournisseur_propose),
    nb_lignes: str(sp?.sp_nb_lignes),
  };
}

// ── API principale ───────────────────────────────────────────────────

/**
 * Évalue et rend les clauses conditionnelles d'un template.
 * Retourne un dictionnaire `{ "sp_clause_<cle>": "texte rendu" }` prêt à être
 * fusionné à plat dans les données passées à docxtemplater.
 *
 * - Mode `global` : la clause est rendue une fois si ses conditions sont vraies,
 *   avec les jetons agrégés/scalaires (cf. buildGlobalContext).
 * - Mode `par_element` : la clause est rendue une fois par élément de la
 *   collection (jetons = champs de l'élément), jointes par `separateur`.
 *   Collection vide → chaîne vide (donc rien dans le Word).
 *
 * Plusieurs clauses partageant `cle_variable` sont concaténées (séparées par "\n").
 */
export function renderClauses(
  clauses: SpClauseConditionnelle[] | undefined,
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue: CatalogueProduit[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!clauses || clauses.length === 0) return out;

  const globalCtx = buildGlobalContext(sp);

  const ordered = [...clauses].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  for (const clause of ordered) {
    const cle = (clause.cle_variable ?? '').trim();
    if (!cle) continue;
    const varKey = `sp_clause_${cle}`;
    // On définit toujours la variable (chaîne vide par défaut) pour que la
    // balise {{sp_clause_xxx}} se résolve proprement même si rien ne s'affiche.
    if (!(varKey in out)) out[varKey] = '';

    if (!clause.actif) continue;

    // Conditions (vide = toujours vrai)
    const conditionsOk = evaluateGroupes(
      clause.groupes_conditions ?? [],
      clause.logique_conditions ?? 'ET',
      reponses,
      donneesExtraites,
      sp,
      catalogue,
    );
    if (!conditionsOk) continue;

    let rendu = '';
    if (clause.portee === 'par_element') {
      const rows = resolveCollection(clause.collection, sp);
      if (rows.length === 0) continue; // rien à afficher
      const sep = clause.separateur ?? '\n';
      rendu = rows
        .map((row) => replaceTokens(clause.texte ?? '', buildElementContext(clause.collection, row)))
        .join(sep);
    } else {
      rendu = replaceTokens(clause.texte ?? '', globalCtx);
    }

    if (!rendu) continue;
    out[varKey] = out[varKey] ? `${out[varKey]}\n${rendu}` : rendu;
  }

  return out;
}
