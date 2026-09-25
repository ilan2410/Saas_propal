export const PROPOSITION_OPTIONAL_COLUMNS = [
  'team',
  'telepro',
  'template',
  'fields',
  'status',
  'createdAt',
  'updatedAt',
  'attachments',
] as const;

export type PropositionOptionalColumn = typeof PROPOSITION_OPTIONAL_COLUMNS[number];

export const DEFAULT_PROPOSITION_COLUMNS: PropositionOptionalColumn[] = [
  'team',
  'telepro',
  'template',
  'fields',
  'status',
  'createdAt',
  'updatedAt',
  'attachments',
];

export function parsePropositionColumns(value: unknown): PropositionOptionalColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROPOSITION_COLUMNS];
  const allowed = new Set<string>(PROPOSITION_OPTIONAL_COLUMNS);
  return [...new Set(value.filter((column): column is PropositionOptionalColumn => (
    typeof column === 'string' && allowed.has(column)
  )))];
}
