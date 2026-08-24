// Résolution du contexte organisation pour l'utilisateur authentifié courant.
// Abstrait les deux cas possibles :
//  - propriétaire : organizations.id === auth.users.id (1:1 historique)
//  - commercial   : sous-compte lié via organization_members
import type { SupabaseClient, User } from '@supabase/supabase-js';

export type OrgRole = 'owner' | 'commercial';

export interface OrgPermissions {
  view_all_propositions: boolean;
  manage_catalogue: boolean;
  manage_templates: boolean;
  view_credits_billing: boolean;
}

export interface OrgContext {
  organizationId: string;
  role: OrgRole;
  memberId: string | null; // id de la ligne organization_members, null pour un propriétaire
  memberUserId: string | null; // = user.id pour un commercial, null pour un propriétaire
  permissions: OrgPermissions; // toujours entièrement peuplé ; tout `true` pour un propriétaire
  displayName: {
    prenom: string;
    nom: string;
    telephone_fixe: string;
    telephone_mobile: string;
  };
}

const ALL_PERMISSIONS_TRUE: OrgPermissions = {
  view_all_propositions: true,
  manage_catalogue: true,
  manage_templates: true,
  view_credits_billing: true,
};

const PERMISSION_KEYS: (keyof OrgPermissions)[] = [
  'view_all_propositions',
  'manage_catalogue',
  'manage_templates',
  'view_credits_billing',
];

export async function resolveOrgContext(
  supabase: SupabaseClient,
  user: User
): Promise<OrgContext | null> {
  // 1. Cas propriétaire : une ligne organizations dont l'id == user.id.
  const { data: ownerOrg } = await supabase
    .from('organizations')
    .select('id, commercial_default_permissions, contact_prenom, contact_nom, telephone_fixe, telephone_mobile')
    .eq('id', user.id)
    .maybeSingle();

  if (ownerOrg) {
    return {
      organizationId: user.id,
      role: 'owner',
      memberId: null,
      memberUserId: null,
      permissions: { ...ALL_PERMISSIONS_TRUE },
      displayName: {
        prenom: ownerOrg.contact_prenom ?? '',
        nom: ownerOrg.contact_nom ?? '',
        telephone_fixe: ownerOrg.telephone_fixe ?? '',
        telephone_mobile: ownerOrg.telephone_mobile ?? '',
      },
    };
  }

  // 2. Cas commercial : sous-compte actif rattaché à une organisation via organization_members.
  const { data: member } = await supabase
    .from('organization_members')
    .select('*, organizations!inner(commercial_default_permissions)')
    .eq('user_id', user.id)
    .eq('actif', true)
    .maybeSingle();

  if (member) {
    const defaults = member.organizations?.commercial_default_permissions ?? {};
    const overrides = member.permissions_override ?? {};

    const permissions = PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = overrides?.[key] ?? defaults?.[key] ?? false;
      return acc;
    }, {} as OrgPermissions);

    return {
      organizationId: member.organization_id,
      role: 'commercial',
      memberId: member.id,
      memberUserId: member.user_id,
      permissions,
      displayName: {
        prenom: member.prenom ?? '',
        nom: member.nom ?? '',
        telephone_fixe: member.telephone_fixe ?? '',
        telephone_mobile: member.telephone_mobile ?? '',
      },
    };
  }

  // 3. Ni propriétaire, ni commercial actif.
  return null;
}

/**
 * Superpose les champs de contact de l'utilisateur agissant (`ctx.displayName`) sur
 * l'objet organisation (société) chargé pour la génération de documents. Les champs
 * société (nom, siret, adresse, logo…) restent inchangés ; seuls prenom/nom de contact
 * et téléphones sont remplacés par ceux de l'acteur courant (le commercial lui-même
 * pour un sous-compte, identiques à l'existant pour un propriétaire puisque
 * `ctx.displayName` d'un propriétaire est déjà dérivé de `organizations.contact_*`).
 */
export function buildActingOrgProfile(
  organization: Record<string, unknown>,
  ctx: OrgContext
): Record<string, unknown> {
  return {
    ...organization,
    contact_prenom: ctx.displayName.prenom,
    contact_nom: ctx.displayName.nom,
    telephone_fixe: ctx.displayName.telephone_fixe,
    telephone_mobile: ctx.displayName.telephone_mobile,
  };
}
