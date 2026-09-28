import Link from 'next/link';
import { formatCurrency, formatDate, formatFileSize, formatTokens } from '@/lib/utils/formatting';
import { formatUsd, usdToEur } from '@/lib/admin/currency';
import type { OrgUsageTotals, PropositionUsageTotals, UsageTotals } from '@/lib/admin/usage-report';

/** Un total dont un appel a un tarif inconnu est signalé, jamais présenté comme exact. */
function CostCell({ totals, rate }: { totals: UsageTotals; rate: number }) {
  return (
    <div>
      <span className="font-medium text-gray-900">{formatUsd(totals.costUsd)}</span>
      <span className="text-gray-500"> · {formatCurrency(usdToEur(totals.costUsd, rate))}</span>
      {totals.hasUnknownPricing && (
        <p className="text-xs text-orange-600">
          + {totals.unknownPricingCalls} appel(s) au tarif inconnu
        </p>
      )}
    </div>
  );
}

export function OrganizationCostTable({
  rows,
  names,
  storageByOrg,
  rate,
}: {
  rows: OrgUsageTotals[];
  names: Map<string, string>;
  storageByOrg: Map<string, number>;
  rate: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
        Aucune donnée pour cette période.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Client</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Extractions</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Tokens entrée</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Tokens sortie</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Coût Claude</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Stockage (à aujourd&apos;hui)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.organizationId}>
              <td className="px-4 py-3">
                <Link href={`/admin/clients/${row.organizationId}`} className="font-medium text-blue-600 hover:underline">
                  {names.get(row.organizationId) ?? row.organizationId}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-900">{row.extractions}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatTokens(row.totals.inputTokens)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatTokens(row.totals.outputTokens)}</td>
              <td className="px-4 py-3 text-right"><CostCell totals={row.totals} rate={rate} /></td>
              <td className="px-4 py-3 text-right text-gray-600">
                {formatFileSize(storageByOrg.get(row.organizationId) ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExtractionCostTable({
  rows,
  names,
  propositionNames,
  rate,
}: {
  rows: PropositionUsageTotals[];
  names: Map<string, string>;
  propositionNames: Map<string, string>;
  rate: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
        Aucune extraction sur cette période.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Client</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Proposition</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Modèle</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Appels</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Tokens</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.propositionId}>
              <td className="px-4 py-3 text-gray-600">{formatDate(row.lastCallAt, 'short')}</td>
              <td className="px-4 py-3 text-gray-900">
                {row.organizationId ? (names.get(row.organizationId) ?? row.organizationId) : '—'}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {propositionNames.get(row.propositionId) ?? 'Proposition supprimée'}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.models.join(', ')}</td>
              <td className="px-4 py-3 text-right text-gray-900">{row.totals.calls}</td>
              <td className="px-4 py-3 text-right text-gray-600">
                {formatTokens(row.totals.inputTokens + row.totals.outputTokens)}
              </td>
              <td className="px-4 py-3 text-right"><CostCell totals={row.totals} rate={rate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StorageByBucketList({ usage }: { usage: { bucketId: string; bytes: number; objects: number }[] }) {
  if (usage.length === 0) {
    return <p className="text-sm text-gray-500">Aucun fichier stocké.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {usage.map((bucket) => (
        <li key={bucket.bucketId} className="flex justify-between gap-4">
          <span className="text-gray-600">{bucket.bucketId}</span>
          <span className="text-gray-900">
            {formatFileSize(bucket.bytes)} <span className="text-gray-400">({bucket.objects})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
