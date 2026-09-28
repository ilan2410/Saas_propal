import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, Coins, Database, Hash } from 'lucide-react';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { formatCurrency, formatFileSize, formatTokens } from '@/lib/utils/formatting';
import { formatUsd, parseUsdToEurRate, usdToEur } from '@/lib/admin/currency';
import { fetchStorageUsage } from '@/lib/admin/storage-usage';
import { fetchAllRows } from '@/lib/admin/paginate';
import {
  aggregateAdminTests,
  aggregateByOrganization,
  latestExtractions,
  sumClientCostUsd,
  type UsageRow,
} from '@/lib/admin/usage-report';
import {
  ExtractionCostTable,
  OrganizationCostTable,
} from '@/components/admin/UsageCostTables';

export const revalidate = 0;

/** 'YYYY-MM' -> bornes UTC du mois. Valeur absente ou invalide : mois en cours. */
function monthBounds(periode: string | undefined): { key: string; start: string; end: string } {
  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(periode ?? '');
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const safeMonth = month >= 0 && month <= 11 ? month : now.getUTCMonth();
  const start = new Date(Date.UTC(year, safeMonth, 1));
  const end = new Date(Date.UTC(year, safeMonth + 1, 1));
  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (user.app_metadata?.role !== 'admin') redirect('/dashboard');

  const { periode } = await searchParams;
  const month = monthBounds(periode);
  const service = createServiceClient();

  const COLUMNS =
    'organization_id, proposition_id, operation, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, created_at';

  type CostOnlyRow = { cost_usd: number | null; operation: UsageRow['operation'] };

  // Lectures paginées : PostgREST tronque à 1000 lignes en silence, ce qui
  // ferait cesser de croître le coût cumulé sans le moindre signe.
  const [monthRows, allTimeRows, organizationsResult, settingsResult, storage] =
    await Promise.all([
      fetchAllRows<UsageRow>(async (from, to) => {
        const { data } = await service.from('ai_usage_events').select(COLUMNS)
          .gte('created_at', month.start).lt('created_at', month.end)
          .order('created_at', { ascending: false })
          .range(from, to);
        return (data ?? []) as unknown as UsageRow[];
      }),
      fetchAllRows<CostOnlyRow>(async (from, to) => {
        const { data } = await service.from('ai_usage_events')
          .select('cost_usd, operation')
          .order('created_at', { ascending: false })
          .range(from, to);
        return (data ?? []) as unknown as CostOnlyRow[];
      }),
      service.from('organizations').select('id, nom'),
      service.from('platform_settings').select('key, value'),
      fetchStorageUsage(service),
    ]);

  const rate = parseUsdToEurRate(
    (settingsResult.data ?? []).find((setting) => setting.key === 'usd_to_eur_rate')?.value,
  );

  const names = new Map((organizationsResult.data ?? []).map((org) => [String(org.id), String(org.nom)]));

  // Une organisation qui occupe du stockage reste listée même sans extraction
  // sur la période : sinon un client qui accumule des fichiers devient invisible.
  const storageByOrg = new Map(
    storage
      .filter((entry): entry is typeof entry & { organizationId: string } => Boolean(entry.organizationId))
      .map((entry) => [entry.organizationId, entry.totalBytes] as const),
  );
  const storedOrgIds = [...storageByOrg.keys()];

  const byOrganization = aggregateByOrganization(monthRows, storedOrgIds);
  const byExtraction = latestExtractions(monthRows, 50);
  const adminTests = aggregateAdminTests(monthRows);

  // Les noms ne sont chargés que pour les lignes affichées : un `in` construit
  // sur tout le mois dépasserait la longueur d'URL acceptée et ferait afficher
  // « Proposition supprimée » partout.
  const propositionIds = byExtraction.map((row) => row.propositionId);
  const propositionsResult = propositionIds.length
    ? await service.from('propositions').select('id, nom_client').in('id', propositionIds)
    : { data: [] as { id: string; nom_client: string | null }[] };

  const propositionNames = new Map(
    (propositionsResult.data ?? []).map((prop) => [String(prop.id), String(prop.nom_client ?? 'Sans nom')]),
  );

  const monthTotals = byOrganization.reduce(
    (acc, row) => ({
      costUsd: acc.costUsd + row.totals.costUsd,
      inputTokens: acc.inputTokens + row.totals.inputTokens,
      outputTokens: acc.outputTokens + row.totals.outputTokens,
      extractions: acc.extractions + row.extractions,
      unknownPricingCalls: acc.unknownPricingCalls + row.totals.unknownPricingCalls,
    }),
    { costUsd: 0, inputTokens: 0, outputTokens: 0, extractions: 0, unknownPricingCalls: 0 },
  );

  // Cumul hors tests admin, comme le coût du mois : les deux cartes doivent
  // rester comparables côte à côte.
  const allTime = sumClientCostUsd(allTimeRows);
  const storageTotalBytes = storage.reduce((sum, entry) => sum + entry.totalBytes, 0);
  const unattributedStorage = storage.find((entry) => entry.organizationId === null);

  /** Un total partiel ne doit jamais être présenté comme exact. */
  const reserve = (calls: number) => (calls > 0 ? ` · + ${calls} appel(s) au tarif inconnu` : '');

  const cards = [
    { label: `Coût Claude — ${month.key}`, icon: Coins,
      value: formatUsd(monthTotals.costUsd),
      hint: `${formatCurrency(usdToEur(monthTotals.costUsd, rate))}${reserve(monthTotals.unknownPricingCalls)}` },
    { label: 'Tokens du mois', icon: Hash,
      value: formatTokens(monthTotals.inputTokens + monthTotals.outputTokens),
      hint: `${formatTokens(monthTotals.inputTokens)} entrée · ${formatTokens(monthTotals.outputTokens)} sortie` },
    { label: 'Coût cumulé', icon: BarChart3,
      value: formatUsd(allTime.costUsd),
      hint: `${formatCurrency(usdToEur(allTime.costUsd, rate))} · depuis la mise en service${reserve(allTime.unknownPricingCalls)}` },
    { label: 'Stockage total', icon: Database,
      value: formatFileSize(storageTotalBytes),
      hint: unattributedStorage ? `dont ${formatFileSize(unattributedStorage.totalBytes)} non attribué` : 'entièrement attribué' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Coûts &amp; stockage</h1>
        <p className="text-gray-600 mt-2">
          Coût réel des extractions en tokens Claude et volumétrie occupée par chaque client.
          Les coûts sont comptabilisés depuis la mise en service de cet écran ; le stockage
          reflète l&apos;état actuel des fichiers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {lastMonths(12).map((value) => (
          <Link
            key={value}
            href={`/admin/analytics?periode=${value}`}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              value === month.key
                ? 'border-blue-300 bg-blue-50 font-medium text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {value}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="mt-1 text-xs text-gray-500">{card.hint}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <card.icon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Par client</h2>
        <OrganizationCostTable rows={byOrganization} names={names} storageByOrg={storageByOrg} rate={rate} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Dernières extractions</h2>
        <ExtractionCostTable rows={byExtraction} names={names} propositionNames={propositionNames} rate={rate} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Tests d&apos;extraction admin</h2>
        <p className="mt-1 text-sm text-gray-600">
          Dépense engagée par tes propres tests, exclue du coût imputé aux clients.
        </p>
        <p className="mt-3 text-sm text-gray-900">
          {adminTests.totals.calls} appel(s) · {formatUsd(adminTests.totals.costUsd)} ·{' '}
          {formatCurrency(usdToEur(adminTests.totals.costUsd, rate))}
          {adminTests.unattributedCostUsd > 0 && (
            <span className="text-gray-500">
              {' '}(dont {formatUsd(adminTests.unattributedCostUsd)} hors client)
            </span>
          )}
        </p>
      </section>
    </div>
  );
}
