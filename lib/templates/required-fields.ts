export function withRequiredTemplateFields(secteur: string, fields: string[]): string[] {
  if (secteur !== 'telephonie') return fields;
  if (fields.some((field) => field === 'situation_actuelle' || field.startsWith('situation_actuelle.'))) {
    return fields;
  }
  return [...fields, 'situation_actuelle'];
}
