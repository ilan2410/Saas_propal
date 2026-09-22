export const NOTE_TITLE_VARIABLES = [
  { key: 'client', token: '{client}', label: 'Client' },
  { key: 'date', token: '{date}', label: 'Date de création' },
  { key: 'commercial', token: '{commercial}', label: 'Commercial' },
  { key: 'template', token: '{template}', label: 'Template' },
  { key: 'statut', token: '{statut}', label: 'Statut' },
] as const;

export interface NoteTitleContext {
  client: string;
  date: string;
  commercial: string;
  template: string;
  statut: string;
}

const ALLOWED_VARIABLES: ReadonlySet<string> = new Set(NOTE_TITLE_VARIABLES.map((variable) => variable.key));

export function unsupportedNoteTitleVariables(template: string): string[] {
  return [...template.matchAll(/\{([^{}]+)\}/g)]
    .map((match) => match[1])
    .filter((key, index, values) => !ALLOWED_VARIABLES.has(key) && values.indexOf(key) === index);
}

export function renderNoteTitleTemplate(template: string, context: NoteTitleContext): string {
  const rendered = template.replace(/\{([^{}]+)\}/g, (token, key: string) => (
    ALLOWED_VARIABLES.has(key) ? context[key as keyof NoteTitleContext] : token
  ));
  return rendered.replace(/\s+/g, ' ').trim().slice(0, 255);
}

export function formatNoteTitleDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
