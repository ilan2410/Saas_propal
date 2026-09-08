import { z } from 'zod';

export const EvidenceSchema = z.object({
  document_index: z.number(),
  page: z.number().nullable(),
  text: z.string(),
});

export const FieldCoverageSchema = z.object({
  field: z.string(),
  status: z.enum(['found', 'not_found', 'ambiguous']),
  value_json: z.string().nullable(),
  evidence: z.array(EvidenceSchema),
  reason: z.string().nullable(),
});

export const InvoiceLineSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(['subscription', 'line', 'location', 'discount', 'variable', 'one_time', 'other']),
  amount_ht_signed: z.number().nullable(),
  amount_ttc_signed: z.number().nullable(),
  vat_rate: z.number().nullable(),
  quantity: z.number(),
  amount_scope: z.enum(['unit', 'line_total']),
  recurring: z.boolean(),
  billing_months: z.number(),
  source_periodicity: z.string(),
  related_line_id: z.string().nullable(),
  operator: z.string().nullable(),
  site: z.string().nullable(),
  phone_number: z.string().nullable(),
  contract_reference: z.string().nullable(),
  evidence: z.array(EvidenceSchema),
});

export const InvoiceAnalysisSchema = z.object({
  document_index: z.number(),
  invoice_number: z.string().nullable(),
  supplier: z.string().nullable(),
  account_number: z.string().nullable(),
  site: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  billing_months: z.number(),
  printed_total_ht: z.number().nullable(),
  printed_total_ttc: z.number().nullable(),
  lines: z.array(InvoiceLineSchema),
});

export const InvoiceAnalysisReportSchema = z.object({
  summary: z.string(),
  declared_monthly_total_ht: z.number(),
  invoices: z.array(InvoiceAnalysisSchema),
  field_coverage: z.array(FieldCoverageSchema),
});

const AiEvidenceSchema = z.object({
  document_index: z.number(),
  page: z.number(),
  text: z.string(),
});

const AiFieldCoverageSchema = z.object({
  field: z.string(),
  status: z.enum(['found', 'not_found', 'ambiguous']),
  value_json: z.string(),
  evidence: z.array(AiEvidenceSchema),
  reason: z.string(),
});

const AiInvoiceLineSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(['subscription', 'line', 'location', 'discount', 'variable', 'one_time', 'other']),
  amount_ht_signed: z.number(),
  amount_ttc_signed: z.number(),
  vat_rate: z.number(),
  quantity: z.number(),
  amount_scope: z.enum(['unit', 'line_total']),
  recurring: z.boolean(),
  billing_months: z.number(),
  source_periodicity: z.string(),
  related_line_id: z.string(),
  operator: z.string(),
  site: z.string(),
  phone_number: z.string(),
  contract_reference: z.string(),
  evidence: z.array(AiEvidenceSchema),
});

const AiInvoiceSchema = z.object({
  document_index: z.number(),
  invoice_number: z.string(),
  supplier: z.string(),
  account_number: z.string(),
  site: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  billing_months: z.number(),
  printed_total_ht: z.number(),
  printed_total_ttc: z.number(),
  lines: z.array(AiInvoiceLineSchema),
});

export const InvoiceAnalysisAiSchema = z.object({
  summary: z.string(),
  declared_monthly_total_ht: z.number(),
  invoices: z.array(AiInvoiceSchema),
  field_coverage: z.array(AiFieldCoverageSchema),
});

export function normalizeInvoiceAnalysisOutput(value: z.infer<typeof InvoiceAnalysisAiSchema>): InvoiceAnalysisReport {
  return InvoiceAnalysisReportSchema.parse({
    ...value,
    field_coverage: value.field_coverage.map((item) => ({
      ...item,
      value_json: item.value_json === '' ? null : item.value_json,
      reason: item.reason === '' ? null : item.reason,
      evidence: item.evidence.map((evidence) => ({ ...evidence, page: evidence.page <= 0 ? null : evidence.page })),
    })),
    invoices: value.invoices.map((invoice) => ({
      ...invoice,
      invoice_number: invoice.invoice_number || null,
      supplier: invoice.supplier || null,
      account_number: invoice.account_number || null,
      site: invoice.site || null,
      period_start: invoice.period_start || null,
      period_end: invoice.period_end || null,
      printed_total_ht: invoice.printed_total_ht === 0 ? null : invoice.printed_total_ht,
      printed_total_ttc: invoice.printed_total_ttc === 0 ? null : invoice.printed_total_ttc,
      lines: invoice.lines.map((line) => ({
        ...line,
        amount_ht_signed: line.amount_ht_signed === 0 && line.amount_ttc_signed !== 0 ? null : line.amount_ht_signed,
        amount_ttc_signed: line.amount_ttc_signed === 0 ? null : line.amount_ttc_signed,
        vat_rate: line.vat_rate < 0 ? null : line.vat_rate,
        related_line_id: line.related_line_id || null,
        operator: line.operator || null,
        site: line.site || null,
        phone_number: line.phone_number || null,
        contract_reference: line.contract_reference || null,
        evidence: line.evidence.map((evidence) => ({ ...evidence, page: evidence.page <= 0 ? null : evidence.page })),
      })),
    })),
  });
}

