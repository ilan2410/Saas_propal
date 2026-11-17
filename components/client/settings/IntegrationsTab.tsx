'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendriersTab } from '@/components/client/settings/CalendriersTab';
import { SignatureTab } from '@/components/client/settings/SignatureTab';

type IntegrationsSubTab = 'calendriers' | 'signature';

const SUB_TABS: Array<{ id: IntegrationsSubTab; label: string; icon: typeof CalendarDays }> = [
  { id: 'calendriers', label: 'Calendriers', icon: CalendarDays },
  { id: 'signature', label: 'Signature électronique', icon: PenLine },
];

export function IntegrationsTab({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sub: IntegrationsSubTab = searchParams.get('sub') === 'signature' ? 'signature' : 'calendriers';

  const select = (id: IntegrationsSubTab) => {
    router.push(`/settings?tab=integrations&sub=${id}`);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-100 px-6 pt-4" role="tablist" aria-label="Intégrations">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sub === id}
            onClick={() => select(id)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              sub === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {sub === 'calendriers' ? <CalendriersTab /> : <SignatureTab isOwner={isOwner} />}
    </div>
  );
}
