import { describe, expect, it } from 'vitest';
import { estimatedProfitEur, propositionMetrics, type AnalyticsProposition } from './proposition-metrics';

const proposition: AnalyticsProposition = {
  id: 'prop-1',
  nom_client: null,
  extracted_data: { client: { raison_sociale: 'Entreprise extraite' } },
  filled_data: null,
  source_documents: ['doc-a.pdf', 'doc-b.pdf'],
};

describe('propositionMetrics', () => {
  it('retrouve le nom extrait quand nom_client est absent et compte les documents utilisés', () => {
    expect(propositionMetrics(proposition)).toEqual({ name: 'Entreprise extraite', documentCount: 2 });
  });

  it('donne priorité au nom saisi, puis aux données remplies, sans inventer de documents', () => {
    expect(propositionMetrics({ ...proposition, nom_client: 'Nom saisi' }).name).toBe('Nom saisi');
    expect(propositionMetrics({
      ...proposition, extracted_data: null,
      filled_data: { client: { raison_sociale: 'Entreprise remplie' } },
      source_documents: null,
    })).toEqual({ name: 'Entreprise remplie', documentCount: 0 });
  });

  it('affiche un fallback si aucun nom ne peut être trouvé', () => {
    expect(propositionMetrics({ ...proposition, extracted_data: null }).name).toBe('Sans nom');
  });
});

describe('estimatedProfitEur', () => {
  it('soustrait le coût IA en euros du tarif courant', () => {
    expect(estimatedProfitEur('5.00', 0.5, 0.92, false)).toBeCloseTo(4.54);
    expect(estimatedProfitEur(0.1, 1, 1, false)).toBeCloseTo(-0.9);
  });

  it('ne présente pas de bénéfice si le tarif ou une partie des coûts est inconnue', () => {
    expect(estimatedProfitEur(null, 0.5, 0.92, false)).toBeNull();
    expect(estimatedProfitEur(5, 0.5, 0.92, true)).toBeNull();
    expect(estimatedProfitEur('inconnu', 0.5, 0.92, false)).toBeNull();
  });
});