export type InvoiceAnalysisReport = z.infer<typeof InvoiceAnalysisReportSchema>;
export type InvoiceAnalysisLine = z.infer<typeof InvoiceLineSchema>;
export type FieldCoverage = z.infer<typeof FieldCoverageSchema>;

export interface NormalizedInvoiceLine extends InvoiceAnalysisLine {
  amount_ht: number;
  monthly_amount_ht: number;
}

export interface ExtractionQualityIssue {
  code: 'missing_field_coverage' | 'missing_structured_field' | 'ambiguous_field' | 'invalid_period' | 'missing_amount' | 'invoice_total_mismatch' | 'monthly_total_mismatch';
  path: string;
  message: string;
  expected?: number | string;
  actual?: number | string;
}

/**
 * Anomalies qui remettent en cause le TOTAL HT MENSUEL lui-même : ce sont les
 * seules qui déclenchent l'écran de vérification (`review_required`). Les autres
 * codes (`ambiguous_field`, `missing_field_coverage`, `missing_structured_field`)
 * concernent la complétude des champs, pas l'arithmétique du total : ils sont
 * remontés pour information mais ne bloquent jamais la suite du parcours.
 */
export const TOTAL_BLOCKING_ISSUE_CODES: ReadonlySet<ExtractionQualityIssue['code']> = new Set([
  'monthly_total_mismatch',
  'invoice_total_mismatch',
  'missing_amount',
  'invalid_period',
]);

export function hasTotalBlockingIssue(issues: readonly ExtractionQualityIssue[]): boolean {
  return issues.some((issue) => TOTAL_BLOCKING_ISSUE_CODES.has(issue.code));
}

export interface CanonicalInvoiceResult {
  document_index: number;
  invoice_number: string | null;
  monthly_total_ht: number;
  printed_total_ht: number | null;
  lines: NormalizedInvoiceLine[];
}

