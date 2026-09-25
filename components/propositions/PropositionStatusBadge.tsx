import { cn } from '@/lib/utils';
import { getStatutTechnique } from '@/lib/propositions/status';

/**
 * Badge du statut technique d'une proposition (chaîne de production).
 * Partagé entre la liste et la fiche.
 */
export function PropositionStatusBadge({
  statut,
  className,
}: {
  statut: string;
  className?: string;
}) {
  const config = getStatutTechnique(statut);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium',
        config.badgeClass,
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', config.iconClass)} />
      {config.label}
    </span>
  );
}
