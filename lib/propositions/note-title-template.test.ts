import { describe, expect, it } from 'vitest';
import {
  formatNoteTitleDate,
  renderNoteTitleTemplate,
  unsupportedNoteTitleVariables,
} from './note-title-template';

const context = {
  client: 'Acme Telecom',
  date: '21/09/2026',
  commercial: 'Corine Martin',
  template: 'Offre Mobile',
  statut: 'En cours',
};

describe('note title templates', () => {
  it('combines manual text and variables', () => {
    expect(renderNoteTitleTemplate('Suivi {client} - {date} - {commercial}', context))
      .toBe('Suivi Acme Telecom - 21/09/2026 - Corine Martin');
  });

  it('reports unsupported variables', () => {
    expect(unsupportedNoteTitleVariables('{client} {inconnue} {inconnue}')).toEqual(['inconnue']);
  });

  it('formats the creation date in the selected timezone', () => {
    expect(formatNoteTitleDate(new Date('2026-09-20T22:30:00Z'), 'Europe/Paris')).toBe('21/09/2026');
  });
});
