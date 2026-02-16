import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

const TRANSACTION_STATUS_MAP: Record<string, string> = {
  succeeded: 'Succès',
  pending: 'En attente',
  failed: 'Échec',
  refunded: 'Remboursée',
  canceled: 'Annulée',
};

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function fileTypeLabel(value: unknown): string {
  if (value === 'word') return 'Word';
  if (value === 'excel') return 'Excel';
  if (value === 'pdf') return 'PDF';
  return typeof value === 'string' ? value : '';
}

function applyHeaderStyle(row: ExcelJS.Row) {
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '1D4ED8' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFF' } };
  row.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
  });
  row.commit?.();
}

function applyAltRowsFill(ws: ExcelJS.Worksheet, startRow: number, endRow: number) {
  const altFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'F7FAFC' } };
  for (let i = startRow; i <= endRow; i += 1) {
    if (i % 2 === 0) {
      ws.getRow(i).eachCell((cell) => {
        cell.fill = altFill;
      });
    }
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || null;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    })
  : null;

type StripeEnrichment = {
  invoiceNumber: string;
  invoicePdfUrl: string;
  receiptUrl: string;
  cardBrand: string;
  cardLast4: string;
  payerCountry: string;
  payerName: string;
  refundedAmountEur: number;
  refundedAt: Date | null;
  refundReason: string;
};

