export type TeleprospecteurInput = {
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  actif?: boolean;
};

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Données invalides');
  const text = value.trim();
  if (text.length > maxLength) throw new Error('Données trop longues');
  return text || null;
}

export function parseTeleprospecteurInput(value: unknown, allowActive = false): TeleprospecteurInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Données invalides');
  const body = value as Record<string, unknown>;
  const prenom = optionalText(body.prenom, 100) ?? '';
  const nom = optionalText(body.nom, 100) ?? '';
  if (!prenom && !nom) throw new Error('Le prénom ou le nom est requis');
  const email = optionalText(body.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse email invalide');
  const parsed: TeleprospecteurInput = {
    prenom,
    nom,
    email,
    telephone: optionalText(body.telephone, 30),
  };
  if (allowActive && typeof body.actif === 'boolean') parsed.actif = body.actif;
  return parsed;
}

// Mise à jour partielle : seules les clés présentes dans le body sont écrites,
// pour ne pas effacer email/telephone existants lors d'un simple toggle actif.
export function parseTeleprospecteurPatch(value: unknown): Partial<TeleprospecteurInput> {
  const full = parseTeleprospecteurInput(value, true);
  const body = value as Record<string, unknown>;
  const patch: Partial<TeleprospecteurInput> = { prenom: full.prenom, nom: full.nom };
  if ('email' in body) patch.email = full.email;
  if ('telephone' in body) patch.telephone = full.telephone;
  if (full.actif !== undefined) patch.actif = full.actif;
  return patch;
}
