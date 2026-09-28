/**
 * Lecture paginée.
 *
 * PostgREST tronque toute lecture à 1000 lignes par défaut, sans erreur ni
 * avertissement. Sur un écran dont la raison d'être est de vérifier une marge,
 * un total silencieusement amputé est le pire résultat possible : on pagine.
 */

const DEFAULT_PAGE_SIZE = 1000;
/** Garde-fou : au-delà, l'écran doit passer à une agrégation SQL. */
const MAX_ROWS = 50_000;

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize || rows.length >= MAX_ROWS) return rows;
    from += pageSize;
  }
}
