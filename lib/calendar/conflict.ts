export type ConflictWinner = 'internal' | 'external' | 'equal';

export function resolveCalendarConflict(
  internalUpdatedAt: string,
  externalUpdatedAt: string,
  lastSyncedInternalAt?: string | null,
  lastSyncedExternalAt?: string | null,
): ConflictWinner {
  const internal = new Date(internalUpdatedAt).getTime();
  const external = new Date(externalUpdatedAt).getTime();
  const syncedInternal = lastSyncedInternalAt ? new Date(lastSyncedInternalAt).getTime() : 0;
  const syncedExternal = lastSyncedExternalAt ? new Date(lastSyncedExternalAt).getTime() : 0;
  const internalChanged = internal > syncedInternal;
  const externalChanged = external > syncedExternal;
  if (!internalChanged && !externalChanged) return 'equal';
  if (internalChanged && !externalChanged) return 'internal';
  if (externalChanged && !internalChanged) return 'external';
  if (internal === external) return 'equal';
  return internal > external ? 'internal' : 'external';
}
