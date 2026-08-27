// Scoping des propositions par organisation ET, pour un commercial sans la
// permission `view_all_propositions`, par créateur (created_by).
// Le propriétaire (role === 'owner') a toujours permissions.view_all_propositions
// === true (voir resolveOrgContext), donc le filtre created_by ne s'applique
// jamais pour lui : pas besoin de branche spéciale supplémentaire.
import type { OrgContext } from '@/lib/auth/org-context';

// Interface structurelle minimale : tout query builder Supabase (PostgrestFilterBuilder)
// expose `.eq(column, value)` et se retourne lui-même pour permettre le chaînage.
// On ne référence pas le type concret du SDK (générique à 7 paramètres) pour éviter
// que `tsc` ne tente de résoudre récursivement `T extends ...<T>` sur ce type complexe
// (ce qui produit "Type instantiation is excessively deep and possibly infinite").
interface EqCapable {
  eq(column: string, value: string): EqCapable;
}

/**
 * Restreint une requête Supabase sur `propositions` à l'organisation courante et,
 * pour un commercial sans la permission `view_all_propositions`, à ses propres
 * propositions (`created_by`). Le générique `T` capture le type exact du query
 * builder passé en entrée (ex. PostgrestFilterBuilder<...>) afin que l'appelant
 * puisse continuer à chaîner `.order()`, `.single()`, etc. avec un typage précis.
 */
export function scopePropositionsQuery<T>(query: T, ctx: OrgContext): T {
  const capable = query as unknown as EqCapable;

  let scoped = capable.eq('organization_id', ctx.organizationId);

  if (ctx.role === 'commercial' && !ctx.permissions.view_all_propositions) {
    // Pour un commercial actif, memberUserId est toujours renseigné
    // (= member.user_id, non nul en base) — voir resolveOrgContext.
    scoped = scoped.eq('created_by', ctx.memberUserId ?? '');
  }

  return scoped as unknown as T;
}
