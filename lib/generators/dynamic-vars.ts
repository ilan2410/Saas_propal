// Résolution des variables Word « dynamiques » : celles dont un paramètre est
// encodé dans le nom de la balise et qui ne peuvent donc pas être pré-calculées
// dans le dictionnaire de données.
//
// Pour l'instant : la date limite de souscription.
//   {{sp_date_limite_souscription}}      -> date de création de la proposition
//   {{sp_date_limite_souscription-15}}   -> date de création + 15 jours
//   {{sp_date_limite_souscription-20}}   -> date de création + 20 jours
// Format de sortie : jj/mm/aaaa. Le calcul se fait sur le calendrier UTC pour
// rester stable quel que soit le fuseau du serveur.

const DATE_LIMITE_RE = /^sp_date_limite_souscription(?:-(\d{1,4}))?$/;

export interface DynamicVarContext {
  /** Date de création de la proposition (proposition.created_at). */
  createdAt: string | Date;
}

function formatDateUtcPlusDays(base: Date, days: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
  const jj = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const aaaa = d.getUTCFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

/**
 * Résout une balise Word dynamique. Renvoie la valeur formatée, ou `undefined`
 * si la balise n'est pas une variable dynamique connue (le rendu retombe alors
 * sur le comportement normal des variables manquantes : chaîne vide).
 */
export function resolveDynamicWordVar(tag: string, ctx: DynamicVarContext): string | undefined {
  const match = DATE_LIMITE_RE.exec(tag.trim());
  if (!match) return undefined;

  const base = typeof ctx.createdAt === 'string' ? new Date(ctx.createdAt) : ctx.createdAt;
  if (!(base instanceof Date) || Number.isNaN(base.getTime())) return undefined;

  const offsetDays = match[1] ? parseInt(match[1], 10) : 0;
  return formatDateUtcPlusDays(base, offsetDays);
}
