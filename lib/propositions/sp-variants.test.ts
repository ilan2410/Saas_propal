import { expect, it } from 'vitest';
import { applySpVariant, type SpVariant } from './sp-variants';

it('cannot replace immutable SA fields with a variant snapshot', () => {
  const sa = { facture: { total: 177.3 }, client: { nom: 'Client' } };
  const parent = { extracted_data: sa, filled_data: { sa_total: 177.3 }, suggestions_sp_completes: { prix: 152 }, duplicated_template_url: 'original.docx' };
  const variant: SpVariant = { id: 'variant', nom: 'Éco', suggestions_sp_completes: { prix: 130 }, sp_reponses: [],
    filled_data: { sa_total: 0, facture: {}, client: { nom: 'Facturation' } }, duplicated_template_url: null, selected_sub_template_ids: null };
  const merged = applySpVariant(parent, variant);
  expect(merged.extracted_data).toBe(sa);
  expect(merged.filled_data).toEqual({ sa_total: 177.3, client: { nom: 'Facturation' } });
  expect(merged.suggestions_sp_completes).toEqual({ prix: 130 });
  expect(parent.suggestions_sp_completes).toEqual({ prix: 152 });
  expect(merged.duplicated_template_url).toBeNull();
});
