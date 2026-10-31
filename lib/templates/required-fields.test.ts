import { describe, expect, it } from 'vitest';
import { withRequiredTemplateFields } from './required-fields';
import { BUREAUTIQUE_DEFAULT_PROMPT } from './bureautique-prompt';
import { updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';

describe('champs obligatoires du template', () => {
  it('ajoute SA à la téléphonie sans doubler les champs SA existants', () => {
    expect(withRequiredTemplateFields('telephonie', ['client.nom'])).toEqual(['client.nom', 'situation_actuelle']);
    expect(withRequiredTemplateFields('telephonie', ['situation_actuelle.lignes'])).toEqual(['situation_actuelle.lignes']);
    expect(withRequiredTemplateFields('bureautique', ['materiels[].modele'])).toEqual(['materiels[].modele']);
  });

  it('produit un JSON bureautique correspondant aux champs sélectionnés', () => {
    const result = updateExpectedJsonStructureFromFields(
      BUREAUTIQUE_DEFAULT_PROMPT,
      ['client.contact.nom', 'materiels[].modele', 'facturation_clics[].prix_clic_couleur'],
      { prune: true },
    );
    const json = result.split('STRUCTURE JSON ATTENDUE:\n')[1].split('\n\nCHAMPS À EXTRAIRE:')[0];
    expect(JSON.parse(json)).toEqual({
      client: { contact: { nom: 'Nom' } },
      materiels: [{ modele: 'Modèle' }],
      facturation_clics: [{ prix_clic_couleur: 0 }],
    });
    expect(result).toContain('{documents}');
    expect(result).toContain('{liste_champs_actifs}');
  });
});
