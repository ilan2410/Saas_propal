import { describe, it, expect } from 'vitest';
import { documentConfig, subTemplateConfig, resolveSubTemplateSelection } from './sub-templates';
describe('annex document configuration', () => {
 it('inherits business rules but never the parent document mapping', () => {
  const parent = { sp_config_loyer: { baremes: [1] }, spVariablesCustom: [{ key: 'custom' }], custom_fields: ['client'], sheetMappings: ['parent'], fieldTypes: { parent: 'text' }, fieldMappings: { parent: 'parent' } };
  const own = { sheetMappings: ['child'], fieldTypes: { child: 'date' }, sp_config_loyer: { baremes: [99] }, spVariablesCustom: [], prompt_template: 'bad' };
  expect(subTemplateConfig(parent, own)).toEqual({ sp_config_loyer: parent.sp_config_loyer, spVariablesCustom: parent.spVariablesCustom, custom_fields: parent.custom_fields, sheetMappings: own.sheetMappings, fieldTypes: own.fieldTypes });
  expect(parent.sheetMappings).toEqual(['parent']);
 });
 it('retains Excel formatting, formulas, images, and composed mappings', () => {
  const config = { preserverFormules: true, imageWidth: 80, imageHeight: 50, composedMappings: [{ cellRef: 'A1', template: 'Test' }], fieldTypes: { siret: 'text' }, prompt_template: 'private', champs_actifs: ['x'] };
  expect(documentConfig(config)).toEqual({ preserverFormules: true, imageWidth: 80, imageHeight: 50, composedMappings: config.composedMappings, fieldTypes: config.fieldTypes });
 });
});
describe('annex selection', () => {
 it('defaults to all for a new proposal, including in choose mode', () => {
  expect(resolveSubTemplateSelection(['a','b'], 'choose', null)).toEqual(['a','b']);
 });
 it('distinguishes an explicit empty selection from an uninitialized one', () => {
  expect(resolveSubTemplateSelection(['a','b'], 'choose', [])).toEqual([]);
  expect(resolveSubTemplateSelection(['a','b'], 'all', null, [])).toEqual([]);
 });
 it('includes new annexes automatically only in all mode and drops deleted annexes', () => {
  expect(resolveSubTemplateSelection(['a','new'], 'choose', ['a','deleted'])).toEqual(['a']);
  expect(resolveSubTemplateSelection(['a','new'], 'all', ['a','deleted'])).toEqual(['a','new']);
 });
});
