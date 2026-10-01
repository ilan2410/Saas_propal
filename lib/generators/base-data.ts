import { buildSpWordData } from './sp-word-data';
import {
  isPlainObject,
  flattenForDocx,
  buildSaWordData,
  buildEntrepriseWordData,
  type UnknownRecord,
  type EntrepriseOrgFields,
} from './word-data-utils';
import { normalizePhoneNumber } from '@/lib/utils/formatting';
import type { SuggestionsSpCompletes, WordConfig } from '@/types';

export interface GenerateOptions {
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
  /** Date de création de la proposition → variables Word dynamiques {{sp_date_limite_souscription[-N]}}. */
  proposition_created_at?: string | Date | null;
  suggestions_sp_completes?: SuggestionsSpCompletes | null;
  /** Clauses conditionnelles déjà rendues : { sp_clause_<cle>: "texte" } */
  sp_clauses_rendered?: Record<string, string>;
  /** Référence proposition calculée → variable Word {{sp_reference}} (null si non configurée). */
  sp_reference?: string | null;
  /** Profil Entreprise (organizations) → variables Word {{entreprise_*}}. */
  organization_profile?: EntrepriseOrgFields | null;
}

/**
 * Construit le dictionnaire de données complet partagé entre la génération Word et
 * Excel : données SA extraites (aplaties), tableaux SA, variables + tableaux SP,
 * clauses conditionnelles rendues et référence proposition.
 *
 * Word y superpose ensuite son `mappedData` (issu de fieldMappings) ; Excel l'utilise
 * comme source de résolution (fallback) pour le mapping de cellules / tableaux.
 */
export function buildPropositionBaseData(options: GenerateOptions): UnknownRecord {
  const { template, donnees } = options;
  const baseData: UnknownRecord = isPlainObject(donnees) ? donnees : {};
  const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
  const wordCfg = fileConfig as unknown as WordConfig;

  // Données extraites aplaties (clés en pointillé pour le lookup / Docxtemplater).
  const flatData: UnknownRecord = {};
  flattenForDocx(baseData, flatData);

  // Tableaux SA remontés à plat (ex: lignes).
  const saData = buildSaWordData(baseData);
  // Variables + tableaux SP (incluant les tableaux fusionnés configurés).
  const spCompletes = (options.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
  const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
  // Clauses conditionnelles rendues : { sp_clause_<cle>: "texte" }.
  const clausesData = options.sp_clauses_rendered ?? {};
  // Référence proposition → sp_reference (chaîne vide si non configurée).
  const referenceData: Record<string, string> = { sp_reference: options.sp_reference ?? '' };
  // Profil Entreprise (organizations) → variables {{entreprise_*}}, distinctes des
  // variables client (SA) et situation proposée (SP).
  const entrepriseData = buildEntrepriseWordData(options.organization_profile);

  // Contact SA (client.email / client.mobile) : si absent (IA n'a rien extrait,
  // panneau "Coordonnées client" non renseigné), on complète avec l'adresse de
  // facturation SP déjà saisie manuellement — souvent le même contact.
  if (!flatData['client.email'] && spData['Adresse_facturation_SP_email']) {
    flatData['client.email'] = spData['Adresse_facturation_SP_email'];
  }
  if (!flatData['client.mobile'] && spData['Adresse_facturation_SP_ligne_mobile']) {
    flatData['client.mobile'] = spData['Adresse_facturation_SP_ligne_mobile'];
  }
  if (typeof flatData['client.mobile'] === 'string') {
    flatData['client.mobile'] = normalizePhoneNumber(flatData['client.mobile']);
  }
  if (typeof flatData['client.fixe'] === 'string') {
    flatData['client.fixe'] = normalizePhoneNumber(flatData['client.fixe']);
  }

  return { ...flatData, ...saData, ...spData, ...entrepriseData, ...clausesData, ...referenceData };
}