export interface CanonicalSaAnalysis {
  total_ht_mensuel_client: number;
  invoices: CanonicalInvoiceResult[];
  issues: ExtractionQualityIssue[];
  coverage: {
    requested: number;
    covered: number;
    not_found: number;
    ambiguous: number;
    missing: string[];
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountHt(line: InvoiceAnalysisLine): number | null {
  if (line.amount_ht_signed !== null && Number.isFinite(line.amount_ht_signed)) return line.amount_ht_signed;
  if (line.amount_ttc_signed === null || !Number.isFinite(line.amount_ttc_signed)) return null;
  const rate = typeof line.vat_rate === 'number' && Number.isFinite(line.vat_rate) ? line.vat_rate : 20;
  return line.amount_ttc_signed / (1 + rate / 100);
}

function parseFrenchDate(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function deriveBillingMonths(startValue: string | null, endValue: string | null): number | null {
  const start = parseFrenchDate(startValue);
  const end = parseFrenchDate(endValue);
  if (!start || !end || end < start) return null;
  const endInclusive = new Date(end.getTime());
  endInclusive.setUTCDate(endInclusive.getUTCDate() + 1);
  const months = (endInclusive.getUTCFullYear() - start.getUTCFullYear()) * 12
    + endInclusive.getUTCMonth() - start.getUTCMonth();
  const sameDay = endInclusive.getUTCDate() === start.getUTCDate();
  return sameDay && months > 0 ? months : null;
}

export function calculateCanonicalSaAnalysis(
  report: InvoiceAnalysisReport,
  activeFields: string[],
  includeVariableCharges = true,
): CanonicalSaAnalysis {
  const issues: ExtractionQualityIssue[] = [];
  const coverageByField = new Map(report.field_coverage.map((item) => [item.field, item]));
  const missing = activeFields.filter((field) => !coverageByField.has(field));
  for (const field of missing) {
    issues.push({ code: 'missing_field_coverage', path: field, message: `Le champ actif ${field} n'a pas été traité.` });
  }
  for (const item of report.field_coverage) {
    if (item.status === 'ambiguous') {
      issues.push({ code: 'ambiguous_field', path: item.field, message: item.reason || `Le champ ${item.field} est ambigu.` });
    }
  }

  const invoices: CanonicalInvoiceResult[] = report.invoices.map((invoice, invoiceIndex) => {
    const normalizedLines: NormalizedInvoiceLine[] = [];
    let printedComparableTotal = 0;
    let hasComparableLines = false;
    const derivedInvoiceMonths = deriveBillingMonths(invoice.period_start, invoice.period_end);
    const invoiceMonths = derivedInvoiceMonths ?? invoice.billing_months;

    invoice.lines.forEach((line, lineIndex) => {
      const rawAmount = amountHt(line);
      if (rawAmount === null) {
        issues.push({ code: 'missing_amount', path: `invoices.${invoiceIndex}.lines.${lineIndex}`, message: `Montant HT introuvable pour ${line.label}.` });
        return;
      }
      const signedAmount = line.category === 'discount' ? -Math.abs(rawAmount) : rawAmount;
      const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
      const lineTotal = line.amount_scope === 'unit' ? signedAmount * quantity : signedAmount;
      const lineMatchesInvoiceTotal = invoice.printed_total_ht !== null
        && Math.abs(Math.abs(lineTotal) - Math.abs(invoice.printed_total_ht)) <= 0.02;
      const months = line.billing_months > 0 && !(line.billing_months === 1 && invoiceMonths > 1 && lineMatchesInvoiceTotal)
        ? line.billing_months
        : invoiceMonths;
      if (!Number.isFinite(months) || months <= 0) {
        issues.push({ code: 'invalid_period', path: `invoices.${invoiceIndex}.lines.${lineIndex}.billing_months`, message: `Période invalide pour ${line.label}.` });
        return;
      }
      const monthlyAmount = lineTotal / months;
      hasComparableLines = true;
      printedComparableTotal += lineTotal;
      normalizedLines.push({ ...line, billing_months: months, amount_ht: round2(signedAmount), monthly_amount_ht: round2(monthlyAmount) });
    });

    if (invoice.printed_total_ht !== null && hasComparableLines && Math.abs(round2(printedComparableTotal) - round2(invoice.printed_total_ht)) > 0.02) {
      issues.push({
        code: 'invoice_total_mismatch',
        path: `invoices.${invoiceIndex}.printed_total_ht`,
        message: `Le détail de la facture ne correspond pas à son total HT imprimé.`,
        expected: round2(invoice.printed_total_ht),
        actual: round2(printedComparableTotal),
      });
    }

    // Le total mensuel doit correspondre exactement à ce que le client paie
    // ce mois-ci : toute ligne présente sur la facture y entre, à l'exception
    // des frais ponctuels (one_time) et, si l'utilisateur l'exclut
    // explicitement, des charges variables (hors forfait). Le champ IA
    // `recurring` n'est qu'indicatif : il ne doit jamais faire disparaître un
    // montant réellement facturé (cf. proposition avec 19,94€ de hors forfait
    // perdus car marqués `recurring: false`).
    const monthlyTotal = normalizedLines.reduce((sum, line) => {
      if (line.category === 'one_time') return sum;
      if (line.category === 'variable' && !includeVariableCharges) return sum;
      return sum + line.monthly_amount_ht;
    }, 0);

    return {
      document_index: invoice.document_index,
      invoice_number: invoice.invoice_number,
      monthly_total_ht: round2(monthlyTotal),
      printed_total_ht: invoice.printed_total_ht,
      lines: normalizedLines,
    };
  });

  const calculatedTotal = round2(invoices.reduce((sum, invoice) => sum + invoice.monthly_total_ht, 0));
  if (Math.abs(calculatedTotal - round2(report.declared_monthly_total_ht)) > 0.02) {
    issues.push({
      code: 'monthly_total_mismatch',
      path: 'declared_monthly_total_ht',
      message: `Le total HT mensuel annoncé ne correspond pas au détail recalculé.`,
      expected: calculatedTotal,
      actual: round2(report.declared_monthly_total_ht),
    });
  }

  return {
    total_ht_mensuel_client: calculatedTotal,
    invoices,
    issues,
    coverage: {
      requested: activeFields.length,
      covered: activeFields.length - missing.length,
      not_found: report.field_coverage.filter((item) => item.status === 'not_found').length,
      ambiguous: report.field_coverage.filter((item) => item.status === 'ambiguous').length,
      missing,
    },
  };
}