async function getStripeEnrichment(paymentIntentId: string): Promise<StripeEnrichment> {
  const empty: StripeEnrichment = {
    invoiceNumber: '',
    invoicePdfUrl: '',
    receiptUrl: '',
    cardBrand: '',
    cardLast4: '',
    payerCountry: '',
    payerName: '',
    refundedAmountEur: 0,
    refundedAt: null,
    refundReason: '',
  };

  if (!stripe) return empty;

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? (pi.latest_charge as Stripe.Charge) : null;

    const receiptUrl = charge && typeof charge.receipt_url === 'string' ? charge.receipt_url : '';
    const payerName = charge?.billing_details?.name ? String(charge.billing_details.name) : '';
    const payerCountry = charge?.billing_details?.address?.country ? String(charge.billing_details.address.country) : '';
    const cardBrand = charge?.payment_method_details?.card?.brand ? String(charge.payment_method_details.card.brand) : '';
    const cardLast4 = charge?.payment_method_details?.card?.last4 ? String(charge.payment_method_details.card.last4) : '';

    let invoiceNumber = '';
    let invoicePdfUrl = '';
    const chargeInvoiceRaw =
      charge && typeof (charge as unknown as { invoice?: unknown }).invoice !== 'undefined'
        ? (charge as unknown as { invoice?: unknown }).invoice
        : null;
    const invoiceId = typeof chargeInvoiceRaw === 'string' ? chargeInvoiceRaw : null;
    if (invoiceId) {
      try {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        invoiceNumber = typeof invoice.number === 'string' ? invoice.number : '';
        invoicePdfUrl = typeof invoice.invoice_pdf === 'string' ? invoice.invoice_pdf : '';
      } catch {
        invoiceNumber = '';
        invoicePdfUrl = '';
      }
    }

    let refundedAmountEur = 0;
    let refundedAt: Date | null = null;
    let refundReason = '';
    const refunds = charge?.refunds && Array.isArray(charge.refunds.data) ? charge.refunds.data : [];
    if (refunds.length > 0) {
      const latestRefund = refunds.reduce((best, r) => (r.created > best.created ? r : best), refunds[0]);
      refundedAmountEur = typeof latestRefund.amount === 'number' ? latestRefund.amount / 100 : 0;
      refundedAt = typeof latestRefund.created === 'number' ? new Date(latestRefund.created * 1000) : null;
      refundReason = latestRefund.reason ? String(latestRefund.reason) : '';
    } else if (charge?.refunded) {
      try {
        const refundsList = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 1 });
        const r = refundsList.data[0];
        if (r) {
          refundedAmountEur = typeof r.amount === 'number' ? r.amount / 100 : 0;
          refundedAt = typeof r.created === 'number' ? new Date(r.created * 1000) : null;
          refundReason = r.reason ? String(r.reason) : '';
        }
      } catch {
        refundedAmountEur = 0;
        refundedAt = null;
        refundReason = '';
      }
    }

    return {
      invoiceNumber,
      invoicePdfUrl,
      receiptUrl,
      cardBrand,
      cardLast4,
      payerCountry,
      payerName,
      refundedAmountEur,
      refundedAt,
      refundReason,
    };
  } catch {
    return empty;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const serviceSupabase = createServiceClient();

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  let startIso: string | null = null;
  let endIso: string | null = null;

  if (startParam || endParam) {
    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Paramètres de période invalides' }, { status: 400 });
    }
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() >= end.getTime()) {
      return NextResponse.json({ error: 'Paramètres de période invalides' }, { status: 400 });
    }
    startIso = start.toISOString();
    endIso = end.toISOString();
  }

  let propositionsQuery = serviceSupabase
    .from('propositions')
    .select(
      'id, template_id, created_at, exported_at, source_documents, generated_file_name, template:proposition_templates(nom, file_type)'
    )
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  let propositionsArchiveQuery = serviceSupabase
    .from('propositions_archive')
    .select('proposition_id, template_id, template_nom, template_type, created_at, exported_at, source_documents, generated_file_name')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  let transactionsQuery = serviceSupabase
    .from('stripe_transactions')
    .select('id, stripe_session_id, stripe_payment_intent_id, montant, credits_ajoutes, statut, created_at')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  if (startIso && endIso) {
    propositionsQuery = propositionsQuery.gte('created_at', startIso).lt('created_at', endIso);
    propositionsArchiveQuery = propositionsArchiveQuery.gte('created_at', startIso).lt('created_at', endIso);
    transactionsQuery = transactionsQuery.gte('created_at', startIso).lt('created_at', endIso);
  }

  const [
    { data: propositionsCurrent, error: propError },
    { data: propositionsArchived, error: archError },
    { data: templates, error: tplError },
    { data: transactions, error: txError },
    { data: organization, error: orgError },
  ] = await Promise.all([
    propositionsQuery,
    propositionsArchiveQuery,
    serviceSupabase
      .from('proposition_templates')
      .select('id, nom, file_type, statut, created_at')
      .eq('organization_id', user.id)
      .order('created_at', { ascending: false }),
    transactionsQuery,
    serviceSupabase.from('organizations').select('tarif_par_proposition').eq('id', user.id).single(),
  ]);

  if (propError || archError || tplError || txError || orgError) {
    return NextResponse.json({ error: 'Erreur lors de la récupération des données' }, { status: 500 });
  }

  const tarifParProposition = toNumber(organization?.tarif_par_proposition);

  const combinedPropositions = [
    ...(propositionsCurrent || []).map((p) => {
      const templateValue = (p as { template?: unknown }).template;
      const template =
        Array.isArray(templateValue)
          ? (templateValue[0] as Record<string, unknown> | undefined)
          : templateValue && typeof templateValue === 'object'
            ? (templateValue as Record<string, unknown>)
            : undefined;

      return {
        key: String((p as { id: unknown }).id),
        templateId: (p as { template_id?: unknown }).template_id ? String((p as { template_id: unknown }).template_id) : '',
        templateNom: typeof template?.nom === 'string' ? template.nom : '',
        templateType: fileTypeLabel(template?.file_type),
        createdAt: toDate((p as { created_at?: unknown }).created_at),
        exportedAt: toDate((p as { exported_at?: unknown }).exported_at),
        sourceDocuments: asStringArray((p as { source_documents?: unknown }).source_documents),
        generatedFileName: typeof (p as { generated_file_name?: unknown }).generated_file_name === 'string' ? String((p as { generated_file_name: unknown }).generated_file_name) : '',
      };
    }),
    ...(propositionsArchived || []).map((p) => ({
      key: String((p as { proposition_id: unknown }).proposition_id),
      templateId: (p as { template_id?: unknown }).template_id ? String((p as { template_id: unknown }).template_id) : '',
      templateNom: typeof (p as { template_nom?: unknown }).template_nom === 'string' ? String((p as { template_nom: unknown }).template_nom) : '',
      templateType: fileTypeLabel((p as { template_type?: unknown }).template_type),
      createdAt: toDate((p as { created_at?: unknown }).created_at),
      exportedAt: toDate((p as { exported_at?: unknown }).exported_at),
      sourceDocuments: asStringArray((p as { source_documents?: unknown }).source_documents),
      generatedFileName: typeof (p as { generated_file_name?: unknown }).generated_file_name === 'string' ? String((p as { generated_file_name: unknown }).generated_file_name) : '',
    })),
  ];

  const uniquePropositions = Array.from(
    new Map(combinedPropositions.map((p) => [p.key, p])).values()
  ).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  const workbook = new ExcelJS.Workbook();

  const propositionsSheet = workbook.addWorksheet('Propositions');
  propositionsSheet.columns = [
    { header: 'Template', key: 'template_nom', width: 32 },
    { header: 'Type fichier', key: 'template_type', width: 14 },
    { header: 'Créée le', key: 'created_at', width: 14 },
    { header: 'Exportée le', key: 'exported_at', width: 14 },
    { header: 'Nb documents', key: 'docs_count', width: 14 },
    { header: 'Nom fichier généré', key: 'generated_file_name', width: 34 },
  ];

  const propsRows = uniquePropositions.map((p) => ({
    template_nom: p.templateNom,
    template_type: p.templateType,
    created_at: p.createdAt,
    exported_at: p.exportedAt,
    docs_count: p.sourceDocuments.length,
    generated_file_name: p.generatedFileName,
  }));
  propositionsSheet.addRows(propsRows);

  propositionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  propositionsSheet.autoFilter = { from: 'A1', to: 'F1' };
  applyHeaderStyle(propositionsSheet.getRow(1));
  applyAltRowsFill(propositionsSheet, 2, propositionsSheet.rowCount);
  propositionsSheet.getColumn('created_at').numFmt = 'dd/mm/yyyy';
  propositionsSheet.getColumn('exported_at').numFmt = 'dd/mm/yyyy';

  const transactionsSheet = workbook.addWorksheet('Transactions');
  transactionsSheet.columns = [
    { header: 'Date', key: 'created_at', width: 14 },
    { header: 'Statut', key: 'statut', width: 16 },
    { header: 'Montant (€)', key: 'montant', width: 14 },
    { header: 'Crédits ajoutés (€)', key: 'credits_ajoutes', width: 18 },
    { header: 'N° facture', key: 'invoice_number', width: 18 },
    { header: 'PDF facture', key: 'invoice_pdf_url', width: 40 },
    { header: 'Receipt URL', key: 'receipt_url', width: 40 },
    { header: 'Moyen (brand)', key: 'pm_brand', width: 14 },
    { header: 'Moyen (last4)', key: 'pm_last4', width: 12 },
    { header: 'Pays', key: 'payer_country', width: 10 },
    { header: 'Titulaire', key: 'payer_name', width: 22 },
    { header: 'Montant remboursé (€)', key: 'refunded_amount', width: 20 },
    { header: 'Date remboursement', key: 'refunded_at', width: 16 },
    { header: 'Motif remboursement', key: 'refund_reason', width: 20 },
  ];

  const txArray = (transactions || []).map((t) => ({
    id: String((t as { id: unknown }).id),
    createdAt: toDate((t as { created_at?: unknown }).created_at),
    stripeSessionId: typeof (t as { stripe_session_id?: unknown }).stripe_session_id === 'string' ? String((t as { stripe_session_id: unknown }).stripe_session_id) : '',
    paymentIntentId:
      typeof (t as { stripe_payment_intent_id?: unknown }).stripe_payment_intent_id === 'string'
        ? String((t as { stripe_payment_intent_id: unknown }).stripe_payment_intent_id)
        : '',
    statutRaw: typeof (t as { statut?: unknown }).statut === 'string' ? String((t as { statut: unknown }).statut) : '',
    montant: toNumber((t as { montant?: unknown }).montant),
    creditsAjoutes: toNumber((t as { credits_ajoutes?: unknown }).credits_ajoutes),
  }));

  const enrichmentCache = new Map<string, Promise<StripeEnrichment>>();
  const txRows = await Promise.all(
    txArray.map(async (t) => {
      const statutLabel = TRANSACTION_STATUS_MAP[t.statutRaw] || t.statutRaw;
      const isPaid = t.statutRaw === 'succeeded';
      let enrichment: StripeEnrichment | null = null;
      if (t.paymentIntentId) {
        if (!enrichmentCache.has(t.paymentIntentId)) {
          enrichmentCache.set(t.paymentIntentId, getStripeEnrichment(t.paymentIntentId));
        }
        enrichment = await enrichmentCache.get(t.paymentIntentId)!;
      }

      return {
        created_at: t.createdAt,
        statut: statutLabel,
        montant: t.montant,
        credits_ajoutes: isPaid ? t.creditsAjoutes : null,
        invoice_number: enrichment?.invoiceNumber || '',
        invoice_pdf_url: enrichment?.invoicePdfUrl || '',
        receipt_url: enrichment?.receiptUrl || '',
        pm_brand: enrichment?.cardBrand || '',
        pm_last4: enrichment?.cardLast4 || '',
        payer_country: enrichment?.payerCountry || '',
        payer_name: enrichment?.payerName || '',
        refunded_amount: enrichment?.refundedAmountEur || 0,
        refunded_at: enrichment?.refundedAt || null,
        refund_reason: enrichment?.refundReason || '',
      };
    })
  );

  transactionsSheet.addRows(txRows);
  transactionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  transactionsSheet.autoFilter = { from: 'A1', to: 'N1' };
  applyHeaderStyle(transactionsSheet.getRow(1));
  applyAltRowsFill(transactionsSheet, 2, transactionsSheet.rowCount);
  transactionsSheet.getColumn('created_at').numFmt = 'dd/mm/yyyy';
  transactionsSheet.getColumn('montant').numFmt = '#,##0.00\\ "€"';
  transactionsSheet.getColumn('credits_ajoutes').numFmt = '#,##0.00\\ "€"';
  transactionsSheet.getColumn('refunded_amount').numFmt = '#,##0.00\\ "€"';
  transactionsSheet.getColumn('refunded_at').numFmt = 'dd/mm/yyyy';

  for (let i = 2; i <= transactionsSheet.rowCount; i += 1) {
    const row = transactionsSheet.getRow(i);
    const statut = String(row.getCell(2).value || '');
    if (statut === 'Échec' || statut === 'Annulée') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
      });
    } else if (statut === 'En attente' || statut === 'Remboursée') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDD5' } };
      });
    }
  }

  const totalMontant = txArray.reduce((acc, t) => acc + t.montant, 0);
  const totalCredits = txArray.reduce((acc, t) => acc + (t.statutRaw === 'succeeded' ? t.creditsAjoutes : 0), 0);
  const totalsStart = transactionsSheet.rowCount + 2;
  transactionsSheet.addRow([]);
  const totalsHeader = transactionsSheet.addRow(['Totaux', '', '', '']);
  totalsHeader.font = { bold: true };
  transactionsSheet.addRow(['Total montant', '', totalMontant, '']);
  transactionsSheet.addRow(['Total crédits ajoutés', '', '', totalCredits]);
  transactionsSheet.getRow(totalsStart + 1).getCell(3).numFmt = '#,##0.00\\ "€"';
  transactionsSheet.getRow(totalsStart + 2).getCell(4).numFmt = '#,##0.00\\ "€"';

  const byMonthStatus = new Map<string, { montant: number; credits: number; count: number }>();
  for (const t of txArray) {
    if (!t.createdAt) continue;
    const key = `${monthKey(t.createdAt)}|${TRANSACTION_STATUS_MAP[t.statutRaw] || t.statutRaw}`;
    const current = byMonthStatus.get(key) || { montant: 0, credits: 0, count: 0 };
    current.montant += t.montant;
    current.credits += t.statutRaw === 'succeeded' ? t.creditsAjoutes : 0;
    current.count += 1;
    byMonthStatus.set(key, current);
  }

  const subtotalsStart = transactionsSheet.rowCount + 2;
  transactionsSheet.addRow([]);
  const subtotalsTitle = transactionsSheet.addRow(['Sous-totaux par mois et statut']);
  subtotalsTitle.font = { bold: true };
  const subtotalsHeader = transactionsSheet.addRow(['Mois', 'Statut', 'Nb', 'Montant (€)', 'Crédits ajoutés (€)']);
  applyHeaderStyle(subtotalsHeader);

  const subtotalsRows = Array.from(byMonthStatus.entries())
    .map(([k, v]) => {
      const [m, s] = k.split('|');
      return { mois: m, statut: s, nb: v.count, montant: v.montant, credits: v.credits };
    })
    .sort((a, b) => a.mois.localeCompare(b.mois) || a.statut.localeCompare(b.statut));

  for (const r of subtotalsRows) {
    const row = transactionsSheet.addRow([r.mois, r.statut, r.nb, r.montant, r.credits]);
    row.getCell(4).numFmt = '#,##0.00\\ "€"';
    row.getCell(5).numFmt = '#,##0.00\\ "€"';
  }

  transactionsSheet.getCell(`A${subtotalsStart + 2}`).alignment = { vertical: 'middle' };

  const templatesSheet = workbook.addWorksheet('Templates');
  templatesSheet.columns = [
    { header: 'Nom', key: 'nom', width: 34 },
    { header: 'Type fichier', key: 'file_type', width: 14 },
    { header: 'Statut', key: 'statut', width: 14 },
    { header: 'Date création', key: 'created_at', width: 14 },
    { header: 'Nb propositions', key: 'propositions_count', width: 16 },
    { header: 'Dernière utilisation', key: 'last_used_at', width: 18 },
  ];

  const propsByTemplate = new Map<string, { count: number; lastUsedAt: Date | null }>();
  for (const p of uniquePropositions) {
    if (!p.templateId) continue;
    const current = propsByTemplate.get(p.templateId) || { count: 0, lastUsedAt: null };
    current.count += 1;
    const d = p.createdAt;
    if (d && (!current.lastUsedAt || d.getTime() > current.lastUsedAt.getTime())) current.lastUsedAt = d;
    propsByTemplate.set(p.templateId, current);
  }

  const templatesRows = (templates || []).map((t) => {
    const id = String((t as { id: unknown }).id);
    const agg = propsByTemplate.get(id) || { count: 0, lastUsedAt: null };
    return {
      nom: typeof (t as { nom?: unknown }).nom === 'string' ? String((t as { nom: unknown }).nom) : '',
      file_type: fileTypeLabel((t as { file_type?: unknown }).file_type),
      statut: typeof (t as { statut?: unknown }).statut === 'string' ? String((t as { statut: unknown }).statut) : '',
      created_at: toDate((t as { created_at?: unknown }).created_at),
      propositions_count: agg.count,
      last_used_at: agg.lastUsedAt,
    };
  });
  templatesSheet.addRows(templatesRows);
  templatesSheet.views = [{ state: 'frozen', ySplit: 1 }];
  templatesSheet.autoFilter = { from: 'A1', to: 'F1' };
  applyHeaderStyle(templatesSheet.getRow(1));
  applyAltRowsFill(templatesSheet, 2, templatesSheet.rowCount);
  templatesSheet.getColumn('created_at').numFmt = 'dd/mm/yyyy';
  templatesSheet.getColumn('last_used_at').numFmt = 'dd/mm/yyyy';

  const rapprochementSheet = workbook.addWorksheet('Rapprochement');
  rapprochementSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Montant (€)', key: 'montant', width: 14 },
    { header: 'Crédits +', key: 'credits_plus', width: 12 },
    { header: 'Crédits -', key: 'credits_minus', width: 12 },
    { header: 'Solde (cumul)', key: 'solde', width: 14 },
  ];

  const events: Array<{
    date: Date;
    type: 'Recharge' | 'Proposition';
    montant: number;
    creditsPlus: number;
    creditsMinus: number;
  }> = [];

  for (const t of txArray) {
    if (!t.createdAt) continue;
    if (t.statutRaw !== 'succeeded') continue;
    events.push({
      date: t.createdAt,
      type: 'Recharge',
      montant: t.montant,
      creditsPlus: t.creditsAjoutes,
      creditsMinus: 0,
    });
  }

  for (const p of uniquePropositions) {
    if (!p.createdAt) continue;
    events.push({
      date: p.createdAt,
      type: 'Proposition',
      montant: 0,
      creditsPlus: 0,
      creditsMinus: tarifParProposition,
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  let solde = 0;
  for (const e of events) {
    solde += e.creditsPlus - e.creditsMinus;
    rapprochementSheet.addRow({
      date: e.date,
      type: e.type,
      montant: e.montant,
      credits_plus: e.creditsPlus,
      credits_minus: e.creditsMinus,
      solde,
    });
  }

  rapprochementSheet.views = [{ state: 'frozen', ySplit: 1 }];
  rapprochementSheet.autoFilter = { from: 'A1', to: 'F1' };
  applyHeaderStyle(rapprochementSheet.getRow(1));
  applyAltRowsFill(rapprochementSheet, 2, rapprochementSheet.rowCount);
  rapprochementSheet.getColumn('date').numFmt = 'dd/mm/yyyy';
  rapprochementSheet.getColumn('montant').numFmt = '#,##0.00\\ "€"';
  rapprochementSheet.getColumn('credits_plus').numFmt = '#,##0.00\\ "€"';
  rapprochementSheet.getColumn('credits_minus').numFmt = '#,##0.00\\ "€"';
  rapprochementSheet.getColumn('solde').numFmt = '#,##0.00\\ "€"';

  const rapprochementByMonth = new Map<
    string,
    { montantRecharges: number; creditsPlus: number; creditsMinus: number; eventsCount: number }
  >();
  for (const e of events) {
    const key = monthKey(e.date);
    const current = rapprochementByMonth.get(key) || {
      montantRecharges: 0,
      creditsPlus: 0,
      creditsMinus: 0,
      eventsCount: 0,
    };
    if (e.type === 'Recharge') current.montantRecharges += e.montant;
    current.creditsPlus += e.creditsPlus;
    current.creditsMinus += e.creditsMinus;
    current.eventsCount += 1;
    rapprochementByMonth.set(key, current);
  }

  rapprochementSheet.addRow([]);
  const rapTitle = rapprochementSheet.addRow(['Totaux par période', '', '', '', '', '']);
  rapTitle.font = { bold: true };
  const rapHeader = rapprochementSheet.addRow(['Mois', 'Montant recharges (€)', 'Crédits +', 'Crédits -', 'Net crédits', 'Nb événements']);
  applyHeaderStyle(rapHeader);
  const rapRows = Array.from(rapprochementByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [m, v] of rapRows) {
    const net = v.creditsPlus - v.creditsMinus;
    const row = rapprochementSheet.addRow([m, v.montantRecharges, v.creditsPlus, v.creditsMinus, net, v.eventsCount]);
    row.getCell(2).numFmt = '#,##0.00\\ "€"';
    row.getCell(3).numFmt = '#,##0.00\\ "€"';
    row.getCell(4).numFmt = '#,##0.00\\ "€"';
    row.getCell(5).numFmt = '#,##0.00\\ "€"';
  }

  const today = new Date().toISOString().slice(0, 10);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="historique-propoboost-${today}.xlsx"`,
    },
  });
}
