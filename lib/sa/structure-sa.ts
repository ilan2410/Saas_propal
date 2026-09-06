import { z } from 'zod';
import { hasTotalBlockingIssue } from './invoice-analysis';
import type { CanonicalSaAnalysis, InvoiceAnalysisReport, NormalizedInvoiceLine } from './invoice-analysis';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setPath(target: UnknownRecord, path: string, value: unknown) {
  const parts = path.split('.').filter(Boolean);
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as UnknownRecord;
  }
  if (parts.length > 0) current[parts[parts.length - 1]] = value;
}

function getPath(target: UnknownRecord, path: string): unknown {
  let current: unknown = target;
  for (const key of path.split('.').filter(Boolean)) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function applyMappedValue(target: UnknownRecord, field: string, value: unknown) {
  const marker = field.indexOf('[]');
  if (marker < 0) {
    setPath(target, field, value);
    return;
  }
  const arrayPath = field.slice(0, marker);
  const childPath = field.slice(marker + 2).replace(/^\./, '');
  if (!childPath && Array.isArray(value)) {
    setPath(target, arrayPath, value);
    return;
  }
  if (!Array.isArray(value)) return;
  const existingRows = getPath(target, arrayPath);
  const rows: unknown[] = Array.isArray(existingRows) ? existingRows : value.map(() => ({}));
  if (!Array.isArray(existingRows)) setPath(target, arrayPath, rows);
  value.forEach((itemValue, index) => {
    if (!isRecord(rows[index])) rows[index] = {};
    setPath(rows[index] as UnknownRecord, childPath, itemValue);
  });
}

const ClientSchema = z.object({
  nom: z.string().nullable(),
  prenom: z.string().nullable(),
  email: z.string().nullable(),
  fonction: z.string().nullable(),
  mobile: z.string().nullable(),
  fixe: z.string().nullable(),
  raison_sociale: z.string().nullable(),
  adresse: z.string().nullable(),
  code_postal: z.string().nullable(),
  ville: z.string().nullable(),
  siret: z.string().nullable(),
  ape: z.string().nullable(),
  capital: z.string().nullable(),
  forme_juridique: z.string().nullable(),
  rcs: z.string().nullable(),
});

const DocumentSchema = z.object({
  type_document: z.string(),
  numero_document: z.string().nullable(),
  date_document: z.string().nullable(),
  periode_debut: z.string().nullable(),
  periode_fin: z.string().nullable(),
});

const SiteSchema = z.object({
  nom: z.string(),
  adresse: z.string().nullable(),
  code_postal: z.string().nullable(),
  ville: z.string().nullable(),
});

const LineSchema = z.object({
  numero_ligne: z.string().nullable(),
  type: z.string().nullable(),
  libelle: z.string(),
  forfait: z.string().nullable(),
  operateur: z.string().nullable(),
  site: z.string().nullable(),
  reference_contrat: z.string().nullable(),
  date_fin_engagement_source: z.string().nullable(),
});

const EngagementSchema = z.object({
  reference_contrat: z.string().nullable(),
  libelle_contrat: z.string().nullable(),
  engagement_ref: z.string().nullable(),
  libelle: z.string(),
  operateur: z.string().nullable(),
  site: z.string().nullable(),
  date_fin_engagement_source: z.string().nullable(),
  preavis_mois: z.number().nullable(),
});

export const StructuredSaSchema = z.object({
  mapped_fields: z.array(z.object({ field: z.string(), value_json: z.string().nullable() })),
  fournisseur: z.string().nullable(),
  client: ClientSchema,
  situation_actuelle: z.object({
    documents: z.array(DocumentSchema),
    operateurs: z.array(z.object({ nom: z.string(), type: z.string() })),
    leasers: z.array(z.object({ nom: z.string(), type: z.string() })),
    sites: z.array(SiteSchema),
    lignes: z.array(LineSchema),
    engagements: z.array(EngagementSchema),
  }),
  resume: z.string(),
});

const AiClientSchema = z.object({
  nom: z.string(),
  prenom: z.string(),
  email: z.string(),
  fonction: z.string(),
  mobile: z.string(),
  fixe: z.string(),
  raison_sociale: z.string(),
  adresse: z.string(),
  code_postal: z.string(),
  ville: z.string(),
  siret: z.string(),
  ape: z.string(),
  capital: z.string(),
  forme_juridique: z.string(),
  rcs: z.string(),
});

const AiDocumentSchema = z.object({
  type_document: z.string(),
  numero_document: z.string(),
  date_document: z.string(),
  periode_debut: z.string(),
  periode_fin: z.string(),
});

const AiSiteSchema = z.object({
  nom: z.string(),
  adresse: z.string(),
  code_postal: z.string(),
  ville: z.string(),
});

const AiLineSchema = z.object({
  numero_ligne: z.string(),
  type: z.string(),
  libelle: z.string(),
  forfait: z.string(),
  operateur: z.string(),
  site: z.string(),
  reference_contrat: z.string(),
  date_fin_engagement_source: z.string(),
});

const AiEngagementSchema = z.object({
  reference_contrat: z.string(),
  libelle_contrat: z.string(),
  engagement_ref: z.string(),
  libelle: z.string(),
  operateur: z.string(),
  site: z.string(),
  date_fin_engagement_source: z.string(),
  preavis_mois: z.number(),
});

export const StructuredSaAiSchema = z.object({
  mapped_fields: z.array(z.object({ field: z.string(), value_json: z.string() })),
  fournisseur: z.string(),
  client: AiClientSchema,
  situation_actuelle: z.object({
    documents: z.array(AiDocumentSchema),
    operateurs: z.array(z.object({ nom: z.string(), type: z.string() })),
    leasers: z.array(z.object({ nom: z.string(), type: z.string() })),
    sites: z.array(AiSiteSchema),
    lignes: z.array(AiLineSchema),
    engagements: z.array(AiEngagementSchema),
  }),
  resume: z.string(),
});

function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

export function normalizeStructuredSaOutput(value: z.infer<typeof StructuredSaAiSchema>): StructuredSa {
  return StructuredSaSchema.parse({
    ...value,
    mapped_fields: value.mapped_fields.map((item) => ({ ...item, value_json: emptyToNull(item.value_json) })),
    fournisseur: emptyToNull(value.fournisseur),
    client: Object.fromEntries(Object.entries(value.client).map(([key, item]) => [key, emptyToNull(item)])),
    situation_actuelle: {
      ...value.situation_actuelle,
      documents: value.situation_actuelle.documents.map((item) => ({
        ...item,
        numero_document: emptyToNull(item.numero_document),
        date_document: emptyToNull(item.date_document),
        periode_debut: emptyToNull(item.periode_debut),
        periode_fin: emptyToNull(item.periode_fin),
      })),
      sites: value.situation_actuelle.sites.map((item) => ({
        ...item,
        adresse: emptyToNull(item.adresse),
        code_postal: emptyToNull(item.code_postal),
        ville: emptyToNull(item.ville),
      })),
      lignes: value.situation_actuelle.lignes.map((item) => Object.fromEntries(
        Object.entries(item).map(([key, fieldValue]) => [key, key === 'libelle' ? fieldValue : emptyToNull(fieldValue)])
      )),
      engagements: value.situation_actuelle.engagements.map((item) => ({
        ...item,
        reference_contrat: emptyToNull(item.reference_contrat),
        libelle_contrat: emptyToNull(item.libelle_contrat),
        engagement_ref: emptyToNull(item.engagement_ref),
        operateur: emptyToNull(item.operateur),
        site: emptyToNull(item.site),
        date_fin_engagement_source: emptyToNull(item.date_fin_engagement_source),
        preavis_mois: item.preavis_mois <= 0 ? null : item.preavis_mois,
      })),
    },
  });
}

export type StructuredSa = z.infer<typeof StructuredSaSchema>;

function commonLine(line: NormalizedInvoiceLine) {
  return {
    libelle: line.label,
    operateur: line.operator,
    site: line.site,
    numero_ligne: line.phone_number,
    reference_contrat: line.contract_reference,
    quantite: line.amount_scope === 'unit' ? line.quantity : 1,
    periodicite_source: line.source_periodicity,
    periode_mois_source: line.billing_months,
    precision_montant: 'HT',
    preuve_source: line.evidence,
  };
}

export function buildLegacySaData(
  structured: StructuredSa,
  report: InvoiceAnalysisReport,
  canonical: CanonicalSaAnalysis,
  includeVariableCharges: boolean,
): Record<string, unknown> {
  const abonnements: Record<string, unknown>[] = [];
  const locations: Record<string, unknown>[] = [];
  const chargesVariables: Record<string, unknown>[] = [];

  for (const invoice of canonical.invoices) {
    for (const line of invoice.lines) {
      const common = { ...commonLine(line), document: invoice.invoice_number };
      const monthlyUnitAmount = line.amount_scope === 'unit' && line.quantity > 0
        ? Math.round((line.monthly_amount_ht / line.quantity) * 100) / 100
        : line.monthly_amount_ht;
      if (line.category === 'location') {
        locations.push({
          ...common,
          loyer_brut_source: line.amount_ht,
          loyer_brut_mensuel: monthlyUnitAmount,
          remise_mensuelle: 0,
          loyer_net_mensuel: monthlyUnitAmount,
        });
      } else if (line.category === 'variable' || line.category === 'one_time') {
        chargesVariables.push({
          ...common,
          type: line.category === 'variable' ? 'consommation_hors_forfait' : 'frais_ponctuel',
          montant_source: line.amount_ht,
          montant: line.recurring ? line.monthly_amount_ht : 0,
          recurrent: line.recurring,
        });
      } else {
        abonnements.push({
          ...common,
          type_ligne_source: line.category,
          tarif_brut_source: line.amount_ht,
          tarif_brut_mensuel: monthlyUnitAmount,
          remise_mensuelle: line.category === 'discount' ? Math.abs(monthlyUnitAmount) : 0,
          tarif_net_mensuel: monthlyUnitAmount,
        });
      }
    }
  }

  const canonicalLines = canonical.invoices.flatMap((invoice) => invoice.lines);
  const totalLocations = Math.round(canonicalLines.reduce((sum, line) =>
    line.recurring && line.category === 'location' ? sum + line.monthly_amount_ht : sum, 0) * 100) / 100;
  const totalVariables = Math.round(canonicalLines.reduce((sum, line) =>
    line.recurring && line.category === 'variable' ? sum + line.monthly_amount_ht : sum, 0) * 100) / 100;
  const totalAbonnements = Math.round(canonicalLines.reduce((sum, line) =>
    line.recurring && !['location', 'variable', 'one_time'].includes(line.category)
      ? sum + line.monthly_amount_ht
      : sum, 0) * 100) / 100;

  const result: UnknownRecord = {
    fournisseur: structured.fournisseur,
    client: structured.client,
    situation_actuelle: { ...structured.situation_actuelle },
    resume: structured.resume || report.summary,
  };
  for (const mapping of structured.mapped_fields) {
    if (mapping.value_json === null) continue;
    try {
      applyMappedValue(result, mapping.field, JSON.parse(mapping.value_json));
    } catch {
      applyMappedValue(result, mapping.field, mapping.value_json);
    }
  }

  const situation = isRecord(result.situation_actuelle) ? result.situation_actuelle : {};
  const canonicalLineItems = canonicalLines.filter((line) => line.category === 'line');
  const structuredLines = Array.isArray(situation.lignes) ? situation.lignes.filter(isRecord) : [];
  const synchronizedLines = structuredLines.map((item) => {
    const numero = typeof item.numero_ligne === 'string' ? item.numero_ligne : null;
    const libelle = typeof item.libelle === 'string' ? item.libelle : '';
    const matching = canonicalLineItems.find((line) =>
      line.phone_number && numero ? line.phone_number === numero : line.label === libelle
    );
    if (!matching) return item;
    return {
      ...item,
      tarif_net_mensuel: matching.monthly_amount_ht,
      tarif_brut_mensuel: matching.monthly_amount_ht,
      periodicite_source: matching.source_periodicity,
      periode_mois_source: matching.billing_months,
      precision_montant: 'HT',
    };
  });
  for (const line of canonicalLineItems) {
    const alreadyPresent = synchronizedLines.some((item) =>
      line.phone_number && typeof item.numero_ligne === 'string'
        ? item.numero_ligne === line.phone_number
        : item.libelle === line.label
    );
    if (!alreadyPresent) {
      synchronizedLines.push({
        numero_ligne: line.phone_number,
        type: null,
        libelle: line.label,
        forfait: null,
        operateur: line.operator,
        site: line.site,
        reference_contrat: line.contract_reference,
        date_fin_engagement_source: null,
        tarif_net_mensuel: line.monthly_amount_ht,
        tarif_brut_mensuel: line.monthly_amount_ht,
        periodicite_source: line.source_periodicity,
        periode_mois_source: line.billing_months,
        precision_montant: 'HT',
      });
    }
  }
  result.situation_actuelle = {
    ...situation,
    lignes: synchronizedLines,
    abonnements,
    locations,
    charges_variables: chargesVariables,
    total_ht_mensuel_client: canonical.total_ht_mensuel_client,
    total_abonnements: totalAbonnements,
    total_loyer_mensuel: canonical.total_ht_mensuel_client,
    total_materiel: totalLocations,
    totaux: {
      total_abonnements_source: totalAbonnements,
      total_abonnements_calcule: totalAbonnements,
      total_locations_source: totalLocations,
      total_locations_calcule: totalLocations,
      total_charges_variables_source: totalVariables,
      total_charges_variables_calcule: totalVariables,
      total_solution_actuelle_source: canonical.total_ht_mensuel_client,
      total_solution_actuelle_calcule: canonical.total_ht_mensuel_client,
      charges_variables_incluses: includeVariableCharges,
      devise: 'EUR',
      precision: 'HT',
    },
  };

  const mappedFields = new Set(structured.mapped_fields.map((mapping) => mapping.field));
  const missingStructuredFields = report.field_coverage
    .map((item) => item.field)
    .filter((field) => !mappedFields.has(field));
  const issues = [
    ...canonical.issues,
    ...missingStructuredFields.map((field) => ({
      code: 'missing_structured_field' as const,
      path: field,
      message: `Le champ actif ${field} n'a pas été structuré.`,
    })),
  ];
  result._invoice_analysis = report;
  result._structured_sa = structured;
  // Seules les anomalies qui faussent le total HT mensuel arment l'écran de
  // vérification. Les incertitudes de champs (prénom partiel, SIREN sans SIRET,
  // dates extrapolées…) restent listées dans `issues` mais ne bloquent pas.
  result._extraction_control = {
    status: hasTotalBlockingIssue(issues) ? 'review_required' : 'valid',
    total_ht_mensuel_client: canonical.total_ht_mensuel_client,
    declared_monthly_total_ht: report.declared_monthly_total_ht,
    coverage: canonical.coverage,
    issues,
    manual_override: null,
  };
  return result;
}
